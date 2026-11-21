// Tela: Cadastros (abas Receitas, Despesas, Contas Bancárias e Cartões de Crédito da planilha)
import * as db from '../db.js';
import { S, recarregarCadastros } from '../state.js';
import { saldoConta, fmtData, hoje, GRUPOS_DESPESA, GRUPOS_RECEITA } from '../calc.js';
import { esc, brl, numero, modal, toast, confirmar, comCarregando } from '../ui.js';
import { carregarCadastrosPadrao } from '../seed.js';

let aba = 'contas';

function emUso(campo, id) {
  return S.lancs.some((l) => l[campo] === id || (campo === 'conta_id' && l.conta_destino_id === id));
}

export function render(el) {
  const vazio = !S.contas.length && !S.cartoes.length && !S.categorias.length;
  el.innerHTML = `
    <div class="topo-tela"><h1>Cadastros</h1>
      <button class="btn" data-seed>${vazio ? '⬇️ Carregar cadastros da planilha' : '⬇️ Completar com cadastros da planilha'}</button>
    </div>
    ${vazio ? `<div class="aviso">Toque em <b>“Carregar cadastros da planilha”</b> para trazer suas 4 contas, 3 cartões (com fechamento, vencimento e limite) e 39 categorias. Depois ajuste o <b>saldo inicial</b> de cada conta.</div>` : ''}
    <div class="abas" role="tablist">
      ${[['contas', `🏦 Contas (${S.contas.length})`], ['cartoes', `💳 Cartões (${S.cartoes.length})`], ['despesa', `⬇️ Categorias de despesa (${S.categorias.filter((c) => c.tipo === 'despesa').length})`], ['receita', `⬆️ Categorias de receita (${S.categorias.filter((c) => c.tipo === 'receita').length})`]]
        .map(([v, r]) => `<button role="tab" class="aba ${aba === v ? 'ativa' : ''}" data-aba="${v}" aria-selected="${aba === v}">${r}</button>`).join('')}
    </div>
    <section class="cartao-bloco" data-conteudo></section>`;

  const cont = el.querySelector('[data-conteudo]');
  const rerender = () => render(el);
  el.querySelectorAll('[data-aba]').forEach((b) => b.onclick = () => { aba = b.dataset.aba; rerender(); });
  el.querySelector('[data-seed]').onclick = async (e) => {
    const b = e.currentTarget;
    const r = await comCarregando(b, async () => { const x = await carregarCadastrosPadrao(S); await recarregarCadastros(); return x; });
    const total = r.contas + r.cartoes + r.categorias;
    toast(total ? `Carregado: ${r.contas} conta(s), ${r.cartoes} cartão(ões), ${r.categorias} categoria(s).` : 'Tudo já estava cadastrado.');
    rerender();
  };

  if (aba === 'contas') renderContas(cont, rerender);
  else if (aba === 'cartoes') renderCartoes(cont, rerender);
  else renderCategorias(cont, aba, rerender);
}

// ---------------- Contas ----------------
function renderContas(el, rerender) {
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">O saldo é calculado a partir do <b>saldo inicial</b> na data informada, somando tudo que foi recebido/pago depois.</p>
      <button class="btn btn-primario" data-novo>+ Conta</button></div>
    <table class="tabela">
      <thead><tr><th>Conta</th><th class="num opc">Saldo inicial</th><th class="opc">Em</th><th class="num">Saldo hoje</th><th></th></tr></thead>
      <tbody>${S.contas.map((c) => `
        <tr class="clicavel ${c.ativo ? '' : 'inativo'}" data-linha="${c.id}">
          <td>🏦 ${esc(c.nome)}${c.ativo ? '' : ' <small>(inativa)</small>'}</td>
          <td class="num opc">${brl(c.saldo_inicial)}</td><td class="opc">${fmtData(c.data_saldo)}</td>
          <td class="num"><b>${brl(saldoConta(c, S.lancs, hoje()))}</b></td>
          <td class="num"><span class="btn-icone" aria-hidden="true">✎</span></td>
        </tr>`).join('') || '<tr><td colspan="5" class="dica">Nenhuma conta.</td></tr>'}</tbody>
    </table>`;
  el.querySelector('[data-novo]').onclick = () => formConta(null, rerender);
  el.querySelectorAll('[data-linha]').forEach((b) => b.onclick = () => formConta(S.contas.find((c) => c.id === b.dataset.linha), rerender));
}

function formConta(c, rerender) {
  modal(c ? 'Editar conta' : 'Nova conta', `
    <form class="form">
      <label>Nome <input name="nome" required maxlength="80" value="${esc(c?.nome || '')}"></label>
      <div class="linha2">
        <label>Saldo inicial <input name="saldo" inputmode="decimal" value="${c ? String(c.saldo_inicial).replace('.', ',') : '0,00'}"></label>
        <label>Saldo na data <input type="date" name="data" required value="${c?.data_saldo || hoje()}"></label>
      </div>
      <p class="dica">Dica: coloque o saldo que aparece no app do banco hoje e a data de hoje.</p>
      ${c ? `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Conta ativa</label>` : ''}
      <div class="acoes">${c ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const saldo = numero(f.saldo.value);
      if (!f.nome.value.trim()) return toast('Informe o nome.', 'erro');
      if (!Number.isFinite(saldo)) return toast('Saldo inválido.', 'erro');
      const dados = { nome: f.nome.value.trim(), saldo_inicial: saldo, data_saldo: f.data.value, ativo: c ? f.ativo.checked : true };
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        c ? await db.atualizar('contas', c.id, dados) : await db.inserir('contas', dados);
        await recarregarCadastros();
      });
      toast('Conta salva.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = () => excluirItem('contas', c, emUso('conta_id', c.id), fechar, rerender);
  });
}

// ---------------- Cartões ----------------
function renderCartoes(el, rerender) {
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Compras antes do dia de fechamento entram na fatura do mês; no dia do fechamento ou depois, na fatura seguinte.</p>
      <button class="btn btn-primario" data-novo>+ Cartão</button></div>
    <table class="tabela">
      <thead><tr><th>Cartão</th><th class="num">Fecha</th><th class="num">Vence</th><th class="num opc">Limite</th><th class="opc">Paga pela</th><th></th></tr></thead>
      <tbody>${S.cartoes.map((c) => `
        <tr class="clicavel ${c.ativo ? '' : 'inativo'}" data-linha="${c.id}">
          <td>💳 ${esc(c.nome)}${c.ativo ? '' : ' <small>(inativo)</small>'}</td><td class="num">dia ${c.dia_fechamento}</td><td class="num">dia ${c.dia_vencimento}</td>
          <td class="num opc">${brl(c.limite)}</td><td class="opc">${esc(S.contas.find((x) => x.id === c.conta_pagamento_id)?.nome || '—')}</td>
          <td class="num"><span class="btn-icone" aria-hidden="true">✎</span></td>
        </tr>`).join('') || '<tr><td colspan="6" class="dica">Nenhum cartão.</td></tr>'}</tbody>
    </table>`;
  el.querySelector('[data-novo]').onclick = () => formCartao(null, rerender);
  el.querySelectorAll('[data-linha]').forEach((b) => b.onclick = () => formCartao(S.cartoes.find((c) => c.id === b.dataset.linha), rerender));
}

function formCartao(c, rerender) {
  modal(c ? 'Editar cartão' : 'Novo cartão', `
    <form class="form">
      <label>Nome <input name="nome" required maxlength="80" value="${esc(c?.nome || '')}"></label>
      <div class="linha3">
        <label>Dia do fechamento <input type="number" name="fech" min="1" max="31" required value="${c?.dia_fechamento || ''}"></label>
        <label>Dia do vencimento <input type="number" name="venc" min="1" max="31" required value="${c?.dia_vencimento || ''}"></label>
        <label>Limite <input name="limite" inputmode="decimal" value="${c ? String(c.limite).replace('.', ',') : ''}"></label>
      </div>
      <label>Conta que paga a fatura
        <select name="conta"><option value="">—</option>${S.contas.map((x) => `<option value="${x.id}" ${x.id === c?.conta_pagamento_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
      </label>
      ${c ? `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Cartão ativo</label>` : ''}
      <div class="acoes">${c ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fech = Number(f.fech.value), venc = Number(f.venc.value), lim = numero(f.limite.value || '0');
      if (!f.nome.value.trim()) return toast('Informe o nome.', 'erro');
      if (!(fech >= 1 && fech <= 31 && venc >= 1 && venc <= 31)) return toast('Dias de fechamento e vencimento devem estar entre 1 e 31.', 'erro');
      if (!Number.isFinite(lim)) return toast('Limite inválido.', 'erro');
      const dados = { nome: f.nome.value.trim(), dia_fechamento: fech, dia_vencimento: venc, limite: lim, conta_pagamento_id: f.conta.value || null, ativo: c ? f.ativo.checked : true };
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        c ? await db.atualizar('cartoes', c.id, dados) : await db.inserir('cartoes', dados);
        await recarregarCadastros();
      });
      toast('Cartão salvo.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = () => excluirItem('cartoes', c, emUso('cartao_id', c.id), fechar, rerender);
  });
}

// ---------------- Categorias ----------------
function renderCategorias(el, tipo, rerender) {
  const grupos = tipo === 'despesa' ? GRUPOS_DESPESA : GRUPOS_RECEITA;
  const cats = S.categorias.filter((c) => c.tipo === tipo);
  const rotValor = tipo === 'despesa' ? 'Limite mensal' : 'Previsto mensal';
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">${tipo === 'despesa' ? 'O limite mensal aparece no Painel para comparar com o gasto.' : 'O valor previsto aparece no Painel para comparar com o recebido.'}</p>
      <button class="btn btn-primario" data-novo>+ Categoria</button></div>
    ${grupos.map((g) => `
      <h3>${esc(g)}</h3>
      <table class="tabela"><tbody>
        ${cats.filter((c) => c.grupo === g).map((c) => `
          <tr class="clicavel ${c.ativo ? '' : 'inativo'}" data-linha="${c.id}"><td>${esc(c.emoji)} ${esc(c.nome)}${c.ativo ? '' : ' <small>(inativa)</small>'}</td>
          <td class="num">${Number(c.valor_mensal) ? brl(c.valor_mensal) : '<small class="dica">sem ' + rotValor.toLowerCase() + '</small>'}</td>
          <td class="num"><span class="btn-icone" aria-hidden="true">✎</span></td></tr>`).join('') || '<tr><td class="dica">—</td></tr>'}
      </tbody></table>`).join('')}`;
  el.querySelector('[data-novo]').onclick = () => formCategoria(null, tipo, rerender);
  el.querySelectorAll('[data-linha]').forEach((b) => b.onclick = () => formCategoria(S.categorias.find((c) => c.id === b.dataset.linha), tipo, rerender));
}

function formCategoria(c, tipo, rerender) {
  const grupos = tipo === 'despesa' ? GRUPOS_DESPESA : GRUPOS_RECEITA;
  modal(c ? 'Editar categoria' : `Nova categoria de ${tipo}`, `
    <form class="form">
      <div class="linha-emoji">
        <label>Ícone <input name="emoji" maxlength="8" value="${esc(c?.emoji || (tipo === 'despesa' ? '🔹' : '💲'))}"></label>
        <label>Nome <input name="nome" required maxlength="80" value="${esc(c?.nome || '')}"></label>
      </div>
      <div class="linha2">
        <label>Grupo <select name="grupo">${grupos.map((g) => `<option ${g === c?.grupo ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label>${tipo === 'despesa' ? 'Limite mensal' : 'Previsto mensal'} <input name="valor" inputmode="decimal" value="${c ? String(c.valor_mensal).replace('.', ',') : '0,00'}"></label>
      </div>
      ${c ? `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Categoria ativa (inativas não aparecem para novos lançamentos)</label>` : ''}
      <div class="acoes">${c ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = numero(f.valor.value || '0');
      if (!f.nome.value.trim()) return toast('Informe o nome.', 'erro');
      if (!Number.isFinite(v)) return toast('Valor inválido.', 'erro');
      const dados = { nome: f.nome.value.trim(), emoji: f.emoji.value.trim(), grupo: f.grupo.value, valor_mensal: v, tipo, ativo: c ? f.ativo.checked : true };
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        c ? await db.atualizar('categorias', c.id, dados) : await db.inserir('categorias', dados);
        await recarregarCadastros();
      });
      toast('Categoria salva.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = () => excluirItem('categorias', c, emUso('categoria_id', c.id), fechar, rerender);
  });
}

async function excluirItem(tabela, item, usado, fechar, rerender) {
  if (usado) {
    toast('Este item tem lançamentos. Para tirar da lista, desmarque “ativo” em vez de excluir.', 'erro');
    return;
  }
  if (!(await confirmar('Excluir', `Excluir “${esc(item.nome)}”?`, [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
  try {
    await db.excluir(tabela, item.id);
    await recarregarCadastros();
    toast('Excluído.'); fechar(); rerender();
  } catch (e) { toast(e.message, 'erro'); }
}
