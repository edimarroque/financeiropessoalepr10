// Formulário de novo lançamento / edição
import * as db from '../db.js';
import { S, recarregarLancamentos, cartaoPorId } from '../state.js';
import { hoje, gerarParcelas, situacaoPadrao, vencimentoDaCompra, fmtData, arred } from '../calc.js';
import { esc, brl, numero, modal, toast, confirmar, comCarregando } from '../ui.js';

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

      <label>Descrição
        <input name="descricao" maxlength="200" placeholder="Ex.: Supermercado BH" value="${esc(ed ? ed.descricao : '')}">
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
    f.origem.onchange = atualizar;
    f.data_movimento.onchange = atualizar;
    f.parcelas.oninput = atualizar;
    f.valor.oninput = atualizar;
    f.data_pagamento.onchange = () => { dataPagEditada = true; if (!ed) preencherSituacao(); };

    preencherMetodo(); preencherSituacao(); atualizar();

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
      const base = { descricao: f.descricao.value.trim(), data_movimento: f.data_movimento.value };

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
            await db.atualizarVarios('lancamentos', outros, { descricao: linhas[0].descricao, categoria_id: linhas[0].categoria_id });
          }
        } else {
          await db.inserir('lancamentos', linhas);
        }
        await recarregarLancamentos();
      });
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
