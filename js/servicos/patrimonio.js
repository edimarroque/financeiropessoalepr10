// Patrimônio líquido = contas + investimentos + valores a receber − dívidas (tudo em reais)
import * as db from '../db.js';
import { S } from '../state.js';
import { saldoConta, hoje, mesDe, montar, partes, arred, somarMesRef } from '../calc.js';
import { emReais } from './cotacao.js';

export const saldoContaBRL = (c, ate = hoje()) => emReais(saldoConta(c, S.lancs, ate), c.moeda);

/** Valor de um investimento numa data (pelo histórico; sem histórico, o valor atual se já existia) */
function valorInvEm(inv, ate) {
  const h = S.invHist.filter((x) => x.investimento_id === inv.id && x.data <= ate).sort((a, b) => a.data.localeCompare(b.data));
  if (h.length) return Number(h[h.length - 1].valor_atual);
  if (inv.atualizado_em <= ate || (inv.created_at || '').slice(0, 10) <= ate) return Number(inv.valor_atual);
  return 0;
}

export function composicao(ate = hoje()) {
  const contas = arred(S.contas.filter((c) => c.ativo).reduce((s, c) => s + saldoContaBRL(c, ate), 0));
  const investimentos = arred(S.investimentos.filter((i) => i.ativo).reduce((s, i) => s + emReais(ate === hoje() ? i.valor_atual : valorInvEm(i, ate), i.moeda), 0));
  const aReceber = arred(S.dividas.filter((d) => d.ativo && d.direcao === 'me_devem').reduce((s, d) => s + Number(d.saldo), 0));
  const dividas = arred(S.dividas.filter((d) => d.ativo && d.direcao === 'devo').reduce((s, d) => s + Number(d.saldo), 0));
  return { contas, investimentos, aReceber, dividas, total: arred(contas + investimentos + aReceber - dividas) };
}

/** Grava a foto do patrimônio do mês atual e completa meses anteriores que tenham lançamentos (até 12) */
export async function registrarPatrimonio() {
  if (!S.contas.length) return;
  const atual = mesDe(hoje());
  const linhas = [];
  const c = composicao();
  const ex = S.patrimonio.find((p) => p.mes === atual);
  if (!ex || Math.abs(Number(ex.total) - c.total) >= 0.01) linhas.push({ mes: atual, contas: c.contas, investimentos: c.investimentos, a_receber: c.aReceber, dividas: c.dividas, total: c.total });
  const primeiro = S.lancs.reduce((m, l) => (l.data_pagamento < m ? l.data_pagamento : m), hoje());
  for (let i = 1; i <= 12; i++) {
    const ref = somarMesRef(atual, -i);
    if (ref < mesDe(primeiro)) break;
    if (S.patrimonio.some((p) => p.mes === ref)) continue;
    const { y, m } = partes(ref + '-01');
    const x = composicao(montar(y, m, 31));
    linhas.push({ mes: ref, contas: x.contas, investimentos: x.investimentos, a_receber: x.aReceber, dividas: x.dividas, total: x.total });
  }
  if (!linhas.length) return;
  try {
    const salvos = await db.salvarVarios('patrimonio_mensal', linhas.map((l) => ({ ...l, updated_at: new Date().toISOString() })), 'user_id,mes');
    for (const s of salvos) { const i = S.patrimonio.findIndex((p) => p.mes === s.mes); if (i >= 0) S.patrimonio[i] = s; else S.patrimonio.push(s); }
    S.patrimonio.sort((a, b) => a.mes.localeCompare(b.mes));
  } catch (e) { console.warn('patrimônio', e.message); }
}
