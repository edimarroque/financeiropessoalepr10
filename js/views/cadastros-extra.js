// Cadastros → Recorrentes e Regras de categoria (v1.4)
import * as db from '../db.js';
import { S, recarregarExtras, recarregarLancamentos, contaPorId, cartaoPorId, nomeCategoria } from '../state.js';
import { hoje, fmtData } from '../calc.js';
import { esc, brl, numero, modal, toast, confirmar, comCarregando } from '../ui.js';
import { sincronizarRecorrentes } from '../servicos/recorrentes.js';
import { regrasSugeridas } from '../categorizar.js';

const opCats = (tipo, sel) => {
  const t = tipo === 'entrada' ? 'receita' : 'despesa';
  return `<option value="">Selecione…</option>` + S.categorias.filter((c) => c.tipo === t && (c.ativo || c.id === sel))
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.nome)}</option>`).join('');
};
const opOrigem = (tipo, sel) => `<optgroup label="Contas">${S.contas.filter((c) => c.ativo || `conta:${c.id}` === sel).map((c) => `<option value="conta:${c.id}" ${`conta:${c.id}` === sel ? 'selected' : ''}>🏦 ${esc(c.nome)}</option>`).join('')}</optgroup>` +
  (tipo === 'saida' ? `<optgroup label="Cartões">${S.cartoes.filter((c) => c.ativo || `cartao:${c.id}` === sel).map((c) => `<option value="cartao:${c.id}" ${`cartao:${c.id}` === sel ? 'selected' : ''}>💳 ${esc(c.nome)}</option>`).join('')}</optgroup>` : '');

// =====================================================================
// Recorrentes
// =====================================================================
export function renderRecorrentes(el, rerender) {
  const lista = S.recorrentes.slice().sort((a, b) => (b.ativo - a.ativo) || a.dia - b.dia);
  const totMes = (t) => lista.filter((r) => r.ativo && r.tipo === t).reduce((s, r) => s + Number(r.valor), 0);
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Contas que se repetem todo mês (aluguel, internet, assinaturas, salário, dízimo…). O app cria cada uma como <b>pendente</b> até o mês que vem; você só marca como paga/recebida.</p>
      <button class="btn btn-primario" data-novo>+ Recorrente</button></div>
    <div class="resumo-linha"><div><small>Entradas fixas/mês</small><b class="pos">${brl(totMes('entrada'))}</b></div><div><small>Saídas fixas/mês</small><b class="neg">${brl(totMes('saida'))}</b></div><div><small>Ativas</small><b>${lista.filter((r) => r.ativo).length}</b></div></div>
    <table class="tabela">
      <thead><tr><th>Descrição</th><th class="opc">Categoria</th><th>Dia</th><th class="num">Valor</th></tr></thead>
      <tbody>${lista.map((r) => `
        <tr class="clicavel ${r.ativo ? '' : 'inativo'}" data-linha="${r.id}">
          <td><b>${r.tipo === 'entrada' ? '⬆️' : '⬇️'} ${esc(r.descricao)}</b><br><small>${r.cartao_id ? '💳 ' + esc(cartaoPorId(r.cartao_id)?.nome || '?') : '🏦 ' + esc(contaPorId(r.conta_id)?.nome || '?')}${r.fim ? ` · até ${fmtData(r.fim)}` : ''}${r.ativo ? '' : ' · pausada'}</small></td>
          <td class="opc">${esc(nomeCategoria(r.categoria_id))}</td><td>${r.dia}</td>
          <td class="num ${r.tipo === 'entrada' ? 'pos' : 'neg'}">${brl(r.valor)}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="dica">Nenhuma recorrência. Dica: ao lançar, marque “🔁 Repetir todo mês”.</td></tr>'}</tbody>
    </table>`;
  el.querySelector('[data-novo]').onclick = () => formRecorrente(null, rerender);
  el.querySelectorAll('[data-linha]').forEach((t) => t.onclick = () => formRecorrente(S.recorrentes.find((r) => r.id === t.dataset.linha), rerender));
}

function formRecorrente(r, rerender) {
  const tipoIni = r?.tipo || 'saida';
  const origemIni = r ? (r.cartao_id ? `cartao:${r.cartao_id}` : `conta:${r.conta_id}`) : '';
  modal(r ? 'Editar recorrente' : 'Nova recorrente', `
    <form class="form">
      <div class="seg seg2" role="radiogroup">
        <label><input type="radio" name="tipo" value="saida" ${tipoIni === 'saida' ? 'checked' : ''}><span>⬇️ Despesa</span></label>
        <label><input type="radio" name="tipo" value="entrada" ${tipoIni === 'entrada' ? 'checked' : ''}><span>⬆️ Receita</span></label>
      </div>
      <label>Descrição <input name="descricao" required maxlength="200" value="${esc(r?.descricao || '')}" placeholder="Ex.: Aluguel, Netflix, Salário"></label>
      <div class="linha2">
        <label>Valor <input name="valor" inputmode="decimal" required value="${r ? String(r.valor).replace('.', ',') : ''}" placeholder="0,00"></label>
        <label>Dia do mês <input type="number" name="dia" min="1" max="31" required value="${r?.dia || Number(hoje().slice(8, 10))}"></label>
      </div>
      <label>Categoria <select name="categoria_id">${opCats(tipoIni, r?.categoria_id)}</select></label>
      <div class="linha2">
        <label>Conta ou cartão <select name="origem">${opOrigem(tipoIni, origemIni)}</select></label>
        <label>Método <select name="metodo">${['Pix', 'Débito', 'Boleto', 'Débito automático', 'Transferência', 'Dinheiro', 'Outro'].map((m) => `<option ${m === r?.metodo ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      </div>
      <div class="linha2">
        <label>Começa em <input type="date" name="inicio" required value="${r?.inicio || hoje()}"></label>
        <label>Termina em <small>(opcional)</small><input type="date" name="fim" value="${r?.fim || ''}"></label>
      </div>
      ${r ? `<label class="check"><input type="checkbox" name="ativo" ${r.ativo ? 'checked' : ''}> Ativa (pausada não gera novos meses)</label>
        <label class="check"><input type="checkbox" name="aplicar" checked> Aplicar valor, descrição e categoria também nas pendentes já geradas</label>` : ''}
      <div class="acoes">${r ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    const tipo = () => f.querySelector('[name=tipo]:checked').value;
    f.querySelectorAll('[name=tipo]').forEach((x) => x.onchange = () => { f.categoria_id.innerHTML = opCats(tipo(), null); f.origem.innerHTML = opOrigem(tipo(), f.origem.value); });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const valor = numero(f.valor.value);
      if (!(valor > 0)) return toast('Informe o valor.', 'erro');
      if (!f.origem.value) return toast('Escolha a conta ou o cartão.', 'erro');
      if (f.fim.value && f.fim.value < f.inicio.value) return toast('A data de término é antes do início.', 'erro');
      const [q, id] = f.origem.value.split(':');
      const dados = { descricao: f.descricao.value.trim(), tipo: tipo(), valor, dia: Math.min(31, Math.max(1, Number(f.dia.value) || 1)),
        categoria_id: f.categoria_id.value || null, conta_id: q === 'conta' ? id : null, cartao_id: q === 'cartao' ? id : null,
        metodo: q === 'cartao' ? 'Crédito' : f.metodo.value, inicio: f.inicio.value, fim: f.fim.value || null, ativo: r ? f.ativo.checked : true };
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        if (r) {
          // mudou o início: gera de novo a partir dele
          if (dados.inicio !== r.inicio) dados.ultimo_mes = null; // duplicados são evitados pela chave de cada mês
          await db.atualizar('recorrentes', r.id, dados);
          if (f.aplicar.checked) {
            const pend = S.lancs.filter((l) => l.recorrente_id === r.id && l.situacao === 'pendente').map((l) => l.id);
            await db.atualizarVarios('lancamentos', pend, { valor, descricao: dados.descricao, categoria_id: dados.categoria_id });
          }
          if (!dados.ativo || dados.fim) {
            const apagar = S.lancs.filter((l) => l.recorrente_id === r.id && l.situacao === 'pendente' && (!dados.ativo ? l.data_movimento > hoje() : l.data_movimento > dados.fim)).map((l) => l.id);
            await db.excluirVarios('lancamentos', apagar);
          }
        } else await db.inserir('recorrentes', [dados]);
        await recarregarExtras(); await recarregarLancamentos();
        await sincronizarRecorrentes();
      });
      toast('Recorrente salva.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = async () => {
      const pend = S.lancs.filter((l) => l.recorrente_id === r.id && l.situacao === 'pendente');
      const op = await confirmar('Excluir recorrente', `Excluir “${esc(r.descricao)}”? ${pend.length ? `Há <b>${pend.length}</b> lançamento(s) pendente(s) gerado(s) por ela.` : ''}`,
        pend.length ? [{ valor: 'tudo', rotulo: 'Excluir e apagar pendentes', classe: 'btn-perigo' }, { valor: 'so', rotulo: 'Só a recorrência', classe: 'btn-perigo' }]
          : [{ valor: 'so', rotulo: 'Excluir', classe: 'btn-perigo' }]);
      if (!op) return;
      await comCarregando(bx, async () => {
        if (op === 'tudo') await db.excluirVarios('lancamentos', pend.map((l) => l.id));
        await db.excluir('recorrentes', r.id);
        await recarregarExtras(); await recarregarLancamentos();
      });
      toast('Recorrente excluída.'); fechar(); rerender();
    };
  });
}

// =====================================================================
// Regras de categoria ("aprender com os lançamentos")
// =====================================================================
export function renderRegras(el, rerender) {
  const sug = regrasSugeridas();
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Quando a descrição <b>contém</b> o texto, o app já escolhe a categoria (no lançamento manual, na importação e no Telegram). Sem regra, ele usa o histórico.</p>
      <button class="btn btn-primario" data-novo>+ Regra</button></div>
    ${sug.length ? `<div class="aprendidas"><h3>🧠 O app aprendeu com seus lançamentos</h3><p class="dica">Estas descrições sempre caem na mesma categoria. Toque em “Criar” para virar regra.</p>
      <div class="lista">${sug.map((x, i) => `<div class="item item-estatico"><div class="item-icone">🪄</div>
        <div class="item-meio"><div class="item-titulo">contém “${esc(x.contem)}” → ${esc(nomeCategoria(x.categoria_id))}</div><div class="item-sub">${x.qtd} lançamentos · ${x.tipo === 'entrada' ? 'receita' : 'despesa'}</div></div>
        <div class="item-fim"><button class="btn btn-peq" data-criar="${i}">Criar</button></div></div>`).join('')}</div>
      <button class="btn btn-peq mt" data-criar-todas>Criar todas (${sug.length})</button></div>` : ''}
    <h3>Suas regras (${S.regras.length})</h3>
    <table class="tabela"><thead><tr><th>Se a descrição contém</th><th>Categoria</th><th></th></tr></thead>
      <tbody>${S.regras.map((r) => `<tr class="clicavel" data-linha="${r.id}"><td><b>${esc(r.contem)}</b> <small>${r.tipo === 'entrada' ? 'receita' : 'despesa'}</small></td><td>${esc(nomeCategoria(r.categoria_id))}</td><td class="num"><span class="btn-icone">✎</span></td></tr>`).join('') ||
        '<tr><td colspan="3" class="dica">Nenhuma regra ainda. Ex.: “PEDAGIO” → Pedágio, “POSTO” → Combustível.</td></tr>'}</tbody></table>`;
  el.querySelector('[data-novo]').onclick = () => formRegra(null, rerender);
  el.querySelectorAll('[data-linha]').forEach((t) => t.onclick = () => formRegra(S.regras.find((r) => r.id === t.dataset.linha), rerender));
  const criar = async (lista, b) => {
    await comCarregando(b, async () => { await db.inserir('regras_categoria', lista.map(({ tipo, contem, categoria_id }) => ({ tipo, contem, categoria_id }))); await recarregarExtras(); });
    toast(`${lista.length} regra(s) criada(s).`); rerender();
  };
  el.querySelectorAll('[data-criar]').forEach((b) => b.onclick = () => criar([sug[Number(b.dataset.criar)]], b));
  const todas = el.querySelector('[data-criar-todas]');
  if (todas) todas.onclick = () => criar(sug, todas);
}

export function formRegra(r, rerender, padrao = {}) {
  const tipoIni = r?.tipo || padrao.tipo || 'saida';
  modal(r ? 'Editar regra' : 'Nova regra de categoria', `
    <form class="form">
      <div class="seg seg2"><label><input type="radio" name="tipo" value="saida" ${tipoIni === 'saida' ? 'checked' : ''}><span>⬇️ Despesa</span></label>
        <label><input type="radio" name="tipo" value="entrada" ${tipoIni === 'entrada' ? 'checked' : ''}><span>⬆️ Receita</span></label></div>
      <label>Se a descrição contém <input name="contem" required minlength="2" maxlength="100" value="${esc(r?.contem || padrao.contem || '')}" placeholder="Ex.: PEDAGIO"></label>
      <label>Usar a categoria <select name="categoria_id" required>${opCats(tipoIni, r?.categoria_id || padrao.categoria_id)}</select></label>
      <label class="check" ${r ? 'hidden' : ''}><input type="checkbox" name="aplicar"> Aplicar também nos lançamentos que já existem sem categoria</label>
      <div class="acoes">${r ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    const tipo = () => f.querySelector('[name=tipo]:checked').value;
    f.querySelectorAll('[name=tipo]').forEach((x) => x.onchange = () => { f.categoria_id.innerHTML = opCats(tipo(), null); });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const dados = { tipo: tipo(), contem: f.contem.value.trim().toUpperCase(), categoria_id: f.categoria_id.value };
      if (dados.contem.length < 2) return toast('Digite pelo menos 2 letras.', 'erro');
      if (!dados.categoria_id) return toast('Escolha a categoria.', 'erro');
      let aplicados = 0;
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        r ? await db.atualizar('regras_categoria', r.id, dados) : await db.inserir('regras_categoria', [dados]);
        await recarregarExtras();
        if (!r && f.aplicar.checked) {
          const { regraPara } = await import('../categorizar.js');
          const ids = S.lancs.filter((l) => !l.categoria_id && l.tipo === dados.tipo && regraPara(l.descricao, l.tipo)?.contem === dados.contem).map((l) => l.id);
          await db.atualizarVarios('lancamentos', ids, { categoria_id: dados.categoria_id });
          aplicados = ids.length;
          if (ids.length) await recarregarLancamentos();
        }
      });
      toast(aplicados ? `Regra salva e aplicada em ${aplicados} lançamento(s).` : 'Regra salva.'); fechar(); rerender && rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = async () => {
      if (!(await confirmar('Excluir regra', `Excluir a regra “${esc(r.contem)}”?`, [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
      await comCarregando(bx, async () => { await db.excluir('regras_categoria', r.id); await recarregarExtras(); });
      toast('Regra excluída.'); fechar(); rerender && rerender();
    };
  });
}
