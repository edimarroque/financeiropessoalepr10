// Funções compartilhadas pelas rotas /api (Vercel). Arquivos que começam com "_" não viram rota.
// Variáveis da Vercel: GEMINI_API_KEY (IA), APP_SECRET (funções do servidor no banco), CRON_SECRET (= APP_SECRET, para o agendador).
export const SUPABASE_URL = 'https://sqkvmpuhtsjeabmjdvgc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxa3ZtcHVodHNqZWFibWpkdmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMjI1NDAsImV4cCI6MjExMDc5ODU0MH0.8ASaYhS-lFDWVrvcAnqndClmiJV45tvCeW1S4YvyHCQ';
export const SITE = 'https://financeiropessoalepr10.vercel.app';
const MODELOS_PADRAO = 'gemini-3.6-flash,gemini-2.5-flash,gemini-flash-latest';

// Instrução fixa da IA financeira (app e Telegram)
export const SISTEMA = `Você é um consultor financeiro pessoal brasileiro, direto e prático, que conversa em português do Brasil.
Analise SOMENTE os dados fornecidos (valores em R$). Não invente números; quando algo não estiver nos dados, diga que não sabe.
Seja objetivo: frases curtas, valores formatados como R$ 1.234,56, e sempre que possível diga quanto dá para economizar por mês.
Atenção especial a: juros, IOF, multas, tarifas e anuidades; assinaturas repetidas; categorias acima do limite; gastos que cresceram;
parcelas que comprometem os próximos meses; saldo projetado negativo; reserva de emergência e metas.
Você só responde e sugere — nunca diga que fez alterações no app.`;

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class ErroHttp extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/** Token do login (Supabase) enviado pelo app; devolve o usuário ou lança 401 */
export async function usuarioDoPedido(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new ErroHttp(401, 'Faça login novamente.');
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new ErroHttp(401, 'Faça login novamente.');
  const u = await r.json();
  return { ...u, token };
}

/** Lê/grava tabelas com o login do próprio usuário (as regras de acesso do banco continuam valendo) */
export async function rest(token, caminho, { metodo = 'GET', corpo, prefer } = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  if (!r.ok) throw new ErroHttp(502, `Banco: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

/** Funções do servidor (srv_*), protegidas pelo APP_SECRET — usadas pelo bot do Telegram e pelo agendador */
export async function srv(funcao, params = {}) {
  const segredo = process.env.APP_SECRET;
  if (!segredo) throw new ErroHttp(500, 'Falta a variável APP_SECRET na Vercel.');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_segredo: segredo, ...params }),
  });
  const txt = await r.text();
  if (!r.ok) throw new ErroHttp(502, `Banco (${funcao}): ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

/**
 * Chama o Gemini. partes = [{ text } | { inlineData: { mimeType, data } }].
 * schema opcional → resposta JSON. Tenta os modelos da lista em ordem (GEMINI_MODELS).
 */
export async function gemini(partes, { schema = null, sistema = null, temperatura = 0.2, historico = [] } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ErroHttp(500, 'IA ainda não configurada: falta a variável GEMINI_API_KEY na Vercel.');
  const modelos = (process.env.GEMINI_MODELS || MODELOS_PADRAO).split(',').map((m) => m.trim()).filter(Boolean);
  const corpo = {
    contents: [...historico, { role: 'user', parts: partes }],
    generationConfig: { temperature: temperatura, ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}) },
    ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
  };
  const body = JSON.stringify(corpo);
  let ultimoErro = '';
  for (const modelo of modelos) {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body,
      });
      if (r.ok) {
        const j = await r.json();
        const texto = (j?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
        if (!texto) { ultimoErro = `${modelo}: resposta vazia`; break; }
        if (!schema) return { texto, modelo, uso: j.usageMetadata || null };
        try { return { json: JSON.parse(texto.replace(/```[a-z]*\n?/gi, '')), modelo, uso: j.usageMetadata || null }; }
        catch { ultimoErro = `${modelo}: JSON inválido`; break; }
      }
      const txt = (await r.text()).slice(0, 300);
      ultimoErro = `${modelo} HTTP ${r.status}: ${txt}`;
      if (r.status === 401 || r.status === 403) throw new ErroHttp(502, 'A chave do Gemini foi recusada. Confira GEMINI_API_KEY na Vercel.');
      if (r.status === 404 || r.status === 400) break;
      await esperar(r.status === 429 || r.status === 503 ? 3000 * tentativa : 1200);
    }
  }
  throw new ErroHttp(502, 'A IA não respondeu agora. Tente de novo em alguns minutos. ' + ultimoErro);
}

// ---------------- Telegram ----------------
export async function tg(token, metodo, dados) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new ErroHttp(502, `Telegram (${metodo}): ${j.description || r.status}`);
  return j.result;
}

export async function tgEnviarDocumento(token, chatId, nome, bytes, legenda = '', mime = 'application/pdf') {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  if (legenda) { fd.append('caption', legenda.slice(0, 1000)); fd.append('parse_mode', 'HTML'); }
  fd.append('document', new Blob([bytes], { type: mime }), nome);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new ErroHttp(502, `Telegram (sendDocument): ${j.description || r.status}`);
  return j.result;
}

export async function tgBaixarArquivo(token, fileId) {
  const f = await tg(token, 'getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
  if (!r.ok) throw new ErroHttp(502, 'Não consegui baixar o arquivo do Telegram.');
  return { bytes: Buffer.from(await r.arrayBuffer()), caminho: f.file_path, tamanho: f.file_size };
}

// ---------------- Google Drive (via Apps Script do usuário) ----------------
export async function drive(url, token, acao, dados = {}) {
  if (!url || !token) throw new ErroHttp(400, 'Google Drive ainda não configurado (Mais e ajustes → Integrações).');
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, acao, ...dados }), redirect: 'follow' });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new ErroHttp(502, 'O script do Drive não respondeu como esperado. Confira se foi implantado como “App da Web” com acesso “Qualquer pessoa”.'); }
  if (!j.ok) throw new ErroHttp(502, `Drive: ${j.erro || 'erro'}`);
  return j;
}

export const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function responderErro(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ erro: e.message || String(e) });
}

/** Lê o corpo JSON (a Vercel já entrega parseado quando o Content-Type é JSON) */
export function corpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
