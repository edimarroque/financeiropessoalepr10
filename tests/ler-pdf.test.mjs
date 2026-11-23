// v1.6.3: rota /api/ler-pdf — partes (bloco) e limite de tempo (sem internet). node tests/ler-pdf.test.mjs
import assert from 'node:assert/strict';
process.env.GEMINI_API_KEY = 'x';
process.env.GEMINI_MODELS = 'm1';
const { default: handler } = await import('../api/ler-pdf.js');

let prompts = [], modo = 'ok';
globalThis.fetch = async (url, op = {}) => {
  if (String(url).includes('/auth/v1/user')) return new Response('{}', { status: 200 });
  const corpo = JSON.parse(op.body);
  prompts.push(corpo.contents[0].parts.at(-1).text);
  if (modo === 'lento') return new Promise((_, rej) => op.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))));
  const json = { lancamentos: [{ data: '2026-10-01', descricao: 'X', valor: -1, pagina: 1 }] };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });
};
const chamar = async (body) => {
  const res = { h: {}, code: 0, body: null, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  return res;
};
const arq = [{ mimeType: 'image/jpeg', data: 'AAAA' }];

let r = await chamar({ tipo: 'extrato', arquivos: arq, bloco: { de: 4, ate: 7, total: 10 } });
assert.equal(r.code, 200); assert.equal(r.body.lancamentos[0].pagina, 1);
assert.match(prompts.at(-1), /páginas 4 a 7 de um documento de 10/);

r = await chamar({ tipo: 'cartao', arquivos: arq });
assert.equal(r.code, 200); assert.doesNotMatch(prompts.at(-1), /ATENÇÃO: as imagens/);

// Gemini lento: responde 503 com erro claro antes do limite da Vercel (aqui 6 s)
process.env.LER_PDF_TEMPO_MAX = '6000'; modo = 'lento';
const t0 = Date.now();
r = await chamar({ tipo: 'extrato', arquivos: arq });
assert.equal(r.code, 503); assert.equal(r.body.tempo, true); assert.ok(Date.now() - t0 < 7000);
console.log('ler-pdf: ok');
