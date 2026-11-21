// Tela: Patrimônio — visão geral, metas, investimentos, dívidas/empréstimos e projeção de saldo (v1.5)
import * as db from '../db.js';
import { S, recarregarExtras, recarregarLancamentos, nomeCategoria } from '../state.js';
import { hoje, fmtData, arred, progressoMeta, mesesParaQuitar, projecaoSaldo, nomeMes, partes, MESES_CURTOS, montar, mesDe } from '../calc.js';
import { esc, brl, pct, numero, modal, toast, confirmar, comCarregando, barra } from '../ui.js';
import { barras, rosca, PALETA } from '../components/graficos.js';
import { composicao, saldoContaBRL, registrarPatrimonio } from '../servicos/patrimonio.js';
import { emReais, moedaFmt, cotacaoUSD } from '../servicos/cotacao.js';
import { abrirEmojis, CORES } from '../components/visual.js';

let aba = 'visao';
let horizonte = 6;

const CLASSES = { renda_fixa: ['🏦', 'Renda fixa'], renda_variavel: ['📈', 'Renda variável'], cripto: ['🪙', 'Cripto'], previdencia: ['🛡️', 'Previdência'], outro: ['💼', 'Outros'] };
const SUBTIPOS = {
  renda_fixa: ['CDB', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Prefixado', 'LCI', 'LCA', 'CRI/CRA', 'Debênture', 'Poupança', 'Conta remunerada', 'Fundo RF'],
  renda_variavel: ['Ações', 'FII', 'ETF', 'BDR', 'Stocks (EUA)', 'REIT', 'Fundo de ações'],
  cripto: ['Bitcoin', 'Ethereum', 'Stablecoin', 'Outra cripto'], previdencia: ['PGBL', 'VGBL'], outro: ['Outro'],
};
const TIPOS_DIVIDA = { emprestimo: 'Empréstimo', financiamento: 'Financiamento', cartao: 'Parcelamento de cartão', pessoa: 'Pessoa', consignado: 'Consignado', outro: 'Outro' };

const rotMes = (ref) => { const { y, m } = partes(ref + '-01'); return `${MESES_CURTOS[m - 1]}${m === 1 ? '/' + String(y).slice(2) : ''}`; };

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Patrimônio</h1><p class="dica">Quanto você tem, quanto deve e para onde está indo.</p></div></div>
    <div class="abas" role="tablist">
      ${[['visao', '💎 Visão geral'], ['metas', `🎯 Metas (${S.metas.filter((m) => !m.concluida).length})`], ['investimentos', `📈 Investimentos (${S.investimentos.filter((i) => i.ativo).length})`],
        ['dividas', `🤝 Dívidas e empréstimos (${S.dividas.filter((d) => d.ativo).length})`], ['projecao', '🔮 Projeção de saldo']]
        .map(([v, t]) => `<button class="aba ${aba === v ? 'ativa' : ''}" data-aba="${v}" role="tab" aria-selected="${aba === v}">${t}</button>`).join('')}
    </div>
    <div data-conteudo></div>`;
  const c = el.querySelector('[data-conteudo]');
  const rerender = () => render(el);
  ({ visao, metas, investimentos, dividas, projecao })[aba](c, rerender);
  el.querySelectorAll('[data-aba]').forEach((b) => b.onclick = () => { aba = b.dataset.aba; rerender(); });
}

const recarregar = async () => { await recarregarExtras(); await registrarPatrimonio(); };

// =====================================================================
// Visão geral
// =====================================================================
function visao(el) {
  const c = composicao();
  const hist = S.patrimonio.slice(-12);
  const ant = hist.length > 1 ? hist[hist.length - 2] : null;
  const varMes = ant ? c.total - Number(ant.total) : null;
  const bens = [{ nome: 'Contas', valor: Math.max(0, c.contas), cor: '#6366f1' }, { nome: 'Investimentos', valor: c.investimentos, cor: '#10b981' }, { nome: 'A receber', valor: c.aReceber, cor: '#f59e0b' }].filter((x) => x.valor > 0);
  const porClasse = Object.entries(CLASSES).map(([k, [ic, nome]], i) => ({ nome: `${ic} ${nome}`, valor: S.investimentos.filter((x) => x.ativo && x.classe === k).reduce((s, x) => s + emReais(x.valor_atual, x.moeda), 0), cor: PALETA[i] })).filter((x) => x.valor > 0);
  el.innerHTML = `
    <section class="kpis">
      <div class="kpi kpi-saldo"><small>Patrimônio líquido</small><b class="${c.total >= 0 ? '' : 'neg'}">${brl(c.total)}</b><span>${varMes === null ? 'primeiro registro' : `${varMes >= 0 ? '▲' : '▼'} ${brl(Math.abs(varMes))} vs. mês anterior`}</span></div>
      <div class="kpi kpi-contas"><small>Em contas</small><b>${brl(c.contas)}</b><span>${S.contas.filter((x) => x.ativo).length} conta(s)</span></div>
      <div class="kpi kpi-rec"><small>Investido</small><b>${brl(c.investimentos)}</b><span>${S.investimentos.filter((x) => x.ativo).length} aplicação(ões)</span></div>
      <div class="kpi kpi-desp"><small>Dívidas</small><b class="${c.dividas ? 'neg' : ''}">${brl(c.dividas)}</b><span>${c.aReceber ? `a receber ${brl(c.aReceber)}` : 'em aberto'}</span></div>
    </section>
    <div class="grade2">
      <section class="cartao-bloco span2"><h2>Evolução do patrimônio líquido</h2>
        ${hist.length ? barras(hist.map((h) => rotMes(h.mes)), [{ nome: 'Contas', cor: 'var(--acento)', valores: hist.map((h) => Number(h.contas)) }, { nome: 'Investimentos', cor: 'var(--verde)', valores: hist.map((h) => Number(h.investimentos)) }, { nome: 'Dívidas', cor: 'var(--vermelho)', valores: hist.map((h) => -Number(h.dividas)) }],
          { linha: { nome: 'Patrimônio líquido', cor: 'var(--acento-2)', valores: hist.map((h) => Number(h.total)) }, destaque: hist.length - 1 }) : '<p class="dica">O app registra o patrimônio todo mês automaticamente.</p>'}
      </section>
      <section class="cartao-bloco"><h2>Composição dos bens</h2>${rosca(bens, { centro: brl(bens.reduce((s, x) => s + x.valor, 0)), sub: 'bens' })}</section>
      <section class="cartao-bloco"><h2>Investimentos por classe</h2>${rosca(porClasse, { centro: brl(c.investimentos), sub: 'investido' })}</section>
      <section class="cartao-bloco span2"><div class="cab-lista"><h2>Metas</h2><button class="btn btn-peq" data-ir="metas">Ver metas →</button></div>
        ${S.metas.filter((m) => !m.concluida).slice(0, 4).map((m) => metaLinha(m)).join('') || '<p class="dica">Nenhuma meta ainda. Crie em “Metas”.</p>'}</section>
    </div>
    ${S.contas.some((x) => x.moeda === 'USD') || S.investimentos.some((x) => x.moeda === 'USD') ? `<p class="dica">Valores em dólar convertidos pela cotação de ${brl(cotacaoUSD())}.</p>` : ''}`;
  el.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => { aba = b.dataset.ir; el.closest('#tela') && render(el.closest('#tela')); });
}

function metaLinha(m) {
  const p = progressoMeta(m, S.metasMov);
  return `<div class="linha-grupo"><div class="lg-topo"><span>${esc(m.emoji)} ${esc(m.nome)}</span><span><b>${brl(p.atual)}</b> de ${brl(p.alvo)} · ${pct(p.p)}</span></div>
    <div class="barra"><div class="barra-preench" style="width:${(p.p * 100).toFixed(1)}%;background:${esc(m.cor)}"></div></div>
    <small>${m.prazo ? (p.atrasada ? `⏰ prazo passou (${fmtData(m.prazo)})` : `até ${fmtData(m.prazo)} · guardar ${brl(p.mensalNecessario)}/mês`) : 'sem prazo'}</small></div>`;
}

// =====================================================================
// Metas
// =====================================================================
function metas(el, rerender) {
  const abertas = S.metas.filter((m) => !m.concluida), feitas = S.metas.filter((m) => m.concluida);
  const mensal = abertas.reduce((s, m) => s + (progressoMeta(m, S.metasMov).mensalNecessario || 0), 0);
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Defina o objetivo, o valor e o prazo: o app calcula quanto guardar por mês e acompanha a evolução.${mensal ? ` Para cumprir todas no prazo: <b>${brl(mensal)}/mês</b>.` : ''}</p>
      <button class="btn btn-primario" data-nova>+ Meta</button></div>
    <div class="metas-grade">${abertas.map((m) => {
      const p = progressoMeta(m, S.metasMov);
      const movs = S.metasMov.filter((x) => x.meta_id === m.id);
      return `<section class="cartao-bloco meta" style="--meta:${esc(m.cor)}">
        <div class="meta-topo"><span class="meta-emoji">${esc(m.emoji)}</span><div><h2>${esc(m.nome)}</h2><small>${m.prazo ? `prazo ${fmtData(m.prazo)}` : 'sem prazo'}</small></div><button class="btn-icone" data-editar="${m.id}" aria-label="Editar">✎</button></div>
        <div class="meta-anel" style="--p:${(p.p * 100).toFixed(1)}"><b>${pct(p.p)}</b></div>
        <div class="resumo-tabela">
          <div><span>Guardado</span><b>${brl(p.atual)}</b></div><div><span>Objetivo</span><b>${brl(p.alvo)}</b></div><div><span>Falta</span><b>${brl(p.falta)}</b></div>
          ${p.mensalNecessario !== null ? `<div><span>Guardar por mês</span><b class="${p.atrasada ? 'neg' : ''}">${p.atrasada ? 'prazo vencido' : `${brl(p.mensalNecessario)} · ${p.mesesRestantes} mês(es)`}</b></div>` : ''}
        </div>
        ${movs.length >= 2 ? miniEvolucao(m, movs) : ''}
        <div class="acoes"><button class="btn btn-primario btn-peq" data-aportar="${m.id}">+ Guardar</button><button class="btn btn-peq" data-retirar="${m.id}">− Retirar</button>
          ${p.falta <= 0 ? `<button class="btn btn-peq" data-concluir="${m.id}">🏁 Concluir</button>` : ''}</div>
      </section>`;
    }).join('') || '<p class="dica">Nenhuma meta ainda. Ex.: Reserva de emergência, Viagem, Troca do carro.</p>'}</div>
    ${feitas.length ? `<details class="mt"><summary class="dica">Metas concluídas (${feitas.length})</summary>${feitas.map((m) => `<p>🏁 ${esc(m.emoji)} ${esc(m.nome)} — ${brl(m.valor_alvo)} <button class="btn-link" data-editar="${m.id}">editar</button></p>`).join('')}</details>` : ''}`;
  el.querySelector('[data-nova]').onclick = () => formMeta(null, rerender);
  el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => formMeta(S.metas.find((m) => m.id === b.dataset.editar), rerender));
  el.querySelectorAll('[data-aportar]').forEach((b) => b.onclick = () => formMovMeta(S.metas.find((m) => m.id === b.dataset.aportar), 1, rerender));
  el.querySelectorAll('[data-retirar]').forEach((b) => b.onclick = () => formMovMeta(S.metas.find((m) => m.id === b.dataset.retirar), -1, rerender));
  el.querySelectorAll('[data-concluir]').forEach((b) => b.onclick = async () => { await comCarregando(b, async () => { await db.atualizar('metas', b.dataset.concluir, { concluida: true }); await recarregar(); }); toast('🏁 Meta concluída. Parabéns!'); rerender(); });
}

function miniEvolucao(m, movs) {
  let acc = Number(m.valor_inicial || 0);
  const pts = movs.slice().sort((a, b) => a.data.localeCompare(b.data)).map((x) => ({ data: x.data, v: (acc += Number(x.valor)) }));
  const max = Math.max(Number(m.valor_alvo), ...pts.map((p) => p.v));
  const W = 240, H = 46;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - (p.v / max) * H}`).join(' ');
  return `<svg viewBox="0 -2 ${W} ${H + 4}" class="meta-mini" preserveAspectRatio="none"><polyline points="${xy}" fill="none" stroke="var(--meta)" stroke-width="2.5"/></svg>`;
}

function formMeta(m, rerender) {
  modal(m ? 'Editar meta' : 'Nova meta financeira', `
    <form class="form">
      <div class="linha-emoji"><label>Ícone <span class="emoji-campo"><input name="emoji" maxlength="8" value="${esc(m?.emoji || '🎯')}"><button type="button" class="btn btn-peq" data-escolher-emoji>😀</button></span></label>
        <label>Objetivo <input name="nome" required maxlength="100" value="${esc(m?.nome || '')}" placeholder="Ex.: Reserva de emergência"></label></div>
      <div class="linha2"><label>Valor do objetivo <input name="alvo" inputmode="decimal" required value="${m ? String(m.valor_alvo).replace('.', ',') : ''}"></label>
        <label>Já tenho guardado <input name="inicial" inputmode="decimal" value="${m ? String(m.valor_inicial).replace('.', ',') : '0,00'}"></label></div>
      <label>Prazo <small>(opcional)</small><input type="date" name="prazo" value="${m?.prazo || ''}"></label>
      <div class="vc-cores">${CORES.slice(0, 12).map((c) => `<button type="button" class="vc-cor ${c === (m?.cor || '#4f46e5') ? 'sel' : ''}" style="background:${c}" data-cor="${c}" aria-label="Cor"></button>`).join('')}</div>
      <input type="hidden" name="cor" value="${esc(m?.cor || '#4f46e5')}">
      ${m ? `<label class="check"><input type="checkbox" name="concluida" ${m.concluida ? 'checked' : ''}> Concluída</label>` : ''}
      <div class="acoes">${m ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    el.querySelector('[data-escolher-emoji]').onclick = (e) => abrirEmojis(e.currentTarget, (em) => { f.emoji.value = em; });
    el.querySelectorAll('[data-cor]').forEach((b) => b.onclick = () => { f.cor.value = b.dataset.cor; el.querySelectorAll('[data-cor]').forEach((x) => x.classList.toggle('sel', x === b)); });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const alvo = numero(f.alvo.value), ini = numero(f.inicial.value || '0');
      if (!(alvo > 0)) return toast('Informe o valor do objetivo.', 'erro');
      if (!Number.isFinite(ini)) return toast('Valor guardado inválido.', 'erro');
      const dados = { nome: f.nome.value.trim(), emoji: f.emoji.value.trim() || '🎯', valor_alvo: alvo, valor_inicial: ini, prazo: f.prazo.value || null, cor: f.cor.value, concluida: m ? f.concluida.checked : false };
      await comCarregando(f.querySelector('.btn-primario'), async () => { m ? await db.atualizar('metas', m.id, dados) : await db.inserir('metas', [dados]); await recarregar(); });
      toast('Meta salva.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = async () => {
      if (!(await confirmar('Excluir meta', `Excluir “${esc(m.nome)}” e o histórico dela? Lançamentos já feitos continuam.`, [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
      await comCarregando(bx, async () => { await db.excluir('metas', m.id); await recarregar(); });
      toast('Meta excluída.'); fechar(); rerender();
    };
  });
}

function opcoesContas(sel) { return S.contas.filter((c) => c.ativo).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>🏦 ${esc(c.nome)}</option>`).join(''); }
function catPadrao(re) { return S.categorias.find((c) => c.tipo === 'despesa' && re.test(c.nome))?.id || ''; }
function opcoesCatDesp(sel) { return S.categorias.filter((c) => c.tipo === 'despesa' && c.ativo).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.nome)}</option>`).join(''); }

function formMovMeta(m, sinal, rerender) {
  modal(`${sinal > 0 ? 'Guardar para' : 'Retirar de'} “${m.nome}”`, `
    <form class="form">
      <div class="linha2"><label>Valor <input name="valor" inputmode="decimal" required placeholder="0,00"></label><label>Data <input type="date" name="data" value="${hoje()}" required></label></div>
      <label>Observação <input name="desc" maxlength="200" placeholder="opcional"></label>
      ${sinal > 0 ? `<label class="check"><input type="checkbox" name="lancar" checked> Lançar também como despesa em “Metas / Investimentos” (sai da conta)</label>
      <div class="linha2" data-bloco-lanc><label>Sai da conta <select name="conta">${opcoesContas(S.contas[0]?.id)}</select></label>
        <label>Categoria <select name="cat">${opcoesCatDesp(catPadrao(/meta/i))}</select></label></div>` : ''}
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    if (f.lancar) f.lancar.onchange = () => { el.querySelector('[data-bloco-lanc]').hidden = !f.lancar.checked; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = numero(f.valor.value);
      if (!(v > 0)) return toast('Informe o valor.', 'erro');
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        let lancId = null;
        if (sinal > 0 && f.lancar.checked) {
          const [l] = await db.inserir('lancamentos', [{ tipo: 'saida', valor: v, conta_id: f.conta.value, categoria_id: f.cat.value || null, data_movimento: f.data.value, data_pagamento: f.data.value,
            descricao: `Meta: ${m.nome}`, metodo: 'Transferência', situacao: f.data.value > hoje() ? 'pendente' : 'pago', origem: 'meta' }]);
          lancId = l.id; await recarregarLancamentos();
        }
        await db.inserir('metas_movimentos', [{ meta_id: m.id, data: f.data.value, valor: sinal * v, descricao: f.desc.value.trim(), lancamento_id: lancId }]);
        await recarregar();
      });
      const p = progressoMeta(m, S.metasMov);
      toast(p.falta <= 0 ? `🏁 Meta “${m.nome}” atingida!` : `Agora: ${brl(p.atual)} (${pct(p.p)}).`); fechar(); rerender();
    };
  });
}

// =====================================================================
// Investimentos
// =====================================================================
function investimentos(el, rerender) {
  const ativos = S.investimentos.filter((i) => i.ativo);
  const tot = ativos.reduce((s, i) => s + emReais(i.valor_atual, i.moeda), 0), apl = ativos.reduce((s, i) => s + emReais(i.valor_aplicado, i.moeda), 0);
  const ganho = tot - apl;
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Cadastre suas aplicações e atualize o valor de vez em quando (ex.: 1x por mês). O app guarda o histórico e soma no patrimônio.</p>
      <button class="btn btn-primario" data-novo>+ Investimento</button></div>
    <div class="resumo-linha"><div><small>Valor atual</small><b>${brl(tot)}</b></div><div><small>Aplicado</small><b>${brl(apl)}</b></div>
      <div><small>Rendimento</small><b class="${ganho >= 0 ? 'pos' : 'neg'}">${brl(ganho)}</b></div><div><small>Rentab. total</small><b class="${ganho >= 0 ? 'pos' : 'neg'}">${apl ? (ganho / apl * 100).toFixed(2).replace('.', ',') + '%' : '—'}</b></div></div>
    ${Object.entries(CLASSES).map(([k, [ic, nome]]) => {
      const lista = ativos.filter((i) => i.classe === k);
      if (!lista.length) return '';
      const st = lista.reduce((s, i) => s + emReais(i.valor_atual, i.moeda), 0);
      return `<section class="cartao-bloco"><div class="cab-lista"><h2>${ic} ${nome}</h2><span class="pill">${brl(st)} · ${tot ? pct(st / tot) : '—'}</span></div>
        <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Aplicação</th><th class="num">Atual</th><th class="num opc">Aplicado</th><th class="num">Rend.</th><th></th></tr></thead><tbody>
        ${lista.map((i) => { const g = Number(i.valor_atual) - Number(i.valor_aplicado); const pr = Number(i.valor_aplicado) ? g / Number(i.valor_aplicado) : 0;
          return `<tr><td><b>${esc(i.nome)}</b><br><small>${esc([i.subtipo, i.instituicao, i.rentabilidade].filter(Boolean).join(' · '))}${i.vencimento ? ` · vence ${fmtData(i.vencimento)}` : ''} · atualizado ${fmtData(i.atualizado_em)}</small></td>
            <td class="num"><b>${moedaFmt(i.valor_atual, i.moeda)}</b>${i.moeda === 'USD' ? `<br><small>${brl(emReais(i.valor_atual, 'USD'))}</small>` : ''}</td><td class="num opc">${moedaFmt(i.valor_aplicado, i.moeda)}</td>
            <td class="num ${g >= 0 ? 'pos' : 'neg'}">${(pr * 100).toFixed(1).replace('.', ',')}%</td>
            <td class="num acoes-linha"><button class="btn btn-peq" data-atualizar="${i.id}" title="Atualizar valor">🔄</button><button class="btn btn-peq" data-aporte="${i.id}" title="Aporte/resgate">±</button><button class="btn btn-peq" data-editar="${i.id}" title="Editar">✎</button></td></tr>`; }).join('')}
        </tbody></table></div></section>`;
    }).join('') || '<p class="dica">Nenhum investimento cadastrado.</p>'}
    ${S.investimentos.some((i) => !i.ativo) ? `<details><summary class="dica">Encerrados (${S.investimentos.filter((i) => !i.ativo).length})</summary>${S.investimentos.filter((i) => !i.ativo).map((i) => `<p>${esc(i.nome)} <button class="btn-link" data-editar="${i.id}">editar</button></p>`).join('')}</details>` : ''}`;
  el.querySelector('[data-novo]').onclick = () => formInvest(null, rerender);
  const achar = (id) => S.investimentos.find((i) => i.id === id);
  el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => formInvest(achar(b.dataset.editar), rerender));
  el.querySelectorAll('[data-atualizar]').forEach((b) => b.onclick = () => formAtualizarInv(achar(b.dataset.atualizar), rerender));
  el.querySelectorAll('[data-aporte]').forEach((b) => b.onclick = () => formAporte(achar(b.dataset.aporte), rerender));
}

function formInvest(i, rerender) {
  const classe = i?.classe || 'renda_fixa';
  const subs = (k, sel) => SUBTIPOS[k].map((s) => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('');
  modal(i ? 'Editar investimento' : 'Novo investimento', `
    <form class="form">
      <label>Nome <input name="nome" required maxlength="100" value="${esc(i?.nome || '')}" placeholder="Ex.: CDB Banco XP 110% CDI"></label>
      <div class="linha2"><label>Classe <select name="classe">${Object.entries(CLASSES).map(([k, [ic, n]]) => `<option value="${k}" ${k === classe ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
        <label>Tipo <select name="subtipo">${subs(classe, i?.subtipo)}</select></label></div>
      <div class="linha2"><label>Instituição <input name="inst" maxlength="60" value="${esc(i?.instituicao || '')}" placeholder="XP, Nomad, Itaú…"></label>
        <label>Moeda <select name="moeda"><option value="BRL">R$ Real</option><option value="USD" ${i?.moeda === 'USD' ? 'selected' : ''}>US$ Dólar</option></select></label></div>
      <div class="linha2"><label>Valor aplicado <input name="aplicado" inputmode="decimal" required value="${i ? String(i.valor_aplicado).replace('.', ',') : ''}"></label>
        <label>Valor atual <input name="atual" inputmode="decimal" value="${i ? String(i.valor_atual).replace('.', ',') : ''}" placeholder="igual ao aplicado"></label></div>
      <div class="linha2"><label>Rentabilidade <input name="rent" maxlength="40" value="${esc(i?.rentabilidade || '')}" placeholder="110% CDI, IPCA+6%…"></label>
        <label>Vencimento <small>(opcional)</small><input type="date" name="venc" value="${i?.vencimento || ''}"></label></div>
      <label>Liquidez <input name="liq" maxlength="40" value="${esc(i?.liquidez || '')}" placeholder="Diária, D+30, no vencimento…"></label>
      ${i ? `<label class="check"><input type="checkbox" name="ativo" ${i.ativo ? 'checked' : ''}> Ativo (desmarque quando resgatar tudo)</label>` : ''}
      <div class="acoes">${i ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.classe.onchange = () => { f.subtipo.innerHTML = subs(f.classe.value); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const apl = numero(f.aplicado.value), atu = f.atual.value.trim() ? numero(f.atual.value) : apl;
      if (!Number.isFinite(apl) || apl < 0 || !Number.isFinite(atu)) return toast('Valores inválidos.', 'erro');
      const dados = { nome: f.nome.value.trim(), classe: f.classe.value, subtipo: f.subtipo.value, instituicao: f.inst.value.trim(), moeda: f.moeda.value,
        valor_aplicado: apl, valor_atual: atu, rentabilidade: f.rent.value.trim(), vencimento: f.venc.value || null, liquidez: f.liq.value.trim(), ativo: i ? f.ativo.checked : true, atualizado_em: hoje() };
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        if (i) {
          await db.atualizar('investimentos', i.id, dados);
          if (Number(i.valor_atual) !== atu) await db.inserir('investimentos_historico', [{ investimento_id: i.id, data: hoje(), valor_atual: atu, aporte: 0 }]);
        } else {
          const [n] = await db.inserir('investimentos', [dados]);
          await db.inserir('investimentos_historico', [{ investimento_id: n.id, data: hoje(), valor_atual: atu, aporte: apl }]);
        }
        await recarregar();
      });
      toast('Investimento salvo.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = async () => {
      if (!(await confirmar('Excluir investimento', `Excluir “${esc(i.nome)}” e o histórico? (Para resgate, prefira desmarcar “Ativo”.)`, [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
      await comCarregando(bx, async () => { await db.excluir('investimentos', i.id); await recarregar(); });
      toast('Excluído.'); fechar(); rerender();
    };
  });
}

function formAtualizarInv(i, rerender) {
  modal(`Atualizar valor — ${i.nome}`, `
    <form class="form"><p class="dica">Valor anterior: <b>${moedaFmt(i.valor_atual, i.moeda)}</b> em ${fmtData(i.atualizado_em)}. Copie o valor bruto que aparece na corretora/banco hoje.</p>
      <div class="linha2"><label>Valor atual (${i.moeda === 'USD' ? 'US$' : 'R$'}) <input name="v" inputmode="decimal" required></label><label>Data <input type="date" name="d" value="${hoje()}"></label></div>
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Salvar</button></div></form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = numero(f.v.value);
      if (!Number.isFinite(v) || v < 0) return toast('Valor inválido.', 'erro');
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        await db.atualizar('investimentos', i.id, { valor_atual: v, atualizado_em: f.d.value });
        await db.inserir('investimentos_historico', [{ investimento_id: i.id, data: f.d.value, valor_atual: v, aporte: 0 }]);
        await recarregar();
      });
      const g = v - Number(i.valor_atual);
      toast(`Atualizado: ${g >= 0 ? '+' : ''}${moedaFmt(g, i.moeda)} desde a última vez.`); fechar(); rerender();
    };
  });
}

function formAporte(i, rerender) {
  modal(`Aporte ou resgate — ${i.nome}`, `
    <form class="form">
      <div class="seg seg2"><label><input type="radio" name="op" value="1" checked><span>➕ Aporte</span></label><label><input type="radio" name="op" value="-1"><span>➖ Resgate</span></label></div>
      <div class="linha2"><label>Valor (${i.moeda === 'USD' ? 'US$' : 'R$'}) <input name="v" inputmode="decimal" required></label><label>Data <input type="date" name="d" value="${hoje()}"></label></div>
      <label class="check"><input type="checkbox" name="lancar" checked> Registrar também na conta (aporte = despesa em Metas/Investimentos; resgate = receita)</label>
      <div class="linha2" data-bl><label>Conta <select name="conta">${opcoesContas(S.contas[0]?.id)}</select></label>
        <label data-cat-a>Categoria <select name="cat">${opcoesCatDesp(catPadrao(/invest/i))}</select></label></div>
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Salvar</button></div></form>`, (el, fechar) => {
    const f = el.querySelector('form');
    const op = () => Number(f.querySelector('[name=op]:checked').value);
    f.lancar.onchange = () => { el.querySelector('[data-bl]').hidden = !f.lancar.checked; };
    f.querySelectorAll('[name=op]').forEach((r) => r.onchange = () => { el.querySelector('[data-cat-a]').hidden = op() < 0; });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = numero(f.v.value);
      if (!(v > 0)) return toast('Informe o valor.', 'erro');
      const s = op();
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        const novoAtual = arred(Number(i.valor_atual) + s * v), novoApl = arred(Math.max(0, Number(i.valor_aplicado) + s * v));
        await db.atualizar('investimentos', i.id, { valor_atual: novoAtual, valor_aplicado: novoApl, atualizado_em: f.d.value });
        await db.inserir('investimentos_historico', [{ investimento_id: i.id, data: f.d.value, valor_atual: novoAtual, aporte: s * v }]);
        if (f.lancar.checked) {
          const brlV = emReais(v, i.moeda);
          const catRec = S.categorias.find((c) => c.tipo === 'receita' && /rend|invest|passiva/i.test(c.nome))?.id || null;
          await db.inserir('lancamentos', [{ tipo: s > 0 ? 'saida' : 'entrada', valor: brlV, conta_id: f.conta.value, categoria_id: s > 0 ? (f.cat.value || null) : catRec,
            data_movimento: f.d.value, data_pagamento: f.d.value, descricao: `${s > 0 ? 'Aporte' : 'Resgate'}: ${i.nome}`, metodo: 'Transferência',
            situacao: s > 0 ? 'pago' : 'recebido', origem: 'investimento' }]);
          await recarregarLancamentos();
        }
        await recarregar();
      });
      toast(s > 0 ? 'Aporte registrado.' : 'Resgate registrado.'); fechar(); rerender();
    };
  });
}

// =====================================================================
// Dívidas e empréstimos
// =====================================================================
function dividas(el, rerender) {
  const ativas = S.dividas.filter((d) => d.ativo);
  const devo = ativas.filter((d) => d.direcao === 'devo'), meDevem = ativas.filter((d) => d.direcao === 'me_devem');
  const parcelasMes = devo.reduce((s, d) => s + Number(d.parcela_valor || 0), 0);
  const card = (d) => {
    const pagos = S.dividasPag.filter((p) => p.divida_id === d.id);
    const quitado = Number(d.valor_original) ? 1 - Number(d.saldo) / Number(d.valor_original) : 0;
    const sim = d.parcela_valor ? mesesParaQuitar(d.saldo, d.taxa_mensal, d.parcela_valor) : null;
    return `<section class="cartao-bloco divida">
      <div class="cab-lista"><div><h2>${d.direcao === 'devo' ? '🔻' : '🔺'} ${esc(d.nome)}</h2><small>${esc(TIPOS_DIVIDA[d.tipo] || d.tipo)}${d.pessoa ? ' · ' + esc(d.pessoa) : ''}${d.taxa_mensal ? ` · juros ${String(d.taxa_mensal).replace('.', ',')}% a.m.` : ''}${d.dia_vencimento ? ` · vence dia ${d.dia_vencimento}` : ''}</small></div>
        <button class="btn-icone" data-editar="${d.id}" aria-label="Editar">✎</button></div>
      <div class="cc-numeros"><div><small>${d.direcao === 'devo' ? 'Saldo devedor' : 'Falta receber'}</small><b class="${d.direcao === 'devo' ? 'neg' : 'pos'}">${brl(d.saldo)}</b></div>
        <div><small>Original</small><b>${brl(d.valor_original)}</b></div>
        <div><small>Parcelas</small><b>${d.parcelas_total ? `${d.parcelas_pagas}/${d.parcelas_total}` : pagos.length || '—'}</b></div></div>
      ${barra(quitado, 1, 'barra-meta')}<small>${pct(quitado)} ${d.direcao === 'devo' ? 'quitado' : 'recebido'}${sim ? ` · no ritmo de ${brl(d.parcela_valor)}/mês: quita em ${sim.meses} mês(es), ${brl(sim.jurosTotal)} de juros` : d.parcela_valor && d.taxa_mensal ? ' · ⚠️ a parcela não cobre os juros' : ''}</small>
      <div class="acoes mt"><button class="btn btn-primario btn-peq" data-pagar="${d.id}">${d.direcao === 'devo' ? '💸 Registrar pagamento' : '💰 Registrar recebimento'}</button>
        ${pagos.length ? `<details><summary class="dica">Histórico (${pagos.length})</summary>${pagos.slice().reverse().map((p) => `<small>${fmtData(p.data)} · ${brl(p.valor)}${Number(p.juros) ? ` (juros ${brl(p.juros)})` : ''}</small><br>`).join('')}</details>` : ''}</div>
    </section>`;
  };
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Empréstimos, financiamentos, parcelamentos e dinheiro emprestado para alguém. O saldo entra no patrimônio e as parcelas na projeção.</p>
      <button class="btn btn-primario" data-novo>+ Dívida / empréstimo</button></div>
    <div class="resumo-linha"><div><small>Eu devo</small><b class="neg">${brl(devo.reduce((s, d) => s + Number(d.saldo), 0))}</b></div><div><small>Me devem</small><b class="pos">${brl(meDevem.reduce((s, d) => s + Number(d.saldo), 0))}</b></div>
      <div><small>Parcelas/mês</small><b>${brl(parcelasMes)}</b></div><div><small>Ativas</small><b>${ativas.length}</b></div></div>
    ${devo.length ? `<h3>Eu devo</h3><div class="metas-grade">${devo.map(card).join('')}</div>` : ''}
    ${meDevem.length ? `<h3>Me devem</h3><div class="metas-grade">${meDevem.map(card).join('')}</div>` : ''}
    ${!ativas.length ? '<p class="dica">Nenhuma dívida ou empréstimo em aberto. 🎉</p>' : ''}
    ${S.dividas.some((d) => !d.ativo) ? `<details class="mt"><summary class="dica">Quitadas (${S.dividas.filter((d) => !d.ativo).length})</summary>${S.dividas.filter((d) => !d.ativo).map((d) => `<p>✅ ${esc(d.nome)} — ${brl(d.valor_original)} <button class="btn-link" data-editar="${d.id}">editar</button></p>`).join('')}</details>` : ''}`;
  el.querySelector('[data-novo]').onclick = () => formDivida(null, rerender);
  el.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => formDivida(S.dividas.find((d) => d.id === b.dataset.editar), rerender));
  el.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => formPagarDivida(S.dividas.find((d) => d.id === b.dataset.pagar), rerender));
}

function formDivida(d, rerender) {
  modal(d ? 'Editar dívida / empréstimo' : 'Nova dívida / empréstimo', `
    <form class="form">
      <div class="seg seg2"><label><input type="radio" name="direcao" value="devo" ${d?.direcao !== 'me_devem' ? 'checked' : ''}><span>🔻 Eu devo</span></label><label><input type="radio" name="direcao" value="me_devem" ${d?.direcao === 'me_devem' ? 'checked' : ''}><span>🔺 Me devem</span></label></div>
      <label>Descrição <input name="nome" required maxlength="100" value="${esc(d?.nome || '')}" placeholder="Ex.: Empréstimo consignado, Financiamento do carro"></label>
      <div class="linha2"><label>Tipo <select name="tipo">${Object.entries(TIPOS_DIVIDA).map(([k, v]) => `<option value="${k}" ${k === d?.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Banco ou pessoa <input name="pessoa" maxlength="60" value="${esc(d?.pessoa || '')}"></label></div>
      <div class="linha2"><label>Valor original <input name="original" inputmode="decimal" required value="${d ? String(d.valor_original).replace('.', ',') : ''}"></label>
        <label>Saldo em aberto hoje <input name="saldo" inputmode="decimal" value="${d ? String(d.saldo).replace('.', ',') : ''}" placeholder="igual ao original"></label></div>
      <div class="linha3"><label>Parcela <input name="parcela" inputmode="decimal" value="${d?.parcela_valor ? String(d.parcela_valor).replace('.', ',') : ''}"></label>
        <label>Nº parcelas <input type="number" name="ptotal" min="1" max="600" value="${d?.parcelas_total || ''}"></label>
        <label>Já pagas <input type="number" name="ppagas" min="0" max="600" value="${d?.parcelas_pagas || 0}"></label></div>
      <div class="linha2"><label>Juros ao mês (%) <input name="taxa" inputmode="decimal" value="${d?.taxa_mensal != null ? String(d.taxa_mensal).replace('.', ',') : ''}" placeholder="ex.: 1,99"></label>
        <label>Dia do vencimento <input type="number" name="dia" min="1" max="31" value="${d?.dia_vencimento || ''}"></label></div>
      <label>Observações <input name="obs" maxlength="300" value="${esc(d?.obs || '')}"></label>
      ${d ? `<label class="check"><input type="checkbox" name="ativo" ${d.ativo ? 'checked' : ''}> Em aberto (desmarque quando quitar)</label>` : ''}
      <div class="acoes">${d ? '<button type="button" class="btn btn-perigo" data-excluir>Excluir</button>' : ''}<span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const orig = numero(f.original.value), saldo = f.saldo.value.trim() ? numero(f.saldo.value) : orig;
      if (!(orig > 0) || !Number.isFinite(saldo) || saldo < 0) return toast('Confira os valores.', 'erro');
      const taxa = f.taxa.value.trim() ? numero(f.taxa.value) : null, parc = f.parcela.value.trim() ? numero(f.parcela.value) : null;
      const dados = { nome: f.nome.value.trim(), direcao: f.querySelector('[name=direcao]:checked').value, tipo: f.tipo.value, pessoa: f.pessoa.value.trim(), valor_original: orig, saldo,
        parcela_valor: parc > 0 ? parc : null, parcelas_total: Number(f.ptotal.value) || null, parcelas_pagas: Number(f.ppagas.value) || 0,
        taxa_mensal: Number.isFinite(taxa) ? taxa : null, dia_vencimento: Number(f.dia.value) || null, obs: f.obs.value.trim(), ativo: d ? f.ativo.checked : true };
      await comCarregando(f.querySelector('.btn-primario'), async () => { d ? await db.atualizar('dividas', d.id, dados) : await db.inserir('dividas', [dados]); await recarregar(); });
      toast('Salvo.'); fechar(); rerender();
    };
    const bx = el.querySelector('[data-excluir]');
    if (bx) bx.onclick = async () => {
      if (!(await confirmar('Excluir', `Excluir “${esc(d.nome)}” e o histórico de pagamentos?`, [{ valor: 'sim', rotulo: 'Excluir', classe: 'btn-perigo' }]))) return;
      await comCarregando(bx, async () => { await db.excluir('dividas', d.id); await recarregar(); });
      toast('Excluído.'); fechar(); rerender();
    };
  });
}

function formPagarDivida(d, rerender) {
  const devo = d.direcao === 'devo';
  const jurosSug = d.taxa_mensal ? arred(Number(d.saldo) * Number(d.taxa_mensal) / 100) : 0;
  const catJuros = S.categorias.find((c) => c.tipo === 'despesa' && /juros/i.test(c.nome))?.id || '';
  modal(`${devo ? 'Pagamento' : 'Recebimento'} — ${d.nome}`, `
    <form class="form">
      <div class="linha2"><label>Valor ${devo ? 'pago' : 'recebido'} <input name="v" inputmode="decimal" required value="${d.parcela_valor ? String(d.parcela_valor).replace('.', ',') : ''}"></label><label>Data <input type="date" name="d" value="${hoje()}"></label></div>
      ${devo ? `<label>Desse valor, quanto foi juros <small>(sugestão: ${brl(jurosSug)})</small><input name="juros" inputmode="decimal" value="${String(jurosSug).replace('.', ',')}"></label>` : ''}
      <label class="check"><input type="checkbox" name="lancar" checked> Lançar na conta (${devo ? 'despesa' : 'receita'})</label>
      <div class="linha2" data-bl><label>Conta <select name="conta">${opcoesContas(S.contas[0]?.id)}</select></label>
        ${devo ? `<label>Categoria <select name="cat">${opcoesCatDesp(catJuros)}</select></label>` : ''}</div>
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Salvar</button></div></form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.lancar.onchange = () => { el.querySelector('[data-bl]').hidden = !f.lancar.checked; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = numero(f.v.value), j = devo ? (numero(f.juros.value || '0') || 0) : 0;
      if (!(v > 0) || j < 0 || j > v) return toast('Confira os valores.', 'erro');
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        let lancId = null;
        if (f.lancar.checked) {
          const catRec = S.categorias.find((c) => c.tipo === 'receita' && /outr|divers|extra/i.test(c.nome))?.id || null;
          const [l] = await db.inserir('lancamentos', [{ tipo: devo ? 'saida' : 'entrada', valor: v, conta_id: f.conta.value, categoria_id: devo ? (f.cat.value || null) : catRec,
            data_movimento: f.d.value, data_pagamento: f.d.value, descricao: `${devo ? 'Pagamento' : 'Recebimento'}: ${d.nome}`, metodo: 'Boleto', situacao: devo ? 'pago' : 'recebido', origem: 'divida' }]);
          lancId = l.id; await recarregarLancamentos();
        }
        await db.inserir('dividas_pagamentos', [{ divida_id: d.id, data: f.d.value, valor: v, juros: j, lancamento_id: lancId }]);
        const saldo = arred(Math.max(0, Number(d.saldo) - (v - j)));
        await db.atualizar('dividas', d.id, { saldo, parcelas_pagas: (d.parcelas_pagas || 0) + 1, ativo: saldo > 0 });
        await recarregar();
      });
      toast(Number(d.saldo) - v <= 0 ? '✅ Quitado!' : 'Registrado.'); fechar(); rerender();
    };
  });
}

// =====================================================================
// Projeção de saldo
// =====================================================================
function projecao(el, rerender) {
  const saldoHoje = S.contas.filter((c) => c.ativo).reduce((s, c) => s + saldoContaBRL(c), 0);
  const parcelasDividas = S.dividas.filter((d) => d.ativo && d.direcao === 'devo').reduce((s, d) => s + Number(d.parcela_valor || 0), 0);
  const p = projecaoSaldo({ saldoHoje, lancs: S.lancs, recorrentes: S.recorrentes, cartoes: S.cartoes, meses: horizonte, parcelasDividas });
  const pior = p.reduce((m, x) => (x.fim < m.fim ? x : m), p[0]);
  el.innerHTML = `
    <div class="cab-lista"><p class="dica">Parte do saldo de hoje nas contas (${brl(saldoHoje)}) e soma o que está pendente: receitas, contas a pagar, faturas de cartão (inclui parcelas futuras), recorrentes${parcelasDividas ? ' e parcelas de dívidas' : ''}.</p>
      <div class="seg-peq">${[3, 6, 12].map((n) => `<button class="${n === horizonte ? 'sel' : ''}" data-h="${n}">${n} meses</button>`).join('')}</div></div>
    ${pior.fim < 0 ? `<div class="aviso erro">🚨 Pela projeção, o saldo fica negativo em <b>${nomeMes(pior.ref)}</b> (${brl(pior.fim)}). Reveja gastos ou antecipe receitas.</div>` : `<div class="aviso ok">✅ O saldo projetado fica positivo nos próximos ${horizonte} meses. Menor saldo: ${brl(pior.fim)} em ${nomeMes(pior.ref)}.</div>`}
    <section class="cartao-bloco">${barras(p.map((x) => rotMes(x.ref)), [{ nome: 'Entradas', cor: 'var(--verde)', valores: p.map((x) => x.entradas) }, { nome: 'Saídas + faturas', cor: 'var(--vermelho)', valores: p.map((x) => x.saidas + x.faturas + x.dividas) }],
      { linha: { nome: 'Saldo no fim do mês', cor: 'var(--acento)', valores: p.map((x) => x.fim) } })}</section>
    <section class="cartao-bloco"><div class="tabela-rolagem"><table class="tabela">
      <thead><tr><th>Mês</th><th class="num">Começa</th><th class="num">Entradas</th><th class="num">Contas</th><th class="num">Faturas</th>${parcelasDividas ? '<th class="num">Dívidas</th>' : ''}<th class="num">Termina</th></tr></thead>
      <tbody>${p.map((x) => `<tr><td>${nomeMes(x.ref)}</td><td class="num">${brl(x.inicio)}</td><td class="num pos">${brl(x.entradas)}</td><td class="num neg">${brl(x.saidas)}</td><td class="num neg">${brl(x.faturas)}</td>${parcelasDividas ? `<td class="num neg">${brl(x.dividas)}</td>` : ''}<td class="num"><b class="${x.fim >= 0 ? '' : 'neg'}">${brl(x.fim)}</b></td></tr>`).join('')}</tbody>
    </table></div><p class="dica">Dica: cadastre salário, aluguel e assinaturas como <b>recorrentes</b> para a projeção ficar mais precisa.</p></section>`;
  el.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { horizonte = Number(b.dataset.h); rerender(); });
}

void montar; void mesDe; void nomeCategoria;
