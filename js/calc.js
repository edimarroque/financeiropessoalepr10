// Regras de cálculo (sem acesso a banco/tela) — datas sempre em texto 'AAAA-MM-DD'

export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export const GRUPOS_DESPESA = ['Despesas Essenciais', 'Despesas Não Essenciais', 'Metas / Investimentos'];
export const GRUPOS_RECEITA = ['Renda Ativa', 'Renda Passiva'];
// Distribuição ideal (mesma da planilha: 50 / 30 / 20)
export const META_GRUPO = { 'Despesas Essenciais': 0.5, 'Despesas Não Essenciais': 0.3, 'Metas / Investimentos': 0.2 };

const pad = (n) => String(n).padStart(2, '0');

export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function partes(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function diasNoMes(y, m) { // m = 1..12
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function montar(y, m, d) { // normaliza mês fora de 1..12 e limita o dia ao fim do mês
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}-${pad(Math.min(d, diasNoMes(y, m)))}`;
}

export function somarMeses(iso, n) {
  const { y, m, d } = partes(iso);
  return montar(y, m + n, d);
}

export function somarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mesDe(iso) { return iso.slice(0, 7); }          // 'AAAA-MM'
export function somarMesRef(ref, n) { return somarMeses(ref + '-01', n).slice(0, 7); }
export function nomeMes(ref) { const { y, m } = partes(ref + '-01'); return `${MESES[m - 1]} ${y}`; }
export function fmtData(iso) { if (!iso) return ''; const { y, m, d } = partes(iso); return `${pad(d)}/${pad(m)}/${y}`; }

export function arred(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }

// ---------------------------------------------------------------------
// Cartão de crédito
// Compra feita ANTES do dia de fechamento entra na fatura que fecha neste mês;
// no dia do fechamento ou depois, entra na fatura do mês seguinte.
// O vencimento é o primeiro "dia de vencimento" depois do fechamento.
// ---------------------------------------------------------------------
export function fechamentoDaCompra(dataCompra, diaFech) {
  const { y, m, d } = partes(dataCompra);
  return d < diaFech ? montar(y, m, diaFech) : montar(y, m + 1, diaFech);
}

export function vencimentoDoFechamento(fechamento, diaFech, diaVenc) {
  const { y, m } = partes(fechamento);
  return diaVenc > diaFech ? montar(y, m, diaVenc) : montar(y, m + 1, diaVenc);
}

export function vencimentoDaCompra(dataCompra, cartao) {
  const f = fechamentoDaCompra(dataCompra, cartao.dia_fechamento);
  return vencimentoDoFechamento(f, cartao.dia_fechamento, cartao.dia_vencimento);
}

// Fechamento correspondente a um vencimento (para mostrar o período da fatura)
export function fechamentoDoVencimento(venc, cartao) {
  const { y, m } = partes(venc);
  return cartao.dia_vencimento > cartao.dia_fechamento
    ? montar(y, m, cartao.dia_fechamento)
    : montar(y, m - 1, cartao.dia_fechamento);
}

// Próxima fatura a vencer (a que ainda está aberta ou fechada mas não vencida)
export function vencimentoAtual(cartao, ref = hoje()) {
  return vencimentoDaCompra(ref, cartao);
}

// ---------------------------------------------------------------------
// Parcelas: divide o valor total; centavos que sobram ficam na 1ª parcela
// ---------------------------------------------------------------------
export function dividirParcelas(total, n) {
  const centavos = Math.round(Number(total) * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? resto : 0)) / 100);
}

/**
 * Gera as linhas de um lançamento (1 ou várias parcelas).
 * dados: { data_movimento, valor (total), parcelas, cartao? , data_pagamento? }
 */
export function gerarParcelas(dados) {
  const n = Math.max(1, Number(dados.parcelas) || 1);
  const valores = dividirParcelas(dados.valor, n);
  const primeiraData = dados.cartao
    ? vencimentoDaCompra(dados.data_movimento, dados.cartao)
    : (dados.data_pagamento || dados.data_movimento);
  return valores.map((v, i) => ({
    valor: v,
    data_pagamento: somarMeses(primeiraData, i),
    parcela_num: n > 1 ? i + 1 : null,
    parcela_total: n > 1 ? n : null,
  }));
}

// ---------------------------------------------------------------------
// Saldos e resumos
// ---------------------------------------------------------------------
const realizado = (l) => l.situacao === 'pago' || l.situacao === 'recebido';

export function saldoConta(conta, lancs, ate = null) {
  let s = Number(conta.saldo_inicial) || 0;
  for (const l of lancs) {
    if (!realizado(l)) continue;
    if (l.data_pagamento < conta.data_saldo) continue;
    if (ate && l.data_pagamento > ate) continue;
    // conta em dólar: usa o valor na moeda da conta (o campo valor guarda o equivalente em reais)
    const v = conta.moeda && conta.moeda !== 'BRL' && l.valor_moeda != null ? Number(l.valor_moeda) : Number(l.valor);
    if (l.tipo === 'entrada' && l.conta_id === conta.id && !l.cartao_id) s += v;
    else if (l.tipo === 'saida' && l.conta_id === conta.id && !l.cartao_id) s -= v;
    else if (l.tipo === 'pagamento_fatura' && l.conta_id === conta.id) s -= v;
    else if (l.tipo === 'transferencia') {
      if (l.conta_id === conta.id) s -= v;
      if (l.conta_destino_id === conta.id) s += v;
    }
  }
  return arred(s);
}

/** Resumo de um mês ('AAAA-MM') pela data de pagamento, como na planilha */
export function resumoMes(lancs, categorias, ref) {
  const catPorId = new Map(categorias.map((c) => [c.id, c]));
  const r = {
    receitas: 0, receitasRecebidas: 0, despesas: 0, despesasPagas: 0,
    pendentesQtd: 0, pendentesValor: 0,
    porCategoria: new Map(), porGrupo: new Map(),
  };
  for (const l of lancs) {
    if (mesDe(l.data_pagamento) !== ref) continue;
    if (l.tipo !== 'entrada' && l.tipo !== 'saida') continue;
    const v = Number(l.valor);
    const cat = catPorId.get(l.categoria_id);
    const grupo = cat ? cat.grupo : (l.tipo === 'entrada' ? 'Sem categoria (receita)' : 'Sem categoria');
    const chave = l.categoria_id || ('sem-' + l.tipo);
    if (l.tipo === 'entrada') {
      r.receitas += v; if (realizado(l)) r.receitasRecebidas += v;
    } else {
      r.despesas += v; if (realizado(l)) r.despesasPagas += v;
    }
    if (!realizado(l)) { r.pendentesQtd++; r.pendentesValor += v; }
    const pc = r.porCategoria.get(chave) || { categoria: cat || null, tipo: l.tipo, total: 0, qtd: 0 };
    pc.total += v; pc.qtd++;
    r.porCategoria.set(chave, pc);
    r.porGrupo.set(grupo, (r.porGrupo.get(grupo) || 0) + v);
  }
  r.saldo = arred(r.receitas - r.despesas);
  for (const k of ['receitas', 'receitasRecebidas', 'despesas', 'despesasPagas', 'pendentesValor']) r[k] = arred(r[k]);
  return r;
}

/** Itens de uma fatura (cartão + vencimento). Entradas no cartão (estornos) abatem. */
export function fatura(cartao, lancs, venc) {
  const itens = lancs.filter((l) => l.cartao_id === cartao.id && l.data_pagamento === venc && (l.tipo === 'saida' || l.tipo === 'entrada'));
  const total = arred(itens.reduce((s, l) => s + (l.tipo === 'saida' ? 1 : -1) * Number(l.valor), 0));
  const pendentes = itens.filter((l) => l.situacao === 'pendente');
  return {
    venc,
    fechamento: fechamentoDoVencimento(venc, cartao),
    itens: itens.sort((a, b) => a.data_movimento.localeCompare(b.data_movimento)),
    total,
    paga: itens.length > 0 && pendentes.length === 0,
  };
}

/**
 * Qual fatura um pagamento quita (devolve o vencimento ou null).
 * 1º: fatura com total igual ao valor pago (±5 centavos), vencida até 45 dias antes ou até 20 dias depois do pagamento;
 * 2º: a fatura ainda pendente com vencimento mais próximo nessa janela.
 */
export function faturaDoPagamento(cartao, lancs, valor, data) {
  if (!cartao || !data) return null;
  const ini = somarDias(data, -45), fim = somarDias(data, 20);
  const vencs = vencimentosDoCartao(cartao, lancs).filter((v) => v >= ini && v <= fim);
  const dist = (v) => Math.abs(new Date(v) - new Date(data));
  const fats = vencs.map((v) => fatura(cartao, lancs, v)).filter((f) => f.itens.length).sort((a, b) => dist(a.venc) - dist(b.venc));
  const igual = fats.filter((f) => Math.abs(f.total - Number(valor)) <= 0.05);
  return (igual.find((f) => !f.paga) || igual[0] || fats.find((f) => !f.paga))?.venc || null;
}

/** Lista de vencimentos que têm lançamentos no cartão, do mais recente ao mais antigo */
export function vencimentosDoCartao(cartao, lancs) {
  const s = new Set(lancs.filter((l) => l.cartao_id === cartao.id && l.tipo !== 'pagamento_fatura').map((l) => l.data_pagamento));
  s.add(vencimentoAtual(cartao));
  return [...s].sort().reverse();
}

/** Limite usado = tudo que está no cartão e ainda não foi pago (inclui parcelas futuras) */
export function limiteUsado(cartao, lancs) {
  return arred(lancs
    .filter((l) => l.cartao_id === cartao.id && l.situacao === 'pendente' && (l.tipo === 'saida' || l.tipo === 'entrada'))
    .reduce((s, l) => s + (l.tipo === 'saida' ? 1 : -1) * Number(l.valor), 0));
}

/** Situação padrão de um lançamento novo */
export function situacaoPadrao(tipo, dataPagamento, viaCartao) {
  if (viaCartao) return 'pendente';
  if (dataPagamento > hoje()) return 'pendente';
  return tipo === 'entrada' ? 'recebido' : 'pago';
}

/** Evolução dos últimos n meses terminando em ref */
export function evolucao(lancs, categorias, ref, n = 12) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = somarMesRef(ref, -i);
    const r = resumoMes(lancs, categorias, m);
    out.push({ ref: m, receitas: r.receitas, despesas: r.despesas, saldo: r.saldo });
  }
  return out;
}

// ---------------------------------------------------------------------
// v1.2 — período por ano/mês, resumos por intervalo e análises
// ---------------------------------------------------------------------
export const MESES_CURTOS = MESES.map((m) => m.slice(0, 3));
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Intervalo de datas de um período. mes = 1..12, ou 0 para o ano inteiro */
export function intervalo(ano, mes) {
  if (!mes) return { ini: `${ano}-01-01`, fim: `${ano}-12-31` };
  return { ini: montar(ano, mes, 1), fim: montar(ano, mes, 31) };
}

export function periodoAnterior(ano, mes) {
  if (!mes) return { ano: ano - 1, mes: 0 };
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function diaAnterior(iso) {
  const { y, m, d } = partes(iso);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diasEntre(ini, fim) {
  const a = partes(ini), b = partes(fim);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
}

/** Resumo de um intervalo [ini, fim] pela data de pagamento */
export function resumoIntervalo(lancs, categorias, ini, fim) {
  const r = resumoMes(lancs.filter((l) => l.data_pagamento >= ini && l.data_pagamento <= fim)
    .map((l) => ({ ...l, data_pagamento: '0000-00-01' })), categorias, '0000-00');
  r.aReceber = arred(lancs.filter((l) => l.tipo === 'entrada' && l.situacao === 'pendente' && l.data_pagamento >= ini && l.data_pagamento <= fim).reduce((s, l) => s + Number(l.valor), 0));
  r.aPagar = arred(lancs.filter((l) => l.tipo === 'saida' && l.situacao === 'pendente' && l.data_pagamento >= ini && l.data_pagamento <= fim).reduce((s, l) => s + Number(l.valor), 0));
  return r;
}

/** Total por categoria em cada mês do ano: Map(categoria_id|'sem-saida') -> [12 valores] */
export function matrizAnual(lancs, ano) {
  const m = new Map();
  for (const l of lancs) {
    if (l.tipo !== 'entrada' && l.tipo !== 'saida') continue;
    const { y, m: mes } = partes(l.data_pagamento);
    if (y !== ano) continue;
    const k = l.categoria_id || ('sem-' + l.tipo);
    if (!m.has(k)) m.set(k, { tipo: l.tipo, meses: Array(12).fill(0) });
    m.get(k).meses[mes - 1] += Number(l.valor);
  }
  for (const v of m.values()) v.meses = v.meses.map(arred);
  return m;
}

/** Soma de despesas e receitas por dia (data da compra/movimento) de um mês */
export function porDia(lancs, ano, mes) {
  const pref = `${ano}-${pad(mes)}-`;
  const dias = new Map();
  for (const l of lancs) {
    if (!l.data_movimento.startsWith(pref)) continue;
    if (l.tipo !== 'entrada' && l.tipo !== 'saida') continue;
    const d = Number(l.data_movimento.slice(8, 10));
    if (!dias.has(d)) dias.set(d, { gastos: 0, ganhos: 0, itens: [] });
    const x = dias.get(d);
    if (l.tipo === 'saida') x.gastos += Number(l.valor); else x.ganhos += Number(l.valor);
    x.itens.push(l);
  }
  for (const x of dias.values()) { x.gastos = arred(x.gastos); x.ganhos = arred(x.ganhos); }
  return dias;
}

/** Agrupa despesas do intervalo por uma chave (função) e devolve ordenado */
export function agrupar(lancs, ini, fim, chave, tipo = 'saida') {
  const m = new Map();
  for (const l of lancs) {
    if (l.tipo !== tipo || l.data_pagamento < ini || l.data_pagamento > fim) continue;
    const k = chave(l);
    if (k == null) continue;
    const x = m.get(k) || { chave: k, total: 0, qtd: 0 };
    x.total += Number(l.valor); x.qtd++;
    m.set(k, x);
  }
  return [...m.values()].map((x) => ({ ...x, total: arred(x.total) })).sort((a, b) => b.total - a.total);
}

/** Variação percentual (null se não houver base) */
export function variacao(atual, anterior) {
  if (!anterior) return null;
  return (atual - anterior) / Math.abs(anterior);
}

// ---------------------------------------------------------------------
// v1.4 — recorrentes (aluguel, assinaturas, salário…) e assinaturas repetidas
// ---------------------------------------------------------------------
/**
 * Lançamentos que uma recorrência ainda precisa gerar, do mês seguinte a `ultimo_mes` (ou do início) até `ateMes` ('AAAA-MM').
 * No cartão, a data de pagamento é o vencimento da fatura daquela data de compra.
 */
export function gerarRecorrencias(rec, ateMes, cartao = null) {
  if (!rec.ativo) return [];
  let ref = rec.ultimo_mes ? somarMesRef(rec.ultimo_mes, 1) : mesDe(rec.inicio);
  const fimRef = rec.fim && mesDe(rec.fim) < ateMes ? mesDe(rec.fim) : ateMes;
  const out = [];
  for (let i = 0; ref <= fimRef && i < 60; i++, ref = somarMesRef(ref, 1)) {
    const { y, m } = partes(ref + '-01');
    const data = montar(y, m, rec.dia);
    if (data < rec.inicio) continue;
    const pag = cartao ? vencimentoDaCompra(data, cartao) : data;
    out.push({
      ref, data_movimento: data, data_pagamento: pag, tipo: rec.tipo, descricao: rec.descricao, valor: Number(rec.valor),
      categoria_id: rec.categoria_id || null, conta_id: cartao ? null : (rec.conta_id || null), cartao_id: cartao ? cartao.id : null,
      conta_destino_id: null, metodo: cartao ? 'Crédito' : (rec.metodo || ''), situacao: 'pendente', origem: 'recorrente',
      recorrente_id: rec.id, chave_dedup: `rec:${rec.id}:${ref}`,
    });
  }
  return out;
}

/** Despesas que se repetem todo mês (mesma descrição, valor parecido) — prováveis assinaturas */
export function assinaturasRepetidas(lancs, { minMeses = 3, tolerancia = 0.15 } = {}) {
  const grupos = new Map();
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\d+/g, ' ').replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const l of lancs) {
    if (l.tipo !== 'saida' || l.parcela_total) continue;
    const k = norm(l.descricao);
    if (k.length < 3) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  const out = [];
  for (const [k, ls] of grupos) {
    const porMes = new Map();
    for (const l of ls) { const r = mesDe(l.data_movimento); if (!porMes.has(r)) porMes.set(r, []); porMes.get(r).push(l); }
    if (porMes.size < minMeses) continue;
    const valores = ls.map((l) => Number(l.valor));
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    if (valores.some((v) => Math.abs(v - media) > media * tolerancia)) continue;
    const meses = [...porMes.keys()].sort();
    const duplicadoNoMes = [...porMes.values()].some((x) => x.length > 1);
    const ultimo = ls.slice().sort((a, b) => b.data_movimento.localeCompare(a.data_movimento))[0];
    out.push({ descricao: ultimo.descricao, chave: k, media: arred(media), meses: meses.length, ultimoMes: meses[meses.length - 1],
      anual: arred(media * 12), duplicadoNoMes, cartao_id: ultimo.cartao_id, conta_id: ultimo.conta_id, categoria_id: ultimo.categoria_id,
      recorrente: ls.some((l) => l.recorrente_id) });
  }
  return out.sort((a, b) => b.anual - a.anual);
}

/** Gastos por categoria no mês × limite (valor_mensal). nivel: 'ok' | 'atencao' (≥80%) | 'estourou' (≥100%) */
export function orcamentoCategorias(lancs, categorias, ini, fim, meses = 1) {
  const out = [];
  for (const c of categorias) {
    if (c.tipo !== 'despesa' || !(Number(c.valor_mensal) > 0)) continue;
    const limite = Number(c.valor_mensal) * meses;
    const gasto = arred(lancs.filter((l) => l.tipo === 'saida' && l.categoria_id === c.id && l.data_pagamento >= ini && l.data_pagamento <= fim)
      .reduce((s, l) => s + Number(l.valor), 0));
    const p = gasto / limite;
    out.push({ categoria: c, limite, gasto, p, nivel: p >= 1 ? 'estourou' : p >= 0.8 ? 'atencao' : 'ok' });
  }
  return out.sort((a, b) => b.p - a.p);
}

// ---------------------------------------------------------------------
// v1.5 — metas, dívidas, patrimônio e projeção de saldo
// ---------------------------------------------------------------------
/** Progresso de uma meta: { atual, falta, p, mensalNecessario, mesesRestantes } */
export function progressoMeta(meta, movimentos, ref = hoje()) {
  const atual = arred(Number(meta.valor_inicial || 0) + movimentos.filter((m) => m.meta_id === meta.id).reduce((s, m) => s + Number(m.valor), 0));
  const alvo = Number(meta.valor_alvo);
  const falta = arred(Math.max(0, alvo - atual));
  let mesesRestantes = null, mensalNecessario = null;
  if (meta.prazo) {
    const a = partes(ref), b = partes(meta.prazo);
    mesesRestantes = Math.max(0, (b.y - a.y) * 12 + (b.m - a.m) + (b.d >= a.d ? 0 : -1)) || (meta.prazo >= ref ? 1 : 0);
    mensalNecessario = mesesRestantes > 0 ? arred(falta / mesesRestantes) : falta;
  }
  return { atual, alvo, falta, p: alvo ? Math.min(1, atual / alvo) : 0, mesesRestantes, mensalNecessario, atrasada: !!meta.prazo && meta.prazo < ref && falta > 0 };
}

/** Quantos meses faltam para quitar (com juros mensais) pagando `parcela` por mês. null se nunca quita */
export function mesesParaQuitar(saldo, taxaMensal, parcela) {
  let s = Number(saldo), n = 0;
  const t = Number(taxaMensal || 0) / 100, p = Number(parcela);
  if (!(s > 0)) return 0;
  if (!(p > 0) || p <= s * t) return null;
  let juros = 0;
  while (s > 0.005 && n < 600) { const j = s * t; juros += j; s = s + j - p; n++; }
  return { meses: n, jurosTotal: arred(juros) };
}

/**
 * Projeção do saldo das contas mês a mês: parte do saldo de hoje e aplica pendências (entradas e saídas em conta),
 * faturas de cartão a vencer (itens pendentes) e recorrências ainda não geradas.
 */
export function projecaoSaldo({ saldoHoje, lancs, recorrentes = [], cartoes = [], meses = 6, ref = hoje(), parcelasDividas = 0 }) {
  const mesAtual = mesDe(ref);
  const fimHorizonte = somarMesRef(mesAtual, meses - 1);
  const linhas = [];
  for (let i = 0; i < meses; i++) linhas.push({ ref: somarMesRef(mesAtual, i), entradas: 0, saidas: 0, faturas: 0, recorrentes: 0, dividas: parcelasDividas });
  const idx = new Map(linhas.map((x, i) => [x.ref, i]));
  for (const l of lancs) {
    if (l.situacao !== 'pendente') continue;
    let r = mesDe(l.data_pagamento);
    if (l.data_pagamento < ref) r = mesAtual; // atrasados contam agora
    if (!idx.has(r)) continue;
    const x = linhas[idx.get(r)], v = Number(l.valor);
    if (l.tipo === 'entrada' && !l.cartao_id) x.entradas += v;
    else if (l.tipo === 'saida' && l.cartao_id) x.faturas += v;
    else if (l.tipo === 'entrada' && l.cartao_id) x.faturas -= v;
    else if (l.tipo === 'saida') x.saidas += v;
  }
  // recorrências que ainda não viraram lançamento (depois do último mês gerado)
  const porCartao = new Map(cartoes.map((c) => [c.id, c]));
  for (const rec of recorrentes) {
    const virtuais = gerarRecorrencias(rec, fimHorizonte, rec.cartao_id ? porCartao.get(rec.cartao_id) : null);
    for (const v of virtuais) {
      const r = mesDe(v.data_pagamento);
      if (!idx.has(r)) continue;
      const x = linhas[idx.get(r)];
      if (v.tipo === 'entrada') x.entradas += v.valor; else if (v.cartao_id) x.faturas += v.valor; else x.saidas += v.valor;
      x.recorrentes += v.tipo === 'entrada' ? v.valor : -v.valor;
    }
  }
  let saldo = Number(saldoHoje);
  for (const x of linhas) {
    x.inicio = arred(saldo);
    saldo += x.entradas - x.saidas - x.faturas - x.dividas;
    x.fim = arred(saldo);
    for (const k of ['entradas', 'saidas', 'faturas', 'recorrentes', 'dividas']) x[k] = arred(x[k]);
  }
  return linhas;
}
