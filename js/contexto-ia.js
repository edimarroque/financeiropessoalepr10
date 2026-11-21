// Monta um resumo compacto (texto) dos dados para a IA — pouco texto = pouca cota gasta.
// Função pura: usada no app (assistente) e no servidor (bot do Telegram).
import { resumoMes, saldoConta, somarMesRef, mesDe, hoje, nomeMes, assinaturasRepetidas, orcamentoCategorias, montar, partes,
  progressoMeta, arred, diasEntre } from './calc.js';

const v = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
const ENCARGO = /JUROS|IOF|MULTA|ENCARGO|TARIFA|ANUIDADE|MORA|ROTATIVO/i;

/**
 * d = { lancamentos, categorias, contas, cartoes, metas, metas_movimentos, dividas, investimentos }
 * opcoes.lancamentosDias: inclui a lista de lançamentos dos últimos N dias (para o chat)
 */
export function contextoIA(d, { meses = 6, lancamentosDias = 0, cotacao = 5.5 } = {}) {
  const hj = hoje(), atual = mesDe(hj);
  const cat = new Map(d.categorias.map((c) => [c.id, c]));
  const nomeCat = (id) => cat.get(id)?.nome || 'Sem categoria';
  const conta = new Map((d.contas || []).map((c) => [c.id, c]));
  const cartao = new Map((d.cartoes || []).map((c) => [c.id, c]));
  const L = [];
  L.push(`Hoje: ${hj}. Mês atual: ${nomeMes(atual)}. Valores em R$ (mês = data de pagamento; no cartão = vencimento da fatura).`);

  // contas
  const contas = (d.contas || []).filter((c) => c.ativo !== false).map((c) => {
    const s = saldoConta(c, d.lancamentos, hj);
    return `${c.nome}: ${c.moeda === 'USD' ? `US$ ${v(s)} (≈ R$ ${v(s * cotacao)})` : v(s)}`;
  });
  L.push(`\n# Saldo das contas hoje\n${contas.join('\n') || '—'}`);

  // meses
  L.push('\n# Últimos meses (receitas | despesas | saldo | encargos: juros/IOF/multas/tarifas)');
  for (let i = meses - 1; i >= 0; i--) {
    const ref = somarMesRef(atual, -i);
    const r = resumoMes(d.lancamentos, d.categorias, ref);
    const enc = d.lancamentos.filter((l) => l.tipo === 'saida' && mesDe(l.data_pagamento) === ref && ENCARGO.test(l.descricao || '')).reduce((s, l) => s + Number(l.valor), 0);
    L.push(`${ref}: ${v(r.receitas)} | ${v(r.despesas)} | ${v(r.saldo)} | ${v(enc)}`);
  }

  // categorias do mês atual e anterior
  for (const ref of [atual, somarMesRef(atual, -1)]) {
    const r = resumoMes(d.lancamentos, d.categorias, ref);
    const linhas = [...r.porCategoria.values()].filter((x) => x.tipo === 'saida').sort((a, b) => b.total - a.total)
      .map((x) => `${x.categoria ? x.categoria.nome : 'Sem categoria'} (${x.categoria?.grupo || '-'}): ${v(x.total)}${Number(x.categoria?.valor_mensal) ? ` / limite ${v(x.categoria.valor_mensal)}` : ''}`);
    L.push(`\n# Despesas por categoria — ${nomeMes(ref)}\n${linhas.join('\n') || '—'}`);
  }

  // onde mais gasta (3 meses)
  const desde = somarMesRef(atual, -2) + '-01';
  const est = new Map();
  for (const l of d.lancamentos) {
    if (l.tipo !== 'saida' || l.data_pagamento < desde) continue;
    const k = String(l.descricao || '').toUpperCase().replace(/\d+/g, '').replace(/PARCELA.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!k) continue;
    const x = est.get(k) || { t: 0, n: 0 }; x.t += Number(l.valor); x.n++; est.set(k, x);
  }
  L.push(`\n# Onde mais gastou nos últimos 3 meses (descrição: total, vezes)\n${[...est.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 15).map(([k, x]) => `${k}: ${v(x.t)}, ${x.n}x`).join('\n')}`);

  // assinaturas, orçamento, compromissos
  const ass = assinaturasRepetidas(d.lancamentos).slice(0, 12);
  if (ass.length) L.push(`\n# Gastos repetidos todo mês (assinaturas)\n${ass.map((a) => `${a.descricao}: ~${v(a.media)}/mês em ${a.meses} meses${a.duplicadoNoMes ? ' (COBRADO 2x num mesmo mês)' : ''}`).join('\n')}`);
  const { y, m } = partes(atual + '-01');
  const orc = orcamentoCategorias(d.lancamentos, d.categorias, montar(y, m, 1), montar(y, m, 31)).filter((o) => o.p >= 0.8);
  if (orc.length) L.push(`\n# Categorias perto/acima do limite neste mês\n${orc.map((o) => `${o.categoria.nome}: ${Math.round(o.p * 100)}% (${v(o.gasto)} de ${v(o.limite)})`).join('\n')}`);
  const fut = [];
  for (let i = 1; i <= 6; i++) {
    const ref = somarMesRef(atual, i);
    const parc = d.lancamentos.filter((l) => l.situacao === 'pendente' && l.tipo === 'saida' && mesDe(l.data_pagamento) === ref);
    const t = parc.reduce((s, l) => s + Number(l.valor), 0);
    if (t) fut.push(`${ref}: ${v(t)} (${parc.length} itens: cartão ${v(parc.filter((l) => l.cartao_id).reduce((s, l) => s + Number(l.valor), 0))})`);
  }
  if (fut.length) L.push(`\n# Já comprometido nos próximos meses (pendências, parcelas, recorrentes)\n${fut.join('\n')}`);

  // metas, dívidas, investimentos
  const metas = (d.metas || []).filter((x) => !x.concluida).map((x) => { const p = progressoMeta(x, d.metas_movimentos || []); return `${x.nome}: ${v(p.atual)} de ${v(p.alvo)}${x.prazo ? `, prazo ${x.prazo}, precisa ${v(p.mensalNecessario || 0)}/mês` : ''}`; });
  if (metas.length) L.push(`\n# Metas\n${metas.join('\n')}`);
  const div = (d.dividas || []).filter((x) => x.ativo).map((x) => `${x.direcao === 'devo' ? 'DEVO' : 'ME DEVEM'} ${x.nome}: saldo ${v(x.saldo)}${x.taxa_mensal ? `, juros ${x.taxa_mensal}% a.m.` : ''}${x.parcela_valor ? `, parcela ${v(x.parcela_valor)}` : ''}`);
  if (div.length) L.push(`\n# Dívidas e empréstimos\n${div.join('\n')}`);
  const inv = (d.investimentos || []).filter((x) => x.ativo).map((x) => `${x.nome} (${x.classe}${x.subtipo ? ' ' + x.subtipo : ''}): aplicado ${v(x.valor_aplicado)}, atual ${v(x.valor_atual)}${x.moeda === 'USD' ? ' US$' : ''}`);
  if (inv.length) L.push(`\n# Investimentos\n${inv.join('\n')}`);

  // lista de lançamentos recentes (chat)
  if (lancamentosDias > 0) {
    const ini = (() => { const t = new Date(); t.setDate(t.getDate() - lancamentosDias); return t.toISOString().slice(0, 10); })();
    const ls = d.lancamentos.filter((l) => l.data_movimento >= ini || (l.situacao === 'pendente' && diasEntre(hj, l.data_pagamento) <= 45))
      .sort((a, b) => a.data_movimento.localeCompare(b.data_movimento)).slice(-400);
    L.push(`\n# Lançamentos (data_compra;data_pagto;tipo;descrição;valor;categoria;onde;situação)\n${ls.map((l) => [l.data_movimento, l.data_pagamento, l.tipo, (l.descricao || '').slice(0, 40), v(l.valor), nomeCat(l.categoria_id),
      l.cartao_id ? 'cartão ' + (cartao.get(l.cartao_id)?.nome || '') : (conta.get(l.conta_id)?.nome || ''), l.situacao].join(';')).join('\n')}`);
  }
  void arred;
  return L.join('\n');
}
