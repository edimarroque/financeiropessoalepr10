// Formulário de novo lançamento / edição
import * as db from '../db.js';
import { S, recarregarLancamentos, cartaoPorId } from '../state.js';
import { hoje, gerarParcelas, situacaoPadrao, vencimentoDaCompra, fmtData, arred } from '../calc.js';
import { esc, brl, numero, modal, toast, confirmar, comCarregando } from '../ui.js';
import { sugerir } from '../categorizar.js';
import { recarregarExtras } from '../state.js';
import { orcamentoCategorias, intervalo, partes } from '../calc.js';
import { sincronizarRecorrentes } from '../servicos/recorrentes.js';
import { cotacaoUSD, usd } from '../servicos/cotacao.js';
import { comprimirFoto } from '../components/visual.js';
import { contaPorId } from '../state.js';

/** Envia o comprovante (foto reduzida ou PDF até 1 MB) e grava o caminho + miniatura no lançamento */
export async function anexarComprovante(lancId, arquivo) {
  let blob, mini = null, ext;
  if (arquivo.type === 'application/pdf') {
    if (arquivo.size > 1024 * 1024) throw new Error('PDF maior que 1 MB: guarde no Google Drive (Recibos_Comprovantes) e anexe uma foto/print aqui.');
    blob = arquivo; ext = 'pdf';
  } else ({ blob, mini, ext } = await comprimirFoto(arquivo));
  const caminho = `${S.user.id}/${lancId}.${ext}`;
  await db.enviarComprovante(caminho, blob);
  await db.atualizar('lancamentos', lancId, { comprovante: caminho, comprovante_mini: mini });
  guardarOriginalNoDrive(lancId, arquivo).catch((e) => console.warn('drive comprovante', e.message));
  return caminho;
}

/** O original (sem reduzir) vai para o Google Drive: 01_Arquivo_por_Mes/AAAA/AAAA-MM/Recibos_Comprovantes */
async function guardarOriginalNoDrive(lancId, arquivo) {
  if (!S.integracao?.drive_url || arquivo.size > 3 * 1024 * 1024) return;
  const l = S.lancs.find((x) => x.id === lancId) || {};
  const { chamarApi, paraBase64 } = await import('../servicos/api.js');
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const desc = String(l.descricao || 'comprovante').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 40);
  await chamarApi('drive', { acao: 'salvar', mes: (l.data_pagamento || hoje()).slice(0, 7), tipo: 'recibo', mime: arquivo.type || 'application/octet-stream',
    nome: `${l.data_movimento || hoje()}_${desc}_${String(l.valor || '').replace('.', ',')}.${ext}`, base64: await paraBase64(arquivo), descricao: `Comprovante do lançamento ${lancId.slice(0, 8)}` });
}

export async function abrirComprovante(caminho) {
  try { window.open(await db.linkComprovante(caminho), '_blank', 'noopener'); }
  catch (e) { toast(e.message, 'erro'); }
}

/** "#viagem, reforma #Casa" → ['viagem','reforma','casa'] */
export function lerTags(txt) {
  return [...new Set(String(txt || '').split(/[\s,;]+/).map((t) => t.replace(/^#+/, '').trim().toLowerCase()).filter((t) => t && t.length <= 30))].slice(0, 10);
}

/** Avisa quando a categoria passa de 80% ou 100% do limite mensal */
export function avisarOrcamento(categoriaId, dataPag) {
  const cat = S.categorias.find((c) => c.id === categoriaId);
  if (!cat || cat.tipo !== 'despesa' || !(Number(cat.valor_mensal) > 0) || !dataPag) return;
  const { y, m } = partes(dataPag);
  const { ini, fim } = intervalo(y, m);
  const o = orcamentoCategorias(S.lancs, [cat], ini, fim)[0];
  if (!o || o.nivel === 'ok') return;
  toast(`${o.nivel === 'estourou' ? '🚨' : '⚠️'} ${cat.emoji || ''} ${cat.nome}: ${Math.round(o.p * 100)}% do limite do mês (${brl(o.gasto)} de ${brl(o.limite)}).`, o.nivel === 'estourou' ? 'erro' : 'ok');
}

const METODOS_SAIDA = ['Pix', 'Débito', 'Boleto', 'Dinheiro', 'Transferência', 'Outro'];
const METODOS_ENTRADA = ['Pix', 'Transferência', 'Depósito', 'Dinheiro', 'Outro'];

function opcoesCategorias(tipo, sel) {
  const t = tipo === 'entrada' ? 'receita' : 'despesa';
  const cats = S.categorias.filter((c) => c.tipo === t && (c.ativo || c.id === sel));
  const grupos = [...new Set(cats.map((c) => c.grupo))];
  return `<option value="">Selecione…</option>` + grupos.map((g) => `<optgroup label="${esc(g)}">${
    cats.filter((c) => c.grupo === g).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.nome)}</option>`).join('')
  }</optgroup>`).join('');
}

function opcoesOrigem(tipo, sel) {
  const contas = S.contas.filter((c) => c.ativo || `conta:${c.id}` === sel);
  const cartoes = S.cartoes.filter((c) => c.ativo || `cartao:${c.id}` === sel);
  let h = `<option value="">Selecione…</option><optgroup label="Contas">${
    contas.map((c) => `<option value="conta:${c.id}" ${`conta:${c.id}` === sel ? 'selected' : ''}>🏦 ${esc(c.nome)}</option>`).join('')}</optgroup>`;
  if (tipo !== 'transferencia') {
    h += `<optgroup label="Cartões de crédito">${
      cartoes.map((c) => `<option value="cartao:${c.id}" ${`cartao:${c.id}` === sel ? 'selected' : ''}>💳 ${esc(c.nome)}</option>`).join('')}</optgroup>`;
  }
  return h;
}

function opcoesContas(sel, excluirId) {
  return `<option value="">Selecione…</option>` + S.contas.filter((c) => (c.ativo || c.id === sel) && c.id !== excluirId)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>🏦 ${esc(c.nome)}</option>`).join('');
}

/**
 * Abre o formulário.
 * existente: lançamento para editar (ou null para novo)
 * aoSalvar: callback depois de gravar
 */
export function abrirFormLancamento(existente, aoSalvar, padrao = {}) {
  const ed = existente || null;
  const tipoIni = ed ? (ed.tipo === 'pagamento_fatura' ? 'saida' : ed.tipo) : (padrao.tipo || 'saida');
  if (ed && ed.tipo === 'pagamento_fatura') {
    return abrirEdicaoPagamentoFatura(ed, aoSalvar);
  }
  const origemIni = ed ? (ed.cartao_id ? `cartao:${ed.cartao_id}` : (ed.conta_id ? `conta:${ed.conta_id}` : '')) : (padrao.origem || '');
  const titulo = ed ? 'Editar lançamento' : 'Novo lançamento';

  const html = `
    <form class="form" id="f-lanc" novalidate>
      <div class="seg" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="tipo" value="saida" ${tipoIni === 'saida' ? 'checked' : ''} ${ed ? 'disabled' : ''}><span>⬇️ Despesa</span></label>
        <label><input type="radio" name="tipo" value="entrada" ${tipoIni === 'entrada' ? 'checked' : ''} ${ed ? 'disabled' : ''}><span>⬆️ Receita</span></label>
        <label><input type="radio" name="tipo" value="transferencia" ${tipoIni === 'transferencia' ? 'checked' : ''} ${ed ? 'disabled' : ''}><span>🔁 Transferência</span></label>
      </div>

      <div class="linha2">
        <label>Valor ${ed && ed.parcela_total ? '(desta parcela)' : '(total)'}
          <input name="valor" inputmode="decimal" placeholder="0,00" required value="${ed ? String(ed.valor).replace('.', ',') : ''}">
        </label>
        <label>Data da compra / movimento
          <input type="date" name="data_movimento" required value="${ed ? ed.data_movimento : (padrao.data || hoje())}">
        </label>
      </div>

      <div class="linha2" data-bloco="usd" hidden>
        <label>Valor em US$ <input name="valor_usd" inputmode="decimal" placeholder="0,00" value="${ed?.valor_moeda != null ? String(ed.valor_moeda).replace('.', ',') : ''}"></label>
        <label>Cotação (R$ por US$) <input name="cotacao" inputmode="decimal" value="${String(ed?.cotacao || cotacaoUSD()).replace('.', ',')}"></label>
      </div>

      <label>Descrição
        <input name="descricao" maxlength="200" placeholder="Ex.: Supermercado BH" value="${esc(ed ? ed.descricao : '')}">
        ${ed?.descricao_original ? `<small class="dica" data-desc-original>📄 Como veio no extrato/fatura: <b>${esc(ed.descricao_original)}</b> — pode mudar a descrição à vontade; o app usa esta original para reconhecer o lançamento em novas importações.</small>` : ''}
      </label>

      <div data-bloco="normal">
        <label>Categoria
          <select name="categoria_id" required>${opcoesCategorias(tipoIni, ed?.categoria_id)}</select>
        </label>
        <label><span data-rot-origem>Pagar com</span>
          <select name="origem" required>${opcoesOrigem(tipoIni, origemIni)}</select>
        </label>
        <div class="linha2">
          <label data-bloco="metodo">Método
            <select name="metodo"></select>
          </label>
          <label data-bloco="parcelas">Parcelas
            <input type="number" name="parcelas" min="1" max="48" value="1" ${ed ? 'disabled' : ''}>
          </label>
        </div>
      </div>

      <div data-bloco="transf" class="linha2">
        <label>Sai da conta
          <select name="conta_origem">${opcoesContas(ed?.conta_id)}</select>
        </label>
        <label>Entra na conta
          <select name="conta_destino">${opcoesContas(ed?.conta_destino_id)}</select>
        </label>
      </div>

      <div class="linha2">
        <label data-bloco="data-pag">Data de pagamento
          <input type="date" name="data_pagamento" value="${ed ? ed.data_pagamento : ''}">
        </label>
        <label data-bloco="situacao">Situação
          <select name="situacao"></select>
        </label>
      </div>

      <label>Tags <small>(opcional — ex.: #viagem #reforma)</small>
        <input name="tags" maxlength="200" placeholder="#viagem #reforma" value="${esc((ed?.tags || []).map((t) => '#' + t).join(' '))}">
      </label>
      <label class="check" data-bloco="dedutivel"><input type="checkbox" name="dedutivel" ${ed?.dedutivel ? 'checked' : ''}> 🧾 Dedutível no Imposto de Renda (saúde, educação, previdência…)</label>
      <div class="comp-mini" data-bloco="comprovante">
        ${ed?.comprovante ? `${ed.comprovante_mini ? `<img src="${esc(ed.comprovante_mini)}" alt="Comprovante" data-ver-comp>` : '<button type="button" class="btn btn-peq" data-ver-comp>📄 Ver comprovante</button>'}
          <button type="button" class="btn-link" data-tirar-comp>remover</button>` : ''}
        <label class="btn btn-peq vc-upload">📎 ${ed?.comprovante ? 'Trocar' : 'Anexar'} comprovante<input type="file" accept="image/*,application/pdf" name="comprovante"></label>
        <small data-comp-nome></small>
      </div>
      ${!ed ? `<label class="check" data-bloco="recorrente"><input type="checkbox" name="recorrente"> 🔁 Repetir todo mês (aluguel, assinatura, salário…) — gera como pendente nos próximos meses</label>` : ''}
      ${ed && ed.recorrente_id ? `<p class="dica">🔁 Gerado por uma recorrência. Para mudar os próximos meses, edite em Cadastros → Recorrentes.</p>` : ''}
      ${ed && ed.lote_id ? `<p class="dica">📥 Veio de uma importação. <button type="button" class="btn-link" data-remover-lote>Remover a importação inteira</button></p>` : ''}
      <p class="dica" data-info></p>
      ${ed && ed.grupo_parcela ? `<label class="check"><input type="checkbox" name="todas"> Aplicar descrição e categoria a todas as ${ed.parcela_total} parcelas</label>` : ''}

      <div class="acoes">
        ${ed ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}
        <span class="espaco"></span>
        <button type="submit" class="btn btn-primario">Salvar</button>
      </div>
    </form>`;

  modal(titulo, html, (el, fechar) => {
    const f = el.querySelector('#f-lanc');
    const tipo = () => (f.querySelector('[name=tipo]:checked') || {}).value || tipoIni;
    const origem = () => f.origem.value;
    const ehCartao = () => origem().startsWith('cartao:');
    let dataPagEditada = !!ed;

    function preencherMetodo() {
      const lista = tipo() === 'entrada' ? METODOS_ENTRADA : METODOS_SAIDA;
      const atual = ed?.metodo || f.metodo.value;
      f.metodo.innerHTML = lista.map((m) => `<option ${m === atual ? 'selected' : ''}>${m}</option>`).join('');
    }

    function preencherSituacao() {
      const t = tipo();
      const opts = t === 'entrada' ? [['recebido', 'Recebido'], ['pendente', 'Pendente']] : [['pago', 'Pago'], ['pendente', 'Pendente']];
      const atual = ed ? ed.situacao : situacaoPadrao(t, f.data_pagamento.value || f.data_movimento.value, ehCartao());
      f.situacao.innerHTML = opts.map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${r}</option>`).join('');
    }

    function atualizar() {
      const t = tipo();
      const transf = t === 'transferencia';
      el.querySelector('[data-bloco=normal]').hidden = transf;
      el.querySelector('[data-bloco=transf]').hidden = !transf;
      el.querySelector('[data-rot-origem]').textContent = t === 'entrada' ? 'Recebido em' : 'Pagar com';
      const cartao = ehCartao();
      el.querySelector('[data-bloco=metodo]').hidden = transf || cartao;
      el.querySelector('[data-bloco=parcelas]').hidden = transf || !cartao || t !== 'saida';
      // conta em dólar: mostra valor em US$ e cotação (o valor em reais é calculado)
      const [qo, ido] = (origem() || ':').split(':');
      const usdNormal = !transf && qo === 'conta' && contaPorId(ido)?.moeda === 'USD';
      const usdTransf = transf && [f.conta_origem.value, f.conta_destino.value].some((id) => contaPorId(id)?.moeda === 'USD');
      el.querySelector('[data-bloco=usd]').hidden = !(usdNormal || usdTransf);
      el.querySelector('[data-bloco=dedutivel]').hidden = t !== 'saida';
      const br = el.querySelector('[data-bloco=recorrente]');
      if (br) br.hidden = transf || (Number(f.parcelas.value) || 1) > 1;
      // no cartão a data de pagamento é o vencimento da fatura (calculado), exceto na edição
      el.querySelector('[data-bloco=data-pag]').hidden = cartao && !ed;
      el.querySelector('[data-bloco=situacao]').hidden = cartao && !ed;
      if (!dataPagEditada && !cartao) f.data_pagamento.value = f.data_movimento.value;
      const info = el.querySelector('[data-info]');
      info.textContent = '';
      if (cartao && !ed && f.data_movimento.value) {
        const c = cartaoPorId(origem().split(':')[1]);
        const n = Number(f.parcelas.value) || 1;
        const v = numero(f.valor.value);
        const venc = vencimentoDaCompra(f.data_movimento.value, c);
        info.textContent = `Entra na fatura que vence em ${fmtData(venc)}` +
          (n > 1 && v > 0 ? ` · ${n}x de ${brl(arred(v / n))}` : '') + '.';
      }
      if (!ed) preencherSituacao();
    }

    f.querySelectorAll('[name=tipo]').forEach((r) => r.onchange = () => {
      f.categoria_id.innerHTML = opcoesCategorias(tipo(), null);
      f.origem.innerHTML = opcoesOrigem(tipo(), origem());
      preencherMetodo(); atualizar();
    });
    const calcBRL = () => {
      const u = numero(f.valor_usd.value), c = numero(f.cotacao.value);
      if (u > 0 && c > 0) { f.valor.value = String(arred(u * c)).replace('.', ','); atualizar(); }
    };
    f.valor_usd.oninput = calcBRL; f.cotacao.oninput = calcBRL;
    f.conta_origem.addEventListener('change', atualizar); f.conta_destino.addEventListener('change', atualizar);
    f.categoria_id.addEventListener('change', () => {
      const cat = S.categorias.find((c) => c.id === f.categoria_id.value);
      if (cat?.dedutivel && !ed) f.dedutivel.checked = true;
    });
    f.comprovante.onchange = () => { el.querySelector('[data-comp-nome]').textContent = f.comprovante.files[0]?.name || ''; };
    el.querySelector('[data-ver-comp]')?.addEventListener('click', () => abrirComprovante(ed.comprovante));
    el.querySelector('[data-tirar-comp]')?.addEventListener('click', async (e) => {
      if (!(await confirmar('Remover comprovante', 'Apagar o comprovante anexado?', [{ valor: 'sim', rotulo: 'Remover', classe: 'btn-perigo' }]))) return;
      await comCarregando(e.currentTarget, async () => {
        await db.apagarComprovante(ed.comprovante).catch(() => {});
        await db.atualizar('lancamentos', ed.id, { comprovante: null, comprovante_mini: null });
        ed.comprovante = null; await recarregarLancamentos();
      });
      el.querySelector('[data-bloco=comprovante]').innerHTML = '<small>Comprovante removido.</small>';
    });
    let catEscolhida = !!ed;
    f.categoria_id.addEventListener('change', () => { catEscolhida = true; });
    f.descricao.addEventListener('input', () => {
      if (catEscolhida || tipo() === 'transferencia') return;
      const sg = sugerir(f.descricao.value, tipo());
      if (sg && [...f.categoria_id.options].some((o) => o.value === sg.categoria_id)) {
        f.categoria_id.value = sg.categoria_id;
        f.categoria_id.classList.add('sugerida');
        f.categoria_id.title = sg.origem === 'regra' ? 'Sugerida por uma regra' : 'Sugerida pelo histórico';
      }
    });
    f.origem.onchange = atualizar;
    f.data_movimento.onchange = atualizar;
    f.parcelas.oninput = atualizar;
    f.valor.oninput = atualizar;
    f.data_pagamento.onchange = () => { dataPagEditada = true; if (!ed) preencherSituacao(); };

    preencherMetodo(); preencherSituacao(); atualizar();

    const bLote = el.querySelector('[data-remover-lote]');
    if (bLote) bLote.onclick = async () => {
      const { desfazer } = await import('./importar.js');
      const lote = S.lotes.find((x) => x.id === ed.lote_id);
      if (!lote) return toast('Importação não encontrada.', 'erro');
      await desfazer(lote, bLote, () => { fechar(); aoSalvar && aoSalvar(); });
    };

    // ----- excluir -----
    const btnEx = el.querySelector('[data-excluir]');
    if (btnEx) btnEx.onclick = async () => {
      let ids = [ed.id];
      if (ed.grupo_parcela) {
        const r = await confirmar('Excluir parcelado', `Este lançamento é a parcela ${ed.parcela_num} de ${ed.parcela_total}.`, [
          { valor: 'uma', rotulo: 'Só esta parcela', classe: 'btn-perigo' },
          { valor: 'todas', rotulo: 'Todas as parcelas', classe: 'btn-perigo' },
        ]);
        if (!r) return;
        if (r === 'todas') ids = S.lancs.filter((l) => l.grupo_parcela === ed.grupo_parcela).map((l) => l.id);
      } else if (!(await confirmar('Excluir lançamento', 'Tem certeza? Esta ação não pode ser desfeita.', [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
      await comCarregando(btnEx, async () => {
        await db.excluirVarios('lancamentos', ids);
        await recarregarLancamentos();
      });
      toast(ids.length > 1 ? `${ids.length} parcelas excluídas.` : 'Lançamento excluído.');
      fechar(); aoSalvar && aoSalvar();
    };

    // ----- salvar -----
    f.onsubmit = async (e) => {
      e.preventDefault();
      const t = tipo();
      const valor = numero(f.valor.value);
      if (!(valor > 0)) return toast('Informe um valor maior que zero.', 'erro');
      if (!f.data_movimento.value) return toast('Informe a data.', 'erro');
      const base = { descricao: f.descricao.value.trim(), data_movimento: f.data_movimento.value, tags: lerTags(f.tags.value),
        dedutivel: t === 'saida' && f.dedutivel.checked };
      const blocoUsd = !el.querySelector('[data-bloco=usd]').hidden;
      if (blocoUsd) {
        const u = numero(f.valor_usd.value), c = numero(f.cotacao.value);
        if (!(u > 0) || !(c > 0)) return toast('Informe o valor em US$ e a cotação.', 'erro');
        Object.assign(base, { moeda: 'USD', valor_moeda: arred(u), cotacao: c });
      } else Object.assign(base, { moeda: 'BRL', valor_moeda: null, cotacao: null });
      const arquivoComp = f.comprovante.files[0] || null;

      let linhas = [];
      if (t === 'transferencia') {
        const o = f.conta_origem.value, d = f.conta_destino.value;
        if (!o || !d) return toast('Escolha as duas contas.', 'erro');
        if (o === d) return toast('As contas de origem e destino precisam ser diferentes.', 'erro');
        const dp = f.data_pagamento.value || base.data_movimento;
        linhas = [{ ...base, tipo: t, valor: arred(valor), conta_id: o, conta_destino_id: d, cartao_id: null, categoria_id: null,
          metodo: 'Transferência', data_pagamento: dp, situacao: f.situacao.value || situacaoPadrao('saida', dp, false) }];
      } else {
        if (!f.categoria_id.value) return toast('Escolha a categoria.', 'erro');
        if (!origem()) return toast(t === 'entrada' ? 'Escolha onde foi recebido.' : 'Escolha como foi pago.', 'erro');
        const [qual, id] = origem().split(':');
        const comum = { ...base, tipo: t, categoria_id: f.categoria_id.value,
          conta_id: qual === 'conta' ? id : null, cartao_id: qual === 'cartao' ? id : null, conta_destino_id: null,
          metodo: qual === 'cartao' ? 'Crédito' : f.metodo.value };
        if (ed) {
          linhas = [{ ...comum, valor: arred(valor), data_pagamento: f.data_pagamento.value || base.data_movimento, situacao: f.situacao.value }];
        } else {
          const cartao = qual === 'cartao' ? cartaoPorId(id) : null;
          const n = t === 'saida' && cartao ? Math.min(48, Math.max(1, Number(f.parcelas.value) || 1)) : 1;
          const grupo = n > 1 ? crypto.randomUUID() : null;
          linhas = gerarParcelas({ data_movimento: base.data_movimento, valor, parcelas: n, cartao, data_pagamento: f.data_pagamento.value })
            .map((p) => ({ ...comum, ...p, grupo_parcela: grupo,
              situacao: cartao ? 'pendente' : (f.situacao.value || situacaoPadrao(t, p.data_pagamento, false)) }));
        }
      }

      await comCarregando(f.querySelector('[type=submit]'), async () => {
        if (ed) {
          await db.atualizar('lancamentos', ed.id, linhas[0]);
          if (ed.grupo_parcela && f.todas && f.todas.checked) {
            const outros = S.lancs.filter((l) => l.grupo_parcela === ed.grupo_parcela && l.id !== ed.id).map((l) => l.id);
            await db.atualizarVarios('lancamentos', outros, { descricao: linhas[0].descricao, categoria_id: linhas[0].categoria_id, tags: linhas[0].tags });
          }
        } else if (f.recorrente && f.recorrente.checked && !f.recorrente.closest('[hidden]') && linhas.length === 1 && t !== 'transferencia') {
          // vira recorrência: grava a regra e deixa o app gerar este mês e os próximos
          const L = linhas[0];
          const [rec] = await db.inserir('recorrentes', [{ descricao: L.descricao || 'Recorrente', tipo: t, valor: L.valor, categoria_id: L.categoria_id,
            conta_id: L.conta_id, cartao_id: L.cartao_id, metodo: L.metodo, dia: Number(L.data_movimento.slice(8, 10)), inicio: L.data_movimento }]);
          await recarregarExtras();
          await recarregarLancamentos();
          await sincronizarRecorrentes();
          if (L.situacao !== 'pendente') {
            const gerado = S.lancs.find((x) => x.recorrente_id === rec.id && x.data_movimento === L.data_movimento);
            if (gerado) { await db.atualizar('lancamentos', gerado.id, { situacao: L.situacao, tags: L.tags }); }
          }
        } else {
          const gravados = await db.inserir('lancamentos', linhas);
          if (arquivoComp && gravados[0]) await anexarComprovante(gravados[0].id, arquivoComp).catch((er) => toast('Lançamento salvo, mas o comprovante falhou: ' + er.message, 'erro'));
        }
        if (ed && arquivoComp) await anexarComprovante(ed.id, arquivoComp).catch((er) => toast('Lançamento salvo, mas o comprovante falhou: ' + er.message, 'erro'));
        await recarregarLancamentos();
      });
      if (t === 'saida') avisarOrcamento(linhas[0].categoria_id, linhas[0].data_pagamento);
      toast(ed ? 'Lançamento atualizado.' : (linhas.length > 1 ? `${linhas.length} parcelas lançadas.` : 'Lançamento salvo.'));
      fechar(); aoSalvar && aoSalvar();
    };
  });
}

function abrirEdicaoPagamentoFatura(ed, aoSalvar) {
  const c = cartaoPorId(ed.cartao_id);
  modal('Pagamento de fatura', `
    <p>Pagamento da fatura do <b>${esc(c ? c.nome : 'cartão')}</b> de ${brl(ed.valor)} em ${fmtData(ed.data_pagamento)}.</p>
    <p class="dica">Para corrigir, exclua este pagamento e registre de novo pela tela Cartões. Ao excluir, os itens da fatura voltam a ficar pendentes.</p>
    <div class="acoes"><span class="espaco"></span><button class="btn btn-perigo" data-excluir>Excluir pagamento</button></div>`, (el, fechar) => {
    const b = el.querySelector('[data-excluir]');
    b.onclick = async () => {
      if (!(await confirmar('Excluir pagamento', 'Os itens desta fatura voltarão a ficar pendentes.', [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
      await comCarregando(b, async () => {
        const ref = ed.chave_dedup && ed.chave_dedup.startsWith('pgto:') ? ed.chave_dedup.split(':')[2] : null;
        if (ref) {
          const itens = S.lancs.filter((l) => l.cartao_id === ed.cartao_id && l.data_pagamento === ref && l.tipo !== 'pagamento_fatura').map((l) => l.id);
          await db.atualizarVarios('lancamentos', itens, { situacao: 'pendente' });
        }
        await db.excluir('lancamentos', ed.id);
        await recarregarLancamentos();
      });
      toast('Pagamento excluído.');
      fechar(); aoSalvar && aoSalvar();
    };
  });
}
