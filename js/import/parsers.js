// Leitura de arquivos para importação: CSV (do app/planilha ou de banco), OFX e PDF de fatura.
// Cada leitor devolve { formato, linhas: [...], avisos: [], totalDeclarado? }
// Linha "banco": { data, descricao, valor (>0), sinal: 1 entrada | -1 saída, parcela_num, parcela_total, ref }
// Linha "app":   { ...colunas do app por nome (categoria, conta, cartão, tipo, situação) }

import { montar, partes } from '../calc.js';

// ---------------- utilidades ----------------
export function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normaliza descrição para comparar/aprender categorias */
export function normDesc(s) {
  return semAcento(s).toUpperCase()
    .replace(/PARC(ELA)?\.?\s*\d{1,2}\s*(DE|\/)\s*\d{1,2}/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PREFIXOS = new Set(['PAY', 'RSCSS', 'RSHOP', 'PIX', 'QRS', 'TRANSF', 'PAG', 'PGTO', 'COMPRA', 'CARTAO', 'DEB', 'DEBITO', 'ELO', 'VISA', 'MASTER', 'EC', 'MP', 'PG', 'AUT']);
export function chavesDesc(s) {
  const n = normDesc(s);
  const ps = n.split(' ').filter((p) => p.length > 1 && !PREFIXOS.has(p));
  return [n, ps.slice(0, 2).join(' '), ps[0] || ''].filter(Boolean);
}

/** "1.234,56" | "-1234.56" | "R$ 12,00" | "12,00-" → número com sinal */
export function lerValor(txt) {
  let s = String(txt ?? '').trim();
  if (!s) return NaN;
  let neg = /^-|-$|^\(.*\)$/.test(s) || /\bD$/.test(s);
  s = s.replace(/[R$\s()]/g, '').replace(/[DC]$/, '').replace(/^-|-$/g, '');
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

/** dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd, aaaammdd → 'AAAA-MM-DD' (null se inválida) */
export function lerData(txt) {
  const s = String(txt ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return valida(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return valida(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return valida(+m[1], +m[2], +m[3]);
  return null;
}
function valida(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = montar(y, mo, d);
  return partes(iso).d === d ? iso : null;
}

/** "6 de 10" | "06/10" | "Parcela 2/3" | "PARC 03/12" → {num,total} */
export function lerParcela(txt) {
  const s = semAcento(String(txt ?? '')).toUpperCase();
  const m = s.match(/(\d{1,2})\s*(?:DE|\/)\s*(\d{1,2})/);
  if (!m) return { num: null, total: null };
  const num = +m[1], total = +m[2];
  if (!num || !total || num > total || total > 99) return { num: null, total: null };
  return { num, total };
}

/** Decodifica bytes como UTF-8; se vier com caracteres quebrados, tenta Windows-1252 (comum em bancos) */
export function decodificar(buf) {
  const u = new TextDecoder('utf-8').decode(buf);
  if (!u.includes('�')) return u.replace(/^﻿/, '');
  return new TextDecoder('windows-1252').decode(buf);
}

// ---------------- CSV ----------------
export function separarCSV(texto) {
  const prim = texto.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : (prim.includes('\t') ? '\t' : ',');
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

const cab = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function lerCSV(texto) {
  const tab = separarCSV(texto);
  if (tab.length < 2) return { formato: 'vazio', linhas: [], avisos: ['O arquivo não tem linhas para importar.'] };
  const h = tab[0].map(cab);
  const idx = (...nomes) => h.findIndex((x) => nomes.some((n) => x === n || x.startsWith(n)));

  // Formato do próprio app (exportação) — usado também na migração da planilha
  if (h.includes('datadamovimentacao') && h.includes('datadopagamento')) {
    const I = {
      dm: idx('datadamovimentacao'), dp: idx('datadopagamento'), tipo: idx('tipo'), cat: idx('categoria'),
      desc: idx('descricao'), valor: idx('valor'), conta: idx('contabancaria'), destino: idx('contadestino'),
      cartao: idx('cartao'), metodo: idx('metododepagamento'), parc: idx('ndaparcela', 'parcela'), sit: idx('situacao'),
    };
    const avisos = [];
    const linhas = [];
    tab.slice(1).forEach((r, i) => {
      const g = (k) => (I[k] >= 0 ? (r[I[k]] || '').trim() : '');
      const data_movimento = lerData(g('dm')), data_pagamento = lerData(g('dp')) || data_movimento;
      const valor = Math.abs(lerValor(g('valor')));
      if (!data_movimento || !(valor > 0)) { avisos.push(`Linha ${i + 2} ignorada (data ou valor inválido).`); return; }
      const t = cab(g('tipo'));
      const tipo = t.includes('pagamento') ? 'pagamento_fatura' : t.includes('transf') ? 'transferencia' : t.includes('entrada') || t.includes('receita') ? 'entrada' : 'saida';
      const p = lerParcela(g('parc'));
      const sit = cab(g('sit'));
      linhas.push({
        ref: i + 2, data_movimento, data_pagamento, tipo, valor,
        categoria: g('cat'), descricao: g('desc'), conta: g('conta'), conta_destino: g('destino'), cartao: g('cartao'),
        metodo: g('metodo'), parcela_num: p.num, parcela_total: p.total,
        situacao: sit.startsWith('pend') ? 'pendente' : sit.startsWith('rec') ? 'recebido' : sit.startsWith('pag') ? 'pago' : '',
      });
    });
    return { formato: 'app', linhas, avisos };
  }

  // CSV de banco/fatura: precisa de data, descrição e valor
  const iData = idx('data', 'date', 'dt');
  const iDesc = idx('descricao', 'estabelecimento', 'historico', 'lancamento', 'description', 'memo', 'titulo');
  const iValor = idx('valor', 'amount', 'value', 'quantia');
  const iParc = idx('parcela', 'installment');
  if (iData < 0 || iValor < 0) {
    return { formato: 'desconhecido', linhas: [], avisos: ['Não encontrei as colunas de Data e Valor no cabeçalho do CSV.'] };
  }
  const avisos = [];
  const linhas = [];
  tab.slice(1).forEach((r, i) => {
    const data = lerData(r[iData]);
    const v = lerValor(r[iValor]);
    if (!data || !Number.isFinite(v) || v === 0) { avisos.push(`Linha ${i + 2} ignorada (data ou valor inválido).`); return; }
    const desc = iDesc >= 0 ? (r[iDesc] || '').trim() : '';
    const p = lerParcela(iParc >= 0 ? r[iParc] : desc);
    linhas.push({ ref: i + 2, data, descricao: desc, valor: Math.abs(v), sinalBruto: Math.sign(v), parcela_num: p.num, parcela_total: p.total });
  });
  return { formato: 'banco', linhas, avisos };
}

// ---------------- OFX ----------------
export function lerOFX(texto) {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  const linhas = [];
  const avisos = [];
  blocos.forEach((b, i) => {
    const data = lerData(tag(b, 'DTPOSTED'));
    const v = lerValor(tag(b, 'TRNAMT').replace(',', '.'));
    if (!data || !Number.isFinite(v) || v === 0) { avisos.push(`Transação ${i + 1} ignorada (data ou valor inválido).`); return; }
    const desc = [tag(b, 'MEMO'), tag(b, 'NAME')].filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).join(' - ');
    const p = lerParcela(desc);
    linhas.push({ ref: i + 1, data, descricao: desc, valor: Math.abs(v), sinal: Math.sign(v), fitid: tag(b, 'FITID'), parcela_num: p.num, parcela_total: p.total });
  });
  if (!blocos.length) avisos.push('Nenhuma transação encontrada no OFX.');
  return { formato: 'ofx', linhas, avisos };
}

// ---------------- PDF de fatura (leitor genérico) ----------------
let pdfjs = null;
async function carregarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return pdfjs;
}

/** Extrai as linhas de texto do PDF, na ordem de leitura (agrupa por altura na página) */
export async function textoDoPDF(buf, senha) {
  const lib = await carregarPdfjs();
  let doc;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buf), password: senha || undefined, isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') { const err = new Error(senha ? 'Senha do PDF incorreta.' : 'Este PDF tem senha.'); err.senha = true; throw err; }
    throw new Error('Não consegui abrir o PDF: ' + (e.message || e));
  }
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Faturas costumam ter 2 colunas: separa itens pela metade da página quando houver
    const largura = page.view[2];
    const itens = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }));
    const colunas = detectarColunas(itens, largura);
    for (const col of colunas) {
      const grupos = [];
      for (const it of col.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const g = grupos.find((gg) => Math.abs(gg.y - it.y) < 3);
        if (g) g.itens.push(it); else grupos.push({ y: it.y, itens: [it] });
      }
      for (const g of grupos) linhas.push(g.itens.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' '));
    }
  }
  return linhas;
}

function detectarColunas(itens, largura) {
  const meio = largura / 2;
  const datasEsq = itens.filter((i) => i.x < meio && /^\d{2}\/\d{2}$/.test(i.s.trim())).length;
  const datasDir = itens.filter((i) => i.x >= meio && /^\d{2}\/\d{2}$/.test(i.s.trim())).length;
  if (datasEsq >= 3 && datasDir >= 3) return [itens.filter((i) => i.x < meio), itens.filter((i) => i.x >= meio)];
  return [itens];
}

const RX_ITEM = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+(-\s*)?(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2})(\s*-)?$/;
const RX_IGNORAR = /(PAGAMENTO\s+(EFETUADO|RECEBIDO|DE FATURA)|PAGTO\s+FATURA|SALDO\s+ANTERIOR|TOTAL\s+D|LIMITE|ENCARGOS\s+DO\s+PR|JUROS\s+DO\s+PR|PAGAMENTO\s+M[IÍ]NIMO)/i;

/**
 * Lê itens "dd/mm DESCRIÇÃO [nn/nn] valor" de qualquer fatura.
 * vencimento: 'AAAA-MM-DD' da fatura (para descobrir o ano das compras)
 */
export function itensDaFatura(linhasTexto, vencimento) {
  const { y: yV, m: mV } = partes(vencimento);
  const linhas = [];
  let totalDeclarado = null;
  linhasTexto.forEach((txt, i) => {
    const t = txt.trim();
    const mt = semAcento(t).match(/TOTAL\s+(DESTA|DA)\s+FATURA[^0-9-]*(-?\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (mt && totalDeclarado === null) totalDeclarado = Math.abs(lerValor(mt[2]));
    const m = t.match(RX_ITEM);
    if (!m) return;
    const d = +m[1], mo = +m[2];
    let ano = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : (mo > mV ? yV - 1 : yV);
    const data = valida(ano, mo, d);
    if (!data) return;
    let desc = m[4].trim();
    const valor = lerValor(m[6]);
    const credito = !!m[5] || !!m[7] || valor < 0;
    const p = lerParcela(desc);
    desc = desc.replace(/\s+\d{1,2}\s*\/\s*\d{1,2}$/, '').trim();
    linhas.push({
      ref: i + 1, data, descricao: desc, valor: Math.abs(valor), sinal: credito ? 1 : -1,
      parcela_num: p.num, parcela_total: p.total, ignorarSugerido: RX_IGNORAR.test(semAcento(desc)),
    });
  });
  return { formato: 'pdf', linhas, avisos: linhas.length ? [] : ['Não encontrei itens no formato "dd/mm descrição valor" neste PDF.'], totalDeclarado };
}

// ---------------- PDF lido pela IA (Gemini, via /api/ler-pdf) ----------------
const LIMITE_ENVIO = 4_200_000; // corpo da requisição na Vercel: 4,5 MB

function base64DeBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** PDF com senha: o Gemini não abre, então mandamos as páginas como imagem (abertas aqui com a senha) */
async function paginasComoImagens(buf, senha) {
  const lib = await carregarPdfjs();
  let doc;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buf), password: senha || undefined, isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') { const err = new Error(senha ? 'Senha do PDF incorreta.' : 'Este PDF tem senha.'); err.senha = true; throw err; }
    throw new Error('Não consegui abrir o PDF: ' + (e.message || e));
  }
  if (doc.numPages > 30) throw new Error('PDF com mais de 30 páginas: divida o arquivo antes de importar.');
  const imagens = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    imagens.push({ mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] });
  }
  return imagens;
}

/**
 * Lê fatura (tipo 'cartao') ou extrato (tipo 'extrato') com o Gemini.
 * Devolve o mesmo formato dos outros leitores, mais: modelo, vencimentoLido e, no extrato, variacaoDeclarada.
 */
export async function lerPdfComIA(buf, { tipo, senha, token }) {
  const temSenha = await pdfTemSenha(buf);
  const arquivos = temSenha
    ? await paginasComoImagens(buf, senha)
    : [{ mimeType: 'application/pdf', data: base64DeBytes(new Uint8Array(buf)) }];
  const tamanho = arquivos.reduce((s, a) => s + a.data.length, 0);
  if (tamanho > LIMITE_ENVIO) throw new Error('Arquivo grande demais para a leitura por IA (limite ~3 MB). Use o leitor simples ou divida o PDF.');

  const r = await fetch('/api/ler-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tipo, arquivos }),
  });
  let j = {};
  try { j = await r.json(); } catch { /* resposta não-JSON */ }
  if (!r.ok) throw new Error(j.erro || `A leitura por IA falhou (erro ${r.status}).`);
  return converterRespostaIA(j, tipo);
}

async function pdfTemSenha(buf) {
  const lib = await carregarPdfjs();
  try {
    const tarefa = lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false });
    await tarefa.promise;
    tarefa.destroy();
    return false;
  } catch (e) {
    if (e && e.name === 'PasswordException') return true;
    throw new Error('Não consegui abrir o PDF: ' + (e.message || e));
  }
}

/** Separado para os testes: transforma a resposta da IA no formato de importação */
export function converterRespostaIA(j, tipo) {
  const avisos = [];
  const linhas = [];
  (Array.isArray(j.lancamentos) ? j.lancamentos : []).forEach((x, i) => {
    const data = lerData(x?.data);
    const v = typeof x?.valor === 'number' ? x.valor : lerValor(x?.valor);
    let desc = String(x?.descricao || '').trim();
    if (!data || !Number.isFinite(v) || v === 0 || !desc) { avisos.push(`Item ${i + 1} da IA ignorado (data, valor ou descrição inválida).`); return; }
    let num = Number.isInteger(x?.parcelaAtual) ? x.parcelaAtual : null;
    let total = Number.isInteger(x?.parcelaTotal) ? x.parcelaTotal : null;
    if (!num || !total || num > total || total > 99) {
      const p = lerParcela(desc); num = p.num; total = p.total;
    }
    desc = desc.replace(/\s*(PARC(ELA)?\.?\s*)?\d{1,2}\s*(DE|\/)\s*\d{1,2}\s*$/i, '').trim() || desc;
    const portador = tipo === 'cartao' && x?.portador ? String(x.portador).trim() : '';
    linhas.push({
      ref: i + 1, data, descricao: desc, valor: Math.round(Math.abs(v) * 100) / 100, sinal: v > 0 ? 1 : -1,
      parcela_num: num, parcela_total: total, portador,
      ignorarSugerido: tipo === 'cartao' && RX_IGNORAR.test(semAcento(desc)),
    });
  });
  if (!linhas.length) avisos.unshift('A IA não encontrou lançamentos neste arquivo.');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const ini = num(j.saldoInicial), fim = num(j.saldoFinal);
  return {
    formato: 'pdf-ia', linhas, avisos, modelo: j.modelo || '',
    totalDeclarado: tipo === 'cartao' && num(j.totalFatura) != null ? Math.abs(num(j.totalFatura)) : null,
    vencimentoLido: lerData(j.vencimento),
    periodo: [lerData(j.periodoInicio), lerData(j.periodoFim)],
    variacaoDeclarada: tipo === 'extrato' && ini != null && fim != null ? Math.round((fim - ini) * 100) / 100 : null,
  };
}
