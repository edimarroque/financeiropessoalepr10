// Tela: Dashboards avançados — gastos, ganhos e recebimentos
import { COR_SEM_CATEGORIA } from '../components/graficos.js';
import { S, categoriaPorId, cartaoPorId, contaPorId } from '../state.js';
import { resumoIntervalo, periodoAnterior, intervalo, variacao, matrizAnual, agrupar, diasEntre, hoje,
  MESES_CURTOS, DIAS_SEMANA, partes, GRUPOS_DESPESA, arred, assinaturasRepetidas } from '../calc.js';
import { esc, brl, pct } from '../ui.js';
import { periodoHTML, ligarPeriodo, periodoAtual, rotuloPeriodo } from '../components/periodo.js';
import { barras, rosca, barrasH, selo, PALETA } from '../components/graficos.js';
import { normDesc } from '../import/parsers.js';
import { saldoConta } from '../calc.js';
import { SEM_CATEGORIA } from './lancamentos.js';

let aba = 'visao';
let tabelaTipo = 'saida';

const nomeCat = (id) => { const c = categoriaPorId(id); return c ? `${c.emoji} ${c.nome}` : 'Sem categoria'; };

export function render(el) {
  const { ini, fim } = periodoAtual();
  const r = resumoIntervalo(S.lancs, S.categorias, ini, fim);
  const ant = periodoAnterior(S.ano, S.mes);
  const ia = intervalo(ant.ano, ant.mes);
  const rAnt = resumoIntervalo(S.lancs, S.categorias, ia.ini, ia.fim);
  const diasPeriodo = diasEntre(ini, fim < hoje() || ini > hoje() ? fim : hoje());

  el.innerHTML = `
    <div class="topo-tela">
      <div><h1>Dashboards</h1><p class="dica">${esc(rotuloPeriodo())} · comparado com ${esc(rotuloPeriodo(ant.ano, ant.mes))}</p></div>
      <div class="topo-acoes">${periodoHTML()}</div>
    </div>
    <div class="abas" role="tablist">
      ${[['visao', '📊 Visão geral'], ['gastos', '💸 Gastos'], ['ganhos', '💰 Ganhos e recebimentos'], ['anual', '🗂️ Painel anual'], ['ir', '🧾 Imposto de Renda']]
        .map(([v, t]) => `<button class="aba ${aba === v ? 'ativa' : ''}" data-aba="${v}" role="tab" aria-selected="${aba === v}">${t}</button>`).join('')}
    </div>
    <div data-conteudo></div>`;

  const c = el.querySelector('[data-conteudo]');
  if (aba === 'visao') visao(c, r, rAnt, ini, fim, diasPeriodo);
  else if (aba === 'gastos') gastos(c, r, rAnt, ini, fim, ia);
  else if (aba === 'ganhos') ganhos(c, r, rAnt, ini, fim);
  else if (aba === 'ir') impostoRenda(c);
  else anual(c);

  const rerender = () => render(el);
  ligarPeriodo(el, rerender);
  el.querySelectorAll('[data-aba]').forEach((b) => b.onclick = () => { aba = b.dataset.aba; rerender(); });
  el.querySelectorAll('[data-tt]').forEach((b) => b.onclick = () => { tabelaTipo = b.dataset.tt; rerender(); });
  const irSemCat = () => { window.dispatchEvent(new CustomEvent('filtro-categoria', { detail: SEM_CATEGORIA })); location.hash = '#/lancamentos'; };
  el.querySelectorAll('[data-acao=semcat]').forEach((b) => { b.addEventListener('click', irSemCat); b.addEventListener('keydown', (e) => { if (e.key === 'Enter') irSemCat(); }); });
}

// ---------------- Visão geral ----------------
function visao(el, r, rAnt, ini, fim, dias) {
  const taxa = r.receitas ? (r.receitas - r.despesas) / r.receitas : null;
  const taxaAnt = rAnt.receitas ? (rAnt.receitas - rAnt.despesas) / rAnt.receitas : null;
  const mediaDia = dias > 0 ? r.despesas / dias : 0;
  const grupos = GRUPOS_DESPESA.map((g, i) => ({ nome: g, valor: r.porGrupo.get(g) || 0, cor: ['#2563eb', '#f59e0b', '#14b8a6'][i] })).filter((x) => x.valor > 0);
  if (r.porGrupo.get('Sem categoria')) grupos.push({ nome: 'Sem categoria', valor: r.porGrupo.get('Sem categoria'), cor: COR_SEM_CATEGORIA, acao: 'semcat' });

  // série mensal do ano (ou do mês dentro do ano)
  const ano = S.ano;
  const serie = Array.from({ length: 12 }, (_, i) => { const it = intervalo(ano, i + 1); return resumoIntervalo(S.lancs, S.categorias, it.ini, it.fim); });
  let acum = 0;
  const saldoAcum = serie.map((x) => (acum += x.saldo));

  el.innerHTML = `
    <section class="kpis">
      <div class="kpi kpi-rec"><small>Ganhos</small><b>${brl(r.receitas)}</b><span>${selo(variacao(r.receitas, rAnt.receitas))} antes ${brl(rAnt.receitas)}</span></div>
      <div class="kpi kpi-desp"><small>Gastos</small><b>${brl(r.despesas)}</b><span>${selo(variacao(r.despesas, rAnt.despesas), { inverso: true })} antes ${brl(rAnt.despesas)}</span></div>
      <div class="kpi kpi-saldo"><small>Taxa de economia</small><b class="${taxa !== null && taxa < 0 ? 'neg' : ''}">${taxa === null ? '—' : pct(taxa)}</b><span>antes ${taxaAnt === null ? '—' : pct(taxaAnt)} · ideal ≥ 20%</span></div>
      <div class="kpi kpi-contas"><small>Gasto médio por dia</small><b>${brl(mediaDia)}</b><span>${dias} dia(s) no período</span></div>
    </section>
    <div class="grade2">
      <section class="cartao-bloco"><h2>Gastos por grupo</h2>${rosca(grupos, { centro: brl(r.despesas), sub: 'gastos' })}${semCatHTML(ini, fim)}</section>
      <section class="cartao-bloco"><h2>Top 6 categorias de gasto</h2>${barrasH(topCategorias(r, 'saida', 6))}</section>
      <section class="cartao-bloco span2"><h2>Ganhos × gastos em ${ano}</h2>
        ${barras(MESES_CURTOS, [{ nome: 'Ganhos', cor: 'var(--verde)', valores: serie.map((x) => x.receitas) }, { nome: 'Gastos', cor: 'var(--vermelho)', valores: serie.map((x) => x.despesas) }],
          { destaque: S.mes ? S.mes - 1 : -1, linha: { nome: 'Saldo acumulado', cor: 'var(--acento)', valores: saldoAcum } })}
      </section>
    </div>`;
}

// v1.6.7: atalho para a lista dos lançamentos sem categoria do período (abre em Lançamentos, já filtrada)
function semCategoria(ini, fim) {
  return S.lancs.filter((l) => (l.tipo === 'entrada' || l.tipo === 'saida') && !l.categoria_id && l.data_pagamento >= ini && l.data_pagamento <= fim);
}
function semCatHTML(ini, fim) {
  const ls = semCategoria(ini, fim);
  if (!ls.length) return '';
  const g = ls.filter((l) => l.tipo === 'saida'), r = ls.filter((l) => l.tipo === 'entrada');
  const soma = (a) => brl(a.reduce((s, l) => s + Number(l.valor), 0));
  const partes = [g.length ? `${g.length} gasto(s) ${soma(g)}` : '', r.length ? `${r.length} receita(s) ${soma(r)}` : ''].filter(Boolean).join(' · ');
  return `<button class="btn btn-peq sem-cat-atalho" data-acao="semcat">❔ Sem categoria: ${partes} — classificar →</button>`;
}

function topCategorias(r, tipo, n) {
  return [...r.porCategoria.values()].filter((x) => x.tipo === tipo).sort((a, b) => b.total - a.total).slice(0, n)
    .map((x, i) => ({ rotulo: x.categoria ? `${x.categoria.emoji} ${x.categoria.nome}` : 'Sem categoria', valor: x.total, extra: `${x.qtd}x`, cor: x.categoria ? PALETA[i % PALETA.length] : COR_SEM_CATEGORIA, acao: x.categoria ? null : 'semcat' }));
}

// ---------------- Gastos ----------------
function gastos(el, r, rAnt, ini, fim, ia) {
  const porCat = [...r.porCategoria.values()].filter((x) => x.tipo === 'saida').sort((a, b) => b.total - a.total);
  const antPorCat = new Map([...rAnt.porCategoria.values()].filter((x) => x.tipo === 'saida').map((x) => [x.categoria?.id || 'sem', x.total]));
  const estab = agrupar(S.lancs, ini, fim, (l) => normDesc(l.descricao) || null).slice(0, 10);
  const forma = agrupar(S.lancs, ini, fim, (l) => l.cartao_id ? `💳 ${cartaoPorId(l.cartao_id)?.nome || 'Cartão'}` : `${l.metodo || 'Outro'} · ${contaPorId(l.conta_id)?.nome || ''}`);
  const semana = Array(7).fill(0);
  for (const l of S.lancs) if (l.tipo === 'saida' && l.data_pagamento >= ini && l.data_pagamento <= fim) {
    const { y, m, d } = partes(l.data_movimento); semana[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] += Number(l.valor);
  }
  const maiores = S.lancs.filter((l) => l.tipo === 'saida' && l.data_pagamento >= ini && l.data_pagamento <= fim).sort((a, b) => b.valor - a.valor).slice(0, 8);
  const parcelasFuturas = S.lancs.filter((l) => l.tipo === 'saida' && l.cartao_id && l.situacao === 'pendente' && l.data_pagamento > fim);
  const compromisso = arred(parcelasFuturas.reduce((s, l) => s + Number(l.valor), 0));
  void ia;

  el.innerHTML = `
    <div class="grade2">
      <section class="cartao-bloco span2"><h2>Categorias: este período × anterior</h2>
        <table class="tabela">
          <thead><tr><th>Categoria</th><th class="num">Agora</th><th class="num opc">Antes</th><th class="num">Variação</th><th class="num opc">% do total</th><th class="num opc">Limite</th></tr></thead>
          <tbody>${porCat.map((x) => {
            const antes = antPorCat.get(x.categoria?.id || 'sem') || 0;
            const lim = Number(x.categoria?.valor_mensal || 0) * (S.mes ? 1 : 12);
            return `<tr ${x.categoria ? '' : 'data-acao="semcat" class="clicavel" title="Ver a lista para classificar"'}><td>${x.categoria ? esc(`${x.categoria.emoji} ${x.categoria.nome}`) : '❔ Sem categoria <small>(ver lista →)</small>'}</td><td class="num"><b>${brl(x.total)}</b></td>
              <td class="num opc">${brl(antes)}</td><td class="num">${selo(variacao(x.total, antes), { inverso: true })}</td>
              <td class="num opc">${pct(x.total / (r.despesas || 1))}</td><td class="num opc ${lim && x.total > lim ? 'neg' : ''}">${lim ? brl(lim) : '—'}</td></tr>`;
          }).join('') || '<tr><td colspan="6" class="dica">Sem gastos no período.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="cartao-bloco"><h2>Onde mais gastou</h2><p class="dica">Agrupado pela descrição (estabelecimento).</p>${barrasH(estab.map((x, i) => ({ rotulo: x.chave, valor: x.total, extra: `${x.qtd}x`, cor: PALETA[i % PALETA.length] })))}</section>
      <section class="cartao-bloco"><h2>Formas de pagamento</h2>${rosca(forma.slice(0, 8).map((x) => ({ nome: x.chave, valor: x.total })), { centro: brl(r.despesas), sub: 'gastos' })}</section>
      <section class="cartao-bloco"><h2>Gastos por dia da semana</h2>
        ${barras(DIAS_SEMANA, [{ nome: 'Gastos', cor: 'var(--vermelho)', valores: semana.map(arred) }], { altura: 190 })}</section>
      <section class="cartao-bloco"><h2>Maiores gastos</h2>
        <div class="lista">${maiores.map((l) => `<div class="item item-estatico"><div class="item-meio"><div class="item-titulo">${esc(l.descricao || nomeCat(l.categoria_id))}</div>
          <div class="item-sub">${esc(nomeCat(l.categoria_id))} · ${l.data_movimento.split('-').reverse().join('/')}</div></div><div class="item-fim"><b class="neg">${brl(l.valor)}</b></div></div>`).join('') || '<p class="dica">Sem gastos.</p>'}</div>
        ${compromisso ? `<p class="aviso mt">📅 Parcelas de cartão já comprometidas depois deste período: <b>${brl(compromisso)}</b> (${parcelasFuturas.length} parcela(s)).</p>` : ''}
      </section>
      ${assinaturasHTML()}
    </div>`;
}

// Assinaturas: gastos que se repetem todo mês com valor parecido
function assinaturasHTML() {
  const lista = assinaturasRepetidas(S.lancs);
  const total = lista.reduce((s, x) => s + x.media, 0);
  return `<section class="cartao-bloco span2"><div class="cab-lista"><h2>🔁 Assinaturas e gastos repetidos</h2><span class="pill">${brl(total)}/mês · ${brl(total * 12)}/ano</span></div>
    <p class="dica">Despesas com a mesma descrição e valor parecido em 3 meses ou mais. Revise o que não usa mais — e fique de olho em cobranças duplicadas.</p>
    ${lista.length ? `<table class="tabela"><thead><tr><th>Descrição</th><th class="num">Média/mês</th><th class="num opc">Por ano</th><th class="opc">Meses</th><th>Situação</th></tr></thead><tbody>
      ${lista.map((x) => `<tr><td><b>${esc(x.descricao)}</b><br><small>${esc(nomeCat(x.categoria_id))} · ${x.cartao_id ? '💳 ' + esc(cartaoPorId(x.cartao_id)?.nome || '') : '🏦 ' + esc(contaPorId(x.conta_id)?.nome || '')}</small></td>
        <td class="num">${brl(x.media)}</td><td class="num opc">${brl(x.anual)}</td><td class="opc">${x.meses}</td>
        <td>${x.duplicadoNoMes ? '<span class="sit sit-pend">⚠️ cobrada 2x no mesmo mês</span>' : x.recorrente ? '<span class="sit sit-ok">🔁 recorrente</span>' : '<span class="dica">—</span>'}</td></tr>`).join('')}
    </tbody></table>` : '<p class="dica">Nenhuma repetição encontrada ainda (precisa de 3 meses de histórico).</p>'}</section>`;
}

// ---------------- Ganhos e recebimentos ----------------
function ganhos(el, r, rAnt, ini, fim) {
  const porCat = topCategorias(r, 'entrada', 12);
  const antes = new Map([...rAnt.porCategoria.values()].filter((x) => x.tipo === 'entrada').map((x) => [x.categoria?.id || 'sem', x.total]));
  const porConta = agrupar(S.lancs, ini, fim, (l) => contaPorId(l.conta_id)?.nome || (l.cartao_id ? 'Estornos no cartão' : 'Sem conta'), 'entrada');
  const pendentes = S.lancs.filter((l) => l.tipo === 'entrada' && l.situacao === 'pendente' && l.data_pagamento >= ini && l.data_pagamento <= fim);
  const previsto = S.categorias.filter((c) => c.tipo === 'receita').reduce((s, c) => s + Number(c.valor_mensal || 0), 0) * (S.mes ? 1 : 12);
  const ativa = r.porGrupo.get('Renda Ativa') || 0, passiva = r.porGrupo.get('Renda Passiva') || 0;
  const serie = Array.from({ length: 12 }, (_, i) => { const it = intervalo(S.ano, i + 1); const x = resumoIntervalo(S.lancs, S.categorias, it.ini, it.fim); return [x.porGrupo.get('Renda Ativa') || 0, x.porGrupo.get('Renda Passiva') || 0]; });

  el.innerHTML = `
    <section class="kpis">
      <div class="kpi kpi-rec"><small>Recebido</small><b>${brl(r.receitasRecebidas)}</b><span>${selo(variacao(r.receitas, rAnt.receitas))} total ${brl(r.receitas)}</span></div>
      <div class="kpi"><small>A receber</small><b>${brl(r.aReceber)}</b><span>${pendentes.length} lançamento(s) pendente(s)</span></div>
      <div class="kpi"><small>Renda ativa × passiva</small><b>${pct(ativa / (r.receitas || 1))} · ${pct(passiva / (r.receitas || 1))}</b><span>${brl(ativa)} · ${brl(passiva)}</span></div>
      <div class="kpi kpi-saldo"><small>Previsto nas categorias</small><b>${previsto ? brl(previsto) : '—'}</b><span>${previsto ? `realizado ${pct(r.receitas / previsto)}` : 'defina em Cadastros'}</span></div>
    </section>
    <div class="grade2">
      <section class="cartao-bloco"><h2>Ganhos por categoria</h2>
        <table class="tabela"><thead><tr><th>Categoria</th><th class="num">Agora</th><th class="num">Variação</th></tr></thead>
        <tbody>${porCat.map((x) => { const c = S.categorias.find((k) => `${k.emoji} ${k.nome}` === x.rotulo); return `<tr><td>${esc(x.rotulo)}</td><td class="num pos"><b>${brl(x.valor)}</b></td><td class="num">${selo(variacao(x.valor, antes.get(c?.id || 'sem') || 0))}</td></tr>`; }).join('') || '<tr><td colspan="3" class="dica">Sem ganhos no período.</td></tr>'}</tbody></table>
      </section>
      <section class="cartao-bloco"><h2>Onde entrou o dinheiro</h2>${rosca(porConta.map((x) => ({ nome: x.chave, valor: x.total })), { centro: brl(r.receitas), sub: 'ganhos' })}</section>
      <section class="cartao-bloco span2"><h2>Renda ativa e passiva em ${S.ano}</h2>
        ${barras(MESES_CURTOS, [{ nome: 'Renda ativa', cor: '#2563eb', valores: serie.map((x) => x[0]) }, { nome: 'Renda passiva', cor: '#14b8a6', valores: serie.map((x) => x[1]) }], { destaque: S.mes ? S.mes - 1 : -1 })}
      </section>
      ${pendentes.length ? `<section class="cartao-bloco span2"><h2>A receber no período</h2><div class="lista">${pendentes.map((l) => `<div class="item item-estatico"><div class="item-meio"><div class="item-titulo">${esc(l.descricao || nomeCat(l.categoria_id))}</div><div class="item-sub">previsto para ${l.data_pagamento.split('-').reverse().join('/')}</div></div><div class="item-fim"><b class="pos">${brl(l.valor)}</b></div></div>`).join('')}</div></section>` : ''}
    </div>`;
}

// ---------------- Painel anual (categorias × meses) ----------------
function anual(el) {
  const m = matrizAnual(S.lancs, S.ano);
  const tipoCat = tabelaTipo === 'entrada' ? 'receita' : 'despesa';
  const linhas = [...m.entries()].filter(([, v]) => v.tipo === tabelaTipo).map(([id, v]) => ({ cat: categoriaPorId(id), meses: v.meses }));
  // categorias sem movimento também aparecem (como na planilha), agrupadas
  for (const c of S.categorias.filter((k) => k.tipo === tipoCat && k.ativo)) if (!linhas.find((l) => l.cat?.id === c.id)) linhas.push({ cat: c, meses: Array(12).fill(0) });
  const grupos = [...new Set(linhas.map((l) => l.cat?.grupo || 'Sem categoria'))];
  const ordemG = tipoCat === 'despesa' ? GRUPOS_DESPESA : ['Renda Ativa', 'Renda Passiva'];
  grupos.sort((a, b) => (ordemG.indexOf(a) + 1 || 99) - (ordemG.indexOf(b) + 1 || 99));
  const mesesComDado = Math.max(1, ...linhas.map((l) => { let u = 0; l.meses.forEach((v, i) => { if (v) u = i + 1; }); return u; }));
  const somaCol = Array(12).fill(0);
  linhas.forEach((l) => l.meses.forEach((v, i) => somaCol[i] += v));
  const cel = (v) => (v ? brl(v).replace('R$', '').trim() : '<span class="zero">—</span>');
  const linhaHTML = (rot, meses, prev, classe = '') => {
    const tot = meses.reduce((s, v) => s + v, 0);
    return `<tr class="${classe}"><th>${rot}</th>${meses.map((v, i) => `<td class="num ${S.mes === i + 1 ? 'col-sel' : ''}">${cel(v)}</td>`).join('')}
      <td class="num"><b>${cel(arred(tot))}</b></td><td class="num">${cel(arred(tot / mesesComDado))}</td><td class="num">${prev ? cel(prev) : '<span class="zero">—</span>'}</td></tr>`;
  };

  el.innerHTML = `
    <section class="cartao-bloco">
      <div class="cab-lista"><div><h2>Painel anual ${S.ano}</h2><p class="dica">Valores pela data de pagamento. Média = total ÷ ${mesesComDado} mês(es) com movimento. Previsto = valor mensal da categoria.</p></div>
        <div class="seg seg-peq"><button class="${tabelaTipo === 'saida' ? 'sel' : ''}" data-tt="saida">Gastos</button><button class="${tabelaTipo === 'entrada' ? 'sel' : ''}" data-tt="entrada">Ganhos</button></div></div>
      <div class="tabela-rolagem">
        <table class="tabela tabela-anual">
          <thead><tr><th>Categoria</th>${MESES_CURTOS.map((x, i) => `<th class="num ${S.mes === i + 1 ? 'col-sel' : ''}">${x}</th>`).join('')}<th class="num">Total</th><th class="num">Média</th><th class="num">Previsto</th></tr></thead>
          <tbody>
            ${grupos.map((g) => {
              const ls = linhas.filter((l) => (l.cat?.grupo || 'Sem categoria') === g).sort((a, b) => b.meses.reduce((s, v) => s + v, 0) - a.meses.reduce((s, v) => s + v, 0));
              const sub = Array(12).fill(0); ls.forEach((l) => l.meses.forEach((v, i) => sub[i] += v));
              return linhaHTML(esc(g), sub.map(arred), ls.reduce((s, l) => s + Number(l.cat?.valor_mensal || 0), 0), 'grupo') +
                ls.map((l) => linhaHTML(esc(l.cat ? `${l.cat.emoji} ${l.cat.nome}` : 'Sem categoria'), l.meses, Number(l.cat?.valor_mensal || 0))).join('');
            }).join('')}
          </tbody>
          <tfoot>${linhaHTML('Total', somaCol.map(arred), S.categorias.filter((k) => k.tipo === tipoCat).reduce((s, k) => s + Number(k.valor_mensal || 0), 0), 'total')}</tfoot>
        </table>
      </div>
    </section>`;
}

// ---------------- Imposto de Renda (ano selecionado) ----------------
function impostoRenda(el) {
  const ano = S.ano, ini = `${ano}-01-01`, fim = `${ano}-12-31`;
  const doAno = S.lancs.filter((l) => l.data_pagamento >= ini && l.data_pagamento <= fim);
  const ded = doAno.filter((l) => l.tipo === 'saida' && l.dedutivel);
  const porCat = new Map();
  for (const l of ded) { const k = l.categoria_id || 'sem'; const x = porCat.get(k) || { total: 0, itens: [] }; x.total += Number(l.valor); x.itens.push(l); porCat.set(k, x); }
  const totDed = arred(ded.reduce((s2, l) => s2 + Number(l.valor), 0));
  const receitas = agrupar(S.lancs, ini, fim, (l) => nomeCat(l.categoria_id), 'entrada');
  const totRec = arred(receitas.reduce((s2, x) => s2 + x.total, 0));
  const contas = S.contas.map((c) => ({ c, v31: saldoConta(c, S.lancs, fim), vAnt: saldoConta(c, S.lancs, `${ano - 1}-12-31`) }));
  const semComprovante = ded.filter((l) => !l.comprovante).length;
  el.innerHTML = `
    <div class="aviso">🧾 Resumo para ajudar na declaração de <b>${ano}</b> (entregue em ${ano + 1}). Confira sempre com os informes oficiais de rendimentos, do banco e dos prestadores. <button class="btn btn-peq" data-imprimir>🖨️ Imprimir / PDF</button></div>
    <div class="grade2 imprimir-area">
      <section class="cartao-bloco span2"><div class="cab-lista"><h2>Despesas dedutíveis</h2><span class="pill">${brl(totDed)}</span></div>
        <p class="dica">Lançamentos marcados “🧾 Dedutível no IR” (marque na categoria em Cadastros para vir automático). ${semComprovante ? `⚠️ ${semComprovante} sem comprovante anexado.` : ''}</p>
        ${[...porCat.entries()].map(([k, x]) => `<details class="faq"><summary><b>${esc(k === 'sem' ? 'Sem categoria' : nomeCat(k))}</b> — ${brl(x.total)} (${x.itens.length})</summary>
          <table class="tabela"><tbody>${x.itens.sort((a, b) => a.data_movimento.localeCompare(b.data_movimento)).map((l) => `<tr><td>${l.data_movimento.split('-').reverse().join('/')}</td><td>${esc(l.descricao)}${l.comprovante ? ' 📎' : ''}</td><td class="num">${brl(l.valor)}</td></tr>`).join('')}</tbody></table></details>`).join('') || '<p class="dica">Nenhuma despesa marcada como dedutível neste ano.</p>'}
      </section>
      <section class="cartao-bloco"><div class="cab-lista"><h2>Rendimentos recebidos</h2><span class="pill">${brl(totRec)}</span></div>
        <table class="tabela"><tbody>${receitas.map((x) => `<tr><td>${esc(x.chave)}</td><td class="num">${brl(x.total)}</td></tr>`).join('') || '<tr><td class="dica">Sem receitas.</td></tr>'}</tbody></table></section>
      <section class="cartao-bloco"><h2>Bens e direitos (saldos)</h2>
        <table class="tabela"><thead><tr><th>Conta</th><th class="num">31/12/${ano - 1}</th><th class="num">31/12/${ano}</th></tr></thead><tbody>
        ${contas.map(({ c, v31, vAnt }) => `<tr><td>${esc(c.nome)}${c.moeda === 'USD' ? ' (US$)' : ''}</td><td class="num">${vAnt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="num">${v31.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
        ${S.investimentos.map((i) => `<tr><td>${esc(i.nome)} <small>${esc(i.instituicao)}</small></td><td class="num">—</td><td class="num">${Number(i.valor_aplicado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <small>aplicado</small></td></tr>`).join('')}
        </tbody></table>
        ${S.dividas.length ? `<h3>Dívidas e ônus</h3><table class="tabela"><tbody>${S.dividas.filter((d) => d.direcao === 'devo').map((d) => `<tr><td>${esc(d.nome)}</td><td class="num">${brl(d.saldo)}</td></tr>`).join('')}</tbody></table>` : ''}
        <p class="dica">Na declaração, investimentos entram pelo valor de custo (aplicado), não pelo valor de mercado.</p></section>
    </div>`;
  el.querySelector('[data-imprimir]').onclick = () => window.print();
}
