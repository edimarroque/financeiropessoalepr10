// Relatório mensal em HTML (vira PDF no navegador, no Google Drive ou no envio pelo Telegram).
// Função pura: recebe os dados e devolve o HTML completo — roda no navegador e no servidor (Vercel).
import { resumoMes, saldoConta, somarMesRef, nomeMes, fmtData, arred, GRUPOS_DESPESA, META_GRUPO, orcamentoCategorias,
  montar, partes, progressoMeta, hoje } from './calc.js';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let ocultarValores = false; // modo privacidade só na prévia da tela (o PDF salvo/impresso sai com os valores)
const brl = (v) => (ocultarValores ? 'R$ ***' : fmt.format(Number(v) || 0));
const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Números do mês, usados no relatório, no Telegram e na IA */
export function numerosDoMes(d, ref) {
  const r = resumoMes(d.lancamentos, d.categorias, ref);
  const ant = resumoMes(d.lancamentos, d.categorias, somarMesRef(ref, -1));
  const { y, m } = partes(ref + '-01');
  const ini = montar(y, m, 1), fim = montar(y, m, 31);
  const catPorId = new Map(d.categorias.map((c) => [c.id, c]));
  const doMes = d.lancamentos.filter((l) => l.data_pagamento >= ini && l.data_pagamento <= fim);
  const maiores = doMes.filter((l) => l.tipo === 'saida').sort((a, b) => b.valor - a.valor).slice(0, 10);
  const porCat = [...r.porCategoria.values()].filter((x) => x.tipo === 'saida').sort((a, b) => b.total - a.total);
  const faturas = (d.cartoes || []).map((c) => {
    const itens = doMes.filter((l) => l.cartao_id === c.id && (l.tipo === 'saida' || l.tipo === 'entrada'));
    return { cartao: c, total: arred(itens.reduce((s, l) => s + (l.tipo === 'saida' ? 1 : -1) * Number(l.valor), 0)), pendente: itens.some((l) => l.situacao === 'pendente') };
  }).filter((f) => f.total);
  const contas = (d.contas || []).filter((c) => c.ativo !== false).map((c) => ({ conta: c, saldo: saldoConta(c, d.lancamentos, fim) }));
  const encargos = arred(doMes.filter((l) => l.tipo === 'saida' && /JUROS|IOF|MULTA|ENCARGO|TARIFA|ANUIDADE|MORA|ROTATIVO/i.test(l.descricao || '')).reduce((s, l) => s + Number(l.valor), 0));
  const orc = orcamentoCategorias(d.lancamentos, d.categorias, ini, fim).filter((o) => o.nivel !== 'ok');
  const pendentes = d.lancamentos.filter((l) => l.situacao === 'pendente' && l.tipo === 'saida' && !l.cartao_id && l.data_pagamento > fim && l.data_pagamento <= montar(y, m + 1, 31))
    .sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento)).slice(0, 12);
  return { ref, r, ant, ini, fim, catPorId, maiores, porCat, faturas, contas, encargos, orc, pendentes };
}

export function htmlRelatorio(d, ref, { nome = '', ocultar = false } = {}) {
  ocultarValores = !!ocultar;
  try { return montarRelatorio(d, ref, nome); } finally { ocultarValores = false; }
}

function montarRelatorio(d, ref, nome) {
  const n = numerosDoMes(d, ref);
  const { r, ant } = n;
  const varDesp = ant.despesas ? (r.despesas - ant.despesas) / ant.despesas : null;
  const guardou = r.receitas ? Math.max(0, r.saldo) / r.receitas : 0;
  const base = r.receitas || r.despesas || 1;
  const metas = (d.metas || []).filter((m) => !m.concluida).map((m) => ({ m, p: progressoMeta(m, d.metas_movimentos || []) }));
  const linhaCat = (x) => {
    const c = x.categoria; const lim = Number(c?.valor_mensal || 0);
    return `<tr><td>${e(c ? `${c.emoji || ''} ${c.nome}` : 'Sem categoria')}</td><td class="n">${brl(x.total)}</td><td class="n">${pct(x.total / (r.despesas || 1))}</td><td class="n ${lim && x.total > lim ? 'neg' : ''}">${lim ? brl(lim) : '—'}</td></tr>`;
  };
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${e(nomeMes(ref))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11pt; margin: 0; }
  h1 { font-size: 20pt; margin: 0; } h2 { font-size: 12.5pt; margin: 18px 0 6px; color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 3px; }
  .topo { background: #4f46e5; color: #fff; padding: 14px 18px; border-radius: 10px; }
  .topo small { color: #e0e7ff; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  th { font-size: 8.5pt; color: #64748b; text-transform: uppercase; } .n { text-align: right; white-space: nowrap; }
  .kpi td { border: 0; padding: 8px; width: 25%; } .kpi b { display: block; font-size: 14pt; } .kpi small { color: #64748b; }
  .caixa { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .pos { color: #059669; } .neg { color: #e11d48; } .alerta { background: #fff7ed; border: 1px solid #fed7aa; padding: 8px 10px; border-radius: 8px; margin: 6px 0; }
  .barra { background: #e2e8f0; height: 8px; border-radius: 4px; } .barra div { background: #6366f1; height: 8px; border-radius: 4px; }
  .rodape { margin-top: 18px; color: #94a3b8; font-size: 8.5pt; text-align: center; }
</style></head><body>
<div class="topo"><h1>Relatório financeiro — ${e(nomeMes(ref))}</h1><small>${e(nome)}${nome ? ' · ' : ''}gerado em ${fmtData(hoje())} · Financeiro Pessoal</small></div>

<table class="kpi caixa" style="margin-top:12px"><tr>
  <td><small>Ganhos</small><b class="pos">${brl(r.receitas)}</b></td>
  <td><small>Gastos</small><b class="neg">${brl(r.despesas)}</b><small>${varDesp === null ? '' : `${varDesp > 0 ? '▲' : '▼'} ${pct(Math.abs(varDesp))} vs. mês anterior`}</small></td>
  <td><small>Saldo do mês</small><b class="${r.saldo >= 0 ? 'pos' : 'neg'}">${brl(r.saldo)}</b><small>guardou ${pct(guardou)} dos ganhos</small></td>
  <td><small>Pendências</small><b>${brl(r.pendentesValor)}</b><small>${r.pendentesQtd} item(ns)</small></td>
</tr></table>

${n.orc.length ? `<div class="alerta">⚠️ <b>Orçamento:</b> ${n.orc.map((o) => `${e(o.categoria.nome)} ${pct(o.p)} do limite`).join(' · ')}</div>` : ''}
${n.encargos ? `<div class="alerta">💸 <b>Juros, IOF, multas e tarifas no mês:</b> ${brl(n.encargos)} — dinheiro que dá para economizar.</div>` : ''}

<h2>Distribuição dos gastos (ideal 50 / 30 / 20)</h2>
<table>${GRUPOS_DESPESA.map((g) => { const v = r.porGrupo.get(g) || 0; return `<tr><td style="width:40%">${e(g)}</td><td class="n">${brl(v)}</td><td class="n">${pct(v / base)} <small>(ideal ${pct(META_GRUPO[g])})</small></td></tr>`; }).join('')}</table>

<h2>Gastos por categoria</h2>
<table><tr><th>Categoria</th><th class="n">Total</th><th class="n">% dos gastos</th><th class="n">Limite</th></tr>${n.porCat.slice(0, 15).map(linhaCat).join('') || '<tr><td colspan="4">Sem gastos.</td></tr>'}</table>

<h2>Maiores gastos</h2>
<table>${n.maiores.map((l) => `<tr><td>${fmtData(l.data_movimento)}</td><td>${e(l.descricao || '')}</td><td>${e(n.catPorId.get(l.categoria_id)?.nome || '')}</td><td class="n">${brl(l.valor)}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table>

${n.faturas.length ? `<h2>Faturas de cartão do mês</h2><table>${n.faturas.map((f) => `<tr><td>💳 ${e(f.cartao.nome)}</td><td class="n">${brl(f.total)}</td><td class="n">${f.pendente ? 'em aberto' : 'paga'}</td></tr>`).join('')}</table>` : ''}

<h2>Saldo das contas no fim do mês</h2>
<table>${n.contas.map((c) => `<tr><td>🏦 ${e(c.conta.nome)}${c.conta.moeda === 'USD' ? ' (US$)' : ''}</td><td class="n">${c.conta.moeda === 'USD' ? 'US$ ' + c.saldo.toFixed(2).replace('.', ',') : brl(c.saldo)}</td></tr>`).join('')}</table>

${n.pendentes.length ? `<h2>Contas a pagar no próximo mês</h2><table>${n.pendentes.map((l) => `<tr><td>${fmtData(l.data_pagamento)}</td><td>${e(l.descricao)}</td><td class="n">${brl(l.valor)}</td></tr>`).join('')}</table>` : ''}

${metas.length ? `<h2>Metas</h2><table>${metas.map(({ m, p }) => `<tr><td style="width:35%">${e(m.emoji || '🎯')} ${e(m.nome)}</td><td><div class="barra"><div style="width:${(p.p * 100).toFixed(0)}%"></div></div></td><td class="n">${brl(p.atual)} de ${brl(p.alvo)} (${pct(p.p)})</td></tr>`).join('')}</table>` : ''}

<p class="rodape">Relatório gerado automaticamente pelo app Financeiro Pessoal. Valores pela data de pagamento (no cartão, o vencimento da fatura).</p>
</body></html>`;
}
