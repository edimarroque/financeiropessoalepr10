// Sugestão automática de categoria: 1º as regras do usuário ("contém X" → categoria), 2º o histórico de lançamentos.
// O app "aprende": quanto mais lançamentos classificados, melhores as sugestões; e ele propõe regras novas.
import { S } from './state.js';
import { normDesc, chavesDesc } from './import/parsers.js';

let cacheIdx = null, cacheRef = null;

function indice() {
  if (cacheIdx && cacheRef === S.lancs) return cacheIdx;
  const idx = new Map(); // chave -> Map(categoria_id -> contagem)
  for (const l of S.lancs) {
    if (!l.categoria_id || (l.tipo !== 'saida' && l.tipo !== 'entrada')) continue;
    for (const k of chavesDesc(l.descricao)) {
      if (!idx.has(k)) idx.set(k, new Map());
      const m = idx.get(k);
      m.set(l.categoria_id, (m.get(l.categoria_id) || 0) + 1);
    }
  }
  cacheIdx = idx; cacheRef = S.lancs;
  return idx;
}

/** Regra que casa com a descrição (a mais longa/específica vence) */
export function regraPara(desc, tipo) {
  const n = normDesc(desc);
  if (!n) return null;
  const tipoL = tipo === 'entrada' ? 'entrada' : 'saida';
  let melhor = null;
  for (const r of S.regras || []) {
    if (r.tipo !== tipoL) continue;
    const c = normDesc(r.contem);
    if (c && (` ${n} `).includes(` ${c} `) || (c.length >= 4 && n.includes(c))) {
      if (!melhor || c.length > normDesc(melhor.contem).length) melhor = r;
    }
  }
  return melhor;
}

/** Devolve { categoria_id, origem: 'regra'|'historico' } ou null */
export function sugerir(desc, tipo) {
  if (tipo !== 'entrada' && tipo !== 'saida') return null;
  const r = regraPara(desc, tipo);
  if (r && S.categorias.some((c) => c.id === r.categoria_id)) return { categoria_id: r.categoria_id, origem: 'regra' };
  const tipoCat = tipo === 'entrada' ? 'receita' : 'despesa';
  const idx = indice();
  for (const k of chavesDesc(desc)) {
    const m = idx.get(k);
    if (!m) continue;
    const ord = [...m.entries()].filter(([id]) => S.categorias.some((c) => c.id === id && c.tipo === tipoCat)).sort((a, b) => b[1] - a[1]);
    if (ord.length) return { categoria_id: ord[0][0], origem: 'historico' };
  }
  return null;
}

/**
 * Regras que o app aprendeu e propõe: palavras que aparecem em 3+ lançamentos,
 * sempre (≥ 90%) com a mesma categoria, e que ainda não têm regra.
 */
export function regrasSugeridas(limite = 12) {
  const cont = new Map(); // tipo|chave -> Map(cat -> n)
  for (const l of S.lancs) {
    if (!l.categoria_id || (l.tipo !== 'saida' && l.tipo !== 'entrada')) continue;
    const ks = chavesDesc(l.descricao);
    const k = ks[1] || ks[0];
    if (!k || k.length < 3) continue;
    const kk = `${l.tipo}|${k}`;
    if (!cont.has(kk)) cont.set(kk, new Map());
    const m = cont.get(kk);
    m.set(l.categoria_id, (m.get(l.categoria_id) || 0) + 1);
  }
  const out = [];
  for (const [kk, m] of cont) {
    const [tipo, contem] = kk.split('|');
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [cat, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total < 3 || n / total < 0.9) continue;
    const ja = regraPara(contem, tipo);
    if (ja) continue;
    if (!S.categorias.some((c) => c.id === cat)) continue;
    out.push({ tipo, contem, categoria_id: cat, qtd: total });
  }
  return out.sort((a, b) => b.qtd - a.qtd).slice(0, limite);
}
