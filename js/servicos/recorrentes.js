// Gera os lançamentos pendentes das recorrências (até o mês que vem) sempre que o app abre ou uma recorrência muda.
import * as db from '../db.js';
import { S, recarregarLancamentos, cartaoPorId } from '../state.js';
import { gerarRecorrencias, hoje, somarMesRef, mesDe } from '../calc.js';

export async function sincronizarRecorrentes() {
  if (!S.recorrentes?.length) return 0;
  const ate = somarMesRef(mesDe(hoje()), 1);
  const existentes = new Set(S.lancs.map((l) => l.chave_dedup).filter(Boolean));
  let criados = 0;
  for (const r of S.recorrentes) {
    const cartao = r.cartao_id ? cartaoPorId(r.cartao_id) : null;
    if (r.cartao_id && !cartao) continue;
    const novos = gerarRecorrencias(r, ate, cartao);
    if (!novos.length) continue;
    const gravar = novos.filter((n) => !existentes.has(n.chave_dedup)).map(({ ref, ...n }) => n);
    try {
      if (gravar.length) { await db.inserir('lancamentos', gravar); criados += gravar.length; }
      const ultimo = novos[novos.length - 1].ref;
      await db.atualizar('recorrentes', r.id, { ultimo_mes: ultimo });
      r.ultimo_mes = ultimo;
    } catch (e) { console.warn('recorrente', r.descricao, e.message); }
  }
  if (criados) await recarregarLancamentos();
  return criados;
}
