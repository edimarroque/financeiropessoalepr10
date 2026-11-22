// Respostas SEM IA para o bot do Telegram: perguntas sobre os seus dados (parcelas, gastos, busca)
// e lançamentos simples ("mercado 87,50 no débito"). Não gastam cota do Gemini e respondem na hora.
// Funções puras: recebem os dados e devolvem texto (HTML do Telegram) ou null quando não entenderam.
import { MESES, hoje as hojeReal, somarMeses, fmtData, arred, partes, montar, diaAnterior } from '../js/calc.js';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => fmt.format(Number(v) || 0);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9$,.\/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const compacto = (s) => norm(s).replace(/parc(ela)?\.?\s*\d{1,2}\s*(de|\/)\s*\d{1,2}/g, ' ').replace(/[^a-z]/g, '');
const MESES_N = MESES.map((m) => norm(m));
const mesAno = (iso) => `${MESES[partes(iso).m - 1].toLowerCase()}/${partes(iso).y}`;

const VAZIAS = new Set(('a o as os e de do da dos das em no na nos nas com por para pra pro meu minha meus minhas um uma que qual quais quanto quantos quantas ' +
  'quando ate como onde me mostra mostre diga fala liste lista ver veja esse este essa esta isso mes meses ano anos dia dias ultimo ultima ultimos ultimas ' +
  'passado atual todo toda tudo vai vao vou falta faltam termina terminam acaba acabam finaliza acabar terminar parcela parcelas parcelado parcelada ' +
  'parcelamento parcelamentos gastei gasto gastos gastando despesa despesas paguei pago pagar pagamento recebi recebido ganhei entrada entradas total soma ' +
  'tenho tem valor valores lancamento lancamentos busca buscar procura procurar pesquisa pesquisar ache encontre achar foi foram sao e de categoria ' +
  'reais r$ seu sua so ainda mais menos maior maiores principais ja agora hoje ontem sobre cartao conta ' + MESES_N.join(' ')).split(' '));

/** Palavras que sobram da pergunta depois de tirar as palavras de intenção/período (o "assunto") */
function assunto(n) {
  return n.replace(/ultimos? \d+ meses?/g, ' ').replace(/\b20\d\d\b/g, ' ').split(/[\s\/,.?]+/).filter((p) => p.length > 1 && !VAZIAS.has(p) && !/^\d+$/.test(p)).join(' ');
}

/** Período citado na pergunta; padrão = mês atual */
export function periodo(n, hoje = hojeReal()) {
  const { y, m } = partes(hoje);
  const doMes = (yy, mm) => ({ ini: montar(yy, mm, 1), fim: montar(yy, mm, 31), rotulo: `${MESES[((mm - 1) % 12 + 12) % 12]} ${montar(yy, mm, 1).slice(0, 4)}` });
  let k = n.match(/ultimos? (\d{1,2}) meses/);
  if (k) { const q = Math.max(1, Number(k[1])); return { ini: montar(y, m - q + 1, 1), fim: montar(y, m, 31), rotulo: `últimos ${q} meses` }; }
  if (/mes passado|ultimo mes|mes anterior/.test(n)) return doMes(y, m - 1);
  const ano = (n.match(/\b(20\d\d)\b/) || [])[1];
  const idx = MESES_N.findIndex((nm) => new RegExp(`\\b${nm}\\b`).test(n));
  if (idx >= 0) { const yy = ano ? Number(ano) : (idx + 1 > m ? y - 1 : y); return doMes(yy, idx + 1); }
  if (ano || /(esse|este|neste|nesse|no) ano|ano todo|ano inteiro/.test(n)) { const yy = Number(ano || y); return { ini: `${yy}-01-01`, fim: `${yy}-12-31`, rotulo: `ano ${yy}` }; }
  return doMes(y, m);
}

const contaComo = (l) => l.tipo === 'saida' || l.tipo === 'entrada';

/** Categorias cujo nome bate com o assunto */
function categoriasDo(d, termo) {
  const t = compacto(termo);
  if (t.length < 3) return [];
  return (d.categorias || []).filter((c) => { const nc = compacto(c.nome); return nc && (nc.includes(t) || (nc.length >= 4 && t.includes(nc))); });
}
const casaDesc = (l, termo) => { const t = compacto(termo); return t.length >= 3 && compacto(l.descricao).includes(t); };

// ---------------- parcelas / "até quando" ----------------
function fimDaLinha(l) { return somarMeses(l.data_pagamento, (Number(l.parcela_total) || 1) - (Number(l.parcela_num) || 1)); }

function resumoParcelado(linhas, hoje) {
  const parc = linhas.filter((l) => Number(l.parcela_total) > 1);
  if (!parc.length) return null;
  const base = parc.reduce((a, b) => (fimDaLinha(b) > fimDaLinha(a) || (fimDaLinha(b) === fimDaLinha(a) && b.data_pagamento > a.data_pagamento) ? b : a));
  const total = Number(base.parcela_total), num = Number(base.parcela_num) || 1;
  const datas = Array.from({ length: total - num + 1 }, (_, i) => somarMeses(base.data_pagamento, i));
  const futuras = datas.filter((dt) => dt > hoje).length;
  return { desc: base.descricao.replace(/\s*-?\s*parc(ela)?\.?\s*\d{1,2}\s*(de|\/)\s*\d{1,2}/i, '').trim() || base.descricao, valor: Number(base.valor), total,
    fim: fimDaLinha(base), faltam: futuras, falta_valor: arred(futuras * Number(base.valor)), cartao_id: base.cartao_id };
}

function grupoChave(l) { return compacto(l.descricao) + '|' + (l.cartao_id || l.conta_id || ''); }

function textoParcela(p, d) {
  const cartao = p.cartao_id ? (d.cartoes || []).find((c) => c.id === p.cartao_id)?.nome : null;
  return `💳 <b>${esc(p.desc)}</b> — ${p.total}x de ${brl(p.valor)}${cartao ? ` (${esc(cartao)})` : ''}\n` +
    `   Última parcela: <b>${fmtData(p.fim)}</b> (${mesAno(p.fim)})\n` +
    (p.faltam ? `   Faltam ${p.faltam} parcela(s): ${brl(p.falta_valor)}` : '   ✅ Já terminou.');
}

function parcelasAtivas(d, hoje) {
  const grupos = new Map();
  for (const l of d.lancamentos || []) {
    if (!(Number(l.parcela_total) > 1) || l.tipo !== 'saida') continue;
    const k = grupoChave(l);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  return [...grupos.values()].map((g) => resumoParcelado(g, hoje)).filter((p) => p && p.faltam > 0).sort((a, b) => a.fim.localeCompare(b.fim));
}

function responderParcelas(d, n, termo, hoje) {
  if (!termo) {
    const ativas = parcelasAtivas(d, hoje);
    if (!ativas.length) return '✅ Você não tem compras parceladas em andamento.';
    const mensal = arred(ativas.reduce((s, p) => s + p.valor, 0));
    return `💳 <b>Parcelamentos em andamento</b> (${ativas.length})\n` +
      ativas.map((p) => `• ${esc(p.desc)}: ${brl(p.valor)}/mês até <b>${mesAno(p.fim)}</b> (faltam ${p.faltam})`).join('\n') +
      `\n\nTotal por mês: <b>${brl(mensal)}</b> · Falta pagar: ${brl(ativas.reduce((s, p) => s + p.falta_valor, 0))}`;
  }
  const achados = (d.lancamentos || []).filter((l) => casaDesc(l, termo));
  const recs = (d.recorrentes || []).filter((r) => casaDesc(r, termo));
  const partesTxt = [];
  const grupos = new Map();
  for (const l of achados.filter((x) => Number(x.parcela_total) > 1)) { const k = grupoChave(l); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l); }
  // descrições parecidas ("ORAL DENTS" e "ORALDENTS") viram um grupo só pelo compacto
  for (const g of grupos.values()) { const p = resumoParcelado(g, hoje); if (p) partesTxt.push(textoParcela(p, d)); }
  for (const r of recs) {
    partesTxt.push(`🔁 <b>${esc(r.descricao)}</b> — ${brl(r.valor)} todo dia ${r.dia}${r.ativo === false ? ' (desativada)' : ''}\n   ` +
      (r.fim ? `Até <b>${fmtData(r.fim)}</b> (${mesAno(r.fim)})` : 'Sem data de fim cadastrada'));
  }
  if (!partesTxt.length && achados.length) {
    const ult = achados.slice().sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento))[0];
    partesTxt.push(`🔎 <b>${esc(ult.descricao)}</b> não está parcelado. Último lançamento: ${fmtData(ult.data_pagamento)} · ${brl(ult.valor)} (${achados.length} no total).`);
  }
  return partesTxt.length ? partesTxt.join('\n\n') : null;
}

// ---------------- quanto gastei / recebi ----------------
function responderTotais(d, n, termo, hoje, entrada) {
  const p = periodo(n, hoje);
  const tipo = entrada ? 'entrada' : 'saida';
  let lista = (d.lancamentos || []).filter((l) => l.tipo === tipo && l.data_pagamento >= p.ini && l.data_pagamento <= p.fim);
  let rotulo = entrada ? 'Recebido' : 'Gasto';
  if (termo) {
    const cats = categoriasDo(d, termo);
    const ids = new Set(cats.map((c) => c.id));
    const filtrada = lista.filter((l) => ids.has(l.categoria_id) || casaDesc(l, termo));
    if (!filtrada.length) return `🔎 Não achei ${entrada ? 'entradas' : 'gastos'} com “${esc(termo)}” em ${p.rotulo}.\nTente outro nome, ou outro período (ex.: “mês passado”, “em outubro”, “esse ano”).`;
    lista = filtrada; rotulo += ` com <b>${esc(cats[0]?.nome || termo)}</b>`;
  }
  const total = arred(lista.reduce((s, l) => s + Number(l.valor), 0));
  const pend = arred(lista.filter((l) => l.situacao === 'pendente').reduce((s, l) => s + Number(l.valor), 0));
  let txt = `📊 ${rotulo} em ${p.rotulo}: <b>${brl(total)}</b> (${lista.length} lançamento${lista.length === 1 ? '' : 's'})${pend ? `\n⏳ Desse total, ${brl(pend)} ainda pendente` : ''}`;
  if (!termo) {
    const cat = new Map();
    for (const l of lista) cat.set(l.categoria_id || '', (cat.get(l.categoria_id || '') || 0) + Number(l.valor));
    const nome = (id) => (d.categorias || []).find((c) => c.id === id)?.nome || 'Sem categoria';
    txt += '\n\n<b>Por categoria</b>\n' + [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => `• ${esc(nome(id))}: ${brl(v)}`).join('\n');
  } else {
    txt += '\n\n' + lista.slice().sort((a, b) => b.valor - a.valor).slice(0, 8).map((l) => `• ${fmtData(l.data_pagamento)} · ${esc(l.descricao)} · ${brl(l.valor)}`).join('\n');
  }
  return txt;
}

// ---------------- busca ----------------
export function buscar(d, termo, max = 10) {
  const palavras = String(termo || '').split(' ').filter((p) => p.length >= 3);
  if (!palavras.length) return null;
  let achados = (d.lancamentos || []).filter((l) => contaComo(l) && casaDesc(l, termo));
  if (!achados.length) achados = (d.lancamentos || []).filter((l) => contaComo(l) && palavras.some((p) => p.length >= 4 && casaDesc(l, p)));
  if (!achados.length) return null;
  achados.sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
  return `🔎 <b>${achados.length} lançamento(s) com “${esc(termo)}”</b>\n` +
    achados.slice(0, max).map((l) => `• ${fmtData(l.data_pagamento)} · ${esc(l.descricao)} · ${brl(l.valor)}${l.parcela_total ? ` (${l.parcela_num}/${l.parcela_total})` : ''}${l.situacao === 'pendente' ? ' ⏳' : ''}`).join('\n') +
    (achados.length > max ? `\n… e mais ${achados.length - max}.` : '');
}

/**
 * Tenta responder sem IA. Devolve { comando: 'saldo'|'faturas'|'contas'|'resumo' } , { texto } ou null (não entendeu → IA).
 */
export function responderLocal(d, pergunta, hoje = hojeReal()) {
  const n = norm(pergunta);
  const termo = assunto(n);
  if (/\b(dica|dicas|conselho|analis|analise|economizar|melhorar|cortar|devo|vale a pena|o que (voce|vc) acha|sugest|planej|investir)/.test(n)) return null; // pergunta aberta → IA

  if (/\b(ate quando|ate qual|ate que|quando (termina|acaba|finaliza)|quantas parcelas|parcel|falta(m)? (pagar|quantas))/.test(n)) {
    const t = responderParcelas(d, n, termo, hoje);
    if (t) return { texto: t };
    return { texto: `🔎 Não achei parcelas nem lançamentos com “${esc(termo)}”. Confira o nome como aparece na fatura (ex.: ORALDENTS).` };
  }
  if (/\b(quanto|total|soma)\b.*\b(recebi|ganhei|receb|entrou|entrada)/.test(n)) return { texto: responderTotais(d, n, termo, hoje, true) };
  if (/\b(quanto|total|soma)\b.*\b(gast|paguei|despes|saiu)|\bgastos? (com|de|no|na|em)\b|\bdespesas? com\b|\bmaiores? (gastos|categorias|despesas)|onde (mais )?(gastei|estou gastando)|com o que (mais )?gastei/.test(n))
    return { texto: responderTotais(d, n, /maiores?|onde|com o que/.test(n) ? '' : termo, hoje, false) };
  if (/^(busca|buscar|procura|procurar|pesquisa|pesquisar|ache|achar|encontre|lancamentos? (de|com|do|da))\b/.test(n)) {
    const t = buscar(d, termo); return { texto: t || `🔎 Não achei lançamentos com “${esc(termo)}”.` };
  }
  if (/\bsaldo\b/.test(n)) return { comando: 'saldo' };
  if (/\bfaturas?\b/.test(n)) return { comando: 'faturas' };
  if (/contas a pagar|o que vence|vencimentos?|vence (hoje|amanha|essa semana)|contas pendentes/.test(n)) return { comando: 'contas' };
  if (/^resumo\b|resumo do mes|como (esta|estao|anda|andam) (o mes|minhas financas)/.test(n)) return { comando: 'resumo' };
  return null;
}

// ---------------- lançamento simples sem IA ----------------
function lerNumero(s) {
  s = s.replace(/r\$\s*/, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s.replace(',', '.'));
}

/**
 * "mercado 87,50 no débito" → { item, categoriaCerta } no formato da IA; null se não der para entender com segurança.
 * ctx: { categorias, contas, cartoes, regras }
 */
export function lancamentoLocal(ctx, texto, hoje = hojeReal(), regraCategoria = () => null) {
  let n = norm(texto);
  const tipo = /\b(recebi|ganhei|salario|freela|entrada|reembolso|deposito recebido|me pagou|me pagaram)\b/.test(n) ? 'entrada' : 'saida';
  let parcelas = 1;
  const px = n.match(/\b(?:em )?(\d{1,2}) ?(?:x|vezes)\b/);
  if (px) { parcelas = Number(px[1]); n = n.replace(px[0], ' '); }
  let data = hoje;
  if (/\banteontem\b/.test(n)) data = diaAnterior(diaAnterior(hoje));
  else if (/\bontem\b/.test(n)) data = diaAnterior(hoje);
  const dia = n.match(/\bdia (\d{1,2})\b/);
  if (dia) { const { y, m, d } = partes(hoje); const dd = Number(dia[1]); data = dd > d ? montar(y, m - 1, dd) : montar(y, m, dd); n = n.replace(dia[0], ' '); }
  const nums = [...n.matchAll(/(?:r\$\s*)?\d+(?:[.,]\d+)*/g)].map((x) => x[0]);
  if (nums.length !== 1) return null;
  const valor = lerNumero(nums[0]);
  if (!(valor > 0)) return null;
  n = n.replace(nums[0], ' ');

  const chaves = (nome, fora) => norm(nome).split(' ').filter((p) => p.length >= 2 && !fora.test(p));
  const tem = (k) => (` ${n} `).includes(` ${k} `);
  const cartoes = (ctx.cartoes || []).filter((c) => { const k = chaves(c.nome, /^(cartao|credito|de|do|da)$/); return k.length && k.every(tem); });
  const contas = (ctx.contas || []).filter((c) => { const k = chaves(c.nome, /^(conta|corrente|de|do|da)$/); return k.length && k.every(tem); });
  const citaCredito = /\b(cartao|credito)\b/.test(n);
  if (cartoes.length > 1 || (citaCredito && !cartoes.length)) return null;   // cartão ambíguo: deixa para a IA
  const cartao = tipo === 'saida' ? cartoes[0] : null;
  const conta = cartao ? null : contas.sort((a, b) => b.nome.length - a.nome.length)[0];
  if (parcelas > 1 && !cartao) return null;
  const metodo = cartao ? 'Crédito' : (/\bpix\b/.test(n) ? 'Pix' : /\bdebito\b/.test(n) ? 'Débito' : /\bboleto\b/.test(n) ? 'Boleto' : /\bdinheiro\b/.test(n) ? 'Dinheiro' : /\btransfer/.test(n) ? 'Transferência' : null);

  const tirar = new Set(['no', 'na', 'do', 'da', 'de', 'em', 'com', 'pelo', 'pela', 'via', 'reais', 'real', 'r', 'cartao', 'credito', 'debito', 'pix', 'boleto', 'dinheiro',
    'transferencia', 'hoje', 'ontem', 'anteontem', 'paguei', 'gastei', 'comprei', 'recebi', 'ganhei', 'conta', 'vezes', 'x', 'parcelado', 'parcelada', 'a', 'o', 'um', 'uma',
    ...(cartao ? chaves(cartao.nome, /^$/) : []), ...(conta ? chaves(conta.nome, /^$/) : [])]);
  const palavras = n.split(' ').filter((p) => p && !tirar.has(p) && !/^\d/.test(p) && !/^r\$/.test(p));
  if (!palavras.length) return null;
  const descricao = palavras.join(' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);

  const tipoCat = tipo === 'entrada' ? 'receita' : 'despesa';
  let categoria_id = regraCategoria(descricao, tipo);
  if (!categoria_id) {
    const desc = compacto(descricao);
    const cands = (ctx.categorias || []).filter((c) => (!c.tipo || c.tipo === tipoCat) && compacto(c.nome).length >= 3 &&
      (desc.includes(compacto(c.nome)) || palavras.some((p) => p.length >= 4 && compacto(c.nome) === p)));
    if (cands.length === 1) categoria_id = cands[0].id;
  }
  return { item: { data, descricao, valor, tipo, categoria_id: categoria_id || null, conta_id: conta?.id || null, cartao_id: cartao?.id || null, parcelas, metodo }, categoriaCerta: !!categoria_id };
}
