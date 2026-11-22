// Testes das rotas /api sem internet: fetch é simulado (Supabase RPC, Gemini e Telegram)
import assert from 'node:assert/strict';
process.env.APP_SECRET = 'x'.repeat(64); process.env.GEMINI_API_KEY = 'k'; process.env.CRON_SECRET = 'c'.repeat(64);
const chamadas = [];
let respostaGemini = null;
let statusGemini = 200;
const ctx = { user_id: 'u1', token: '123:ABC', bot: 'meubot', chat_id: 99, codigo: '123456', codigo_em: new Date().toISOString(), drive_url: null, drive_token: null,
  categorias: [{ id: 'cat-merc', nome: 'Mercado', tipo: 'despesa' }, { id: 'cat-ped', nome: 'Pedagio', tipo: 'despesa' }, { id: 'cat-sal', nome: 'Salário', tipo: 'receita' }],
  contas: [{ id: 'ct1', nome: 'conta itau salario' }, { id: 'ct2', nome: 'conta itau pessoal' }],
  cartoes: [{ id: 'xp', nome: 'Cartão XP', dia_fechamento: 7, dia_vencimento: 15 }], regras: [{ contem: 'PEDAGIO', tipo: 'saida', categoria_id: 'cat-ped' }] };
const dados = { perfil: { nome: 'Edimar' }, contas: [{ id: 'ct2', nome: 'conta itau pessoal', saldo_inicial: 1000, data_saldo: '2026-01-01', ativo: true, moeda: 'BRL' }],
  cartoes: [{ ...ctx.cartoes[0], ativo: true, limite: 1000 }], categorias: ctx.categorias.map((c) => ({ ...c, grupo: 'Despesas Essenciais', valor_mensal: 0 })),
  lancamentos: [{ id: 'l1', tipo: 'saida', valor: 50, descricao: 'MERCADO', categoria_id: 'cat-merc', conta_id: 'ct2', data_movimento: '2026-11-02', data_pagamento: '2026-11-02', situacao: 'pago' },
    { id: 'od3', tipo: 'saida', valor: 221.66, descricao: 'ORALDENTS - Parcela 3/12', cartao_id: 'xp', parcela_num: 3, parcela_total: 12, data_movimento: '2026-08-01', data_pagamento: '2026-08-15', situacao: 'pago' },
    { id: 'od4', tipo: 'saida', valor: 221.66, descricao: 'ORAL DENTS - PARCELA 4/12', cartao_id: 'xp', parcela_num: 1, parcela_total: 8, data_movimento: '2026-09-01', data_pagamento: '2026-09-15', situacao: 'pago' },
    { id: 'od6', tipo: 'saida', valor: 221.66, descricao: 'ORALDENTS', cartao_id: 'xp', parcela_num: 6, parcela_total: 12, data_movimento: '2026-11-01', data_pagamento: '2026-11-15', situacao: 'pago' },
    { id: 'od12', tipo: 'saida', valor: 221.66, descricao: 'ORALDENTS', cartao_id: 'xp', parcela_num: 12, parcela_total: 12, data_movimento: '2027-05-01', data_pagamento: '2027-05-15', situacao: 'pendente' },
    { id: 'l2', tipo: 'saida', valor: 80, descricao: 'LUZ', conta_id: 'ct2', data_movimento: new Date().toISOString().slice(0, 10), data_pagamento: new Date().toISOString().slice(0, 10), situacao: 'pendente' }],
  metas: [], metas_movimentos: [], dividas: [], investimentos: [], recorrentes: [], regras: [] };

globalThis.fetch = async (url, op = {}) => {
  url = String(url);
  const body = op.body && typeof op.body === 'string' ? JSON.parse(op.body) : op.body;
  chamadas.push({ url, body });
  const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
  if (url.includes('/rpc/srv_tg_contexto')) return ok(ctx);
  if (url.includes('/rpc/srv_inserir_lancamentos')) return ok({ lote_id: 'lote-1', ids: body.p_linhas.map((_, i) => 'id' + i) });
  if (url.includes('/rpc/srv_dados')) return ok(dados);
  if (url.includes('/rpc/srv_integracoes')) return ok([{ user_id: 'u1-aaaaaaaa', telegram_token: '123:ABC', telegram_chat_id: 99, avisos_ativos: true, avisos_dias: 3, relatorio_mensal: true, backup_semanal: true, drive_url: null }]);
  if (url.includes('/rpc/')) return ok(null);
  if (url.includes('generativelanguage') && statusGemini !== 200) return { ok: false, status: statusGemini, json: async () => ({}), text: async () => '{"error":{"code":' + statusGemini + '}}' };
  if (url.includes('generativelanguage')) return ok({ candidates: [{ content: { parts: [{ text: typeof respostaGemini === 'string' ? respostaGemini : JSON.stringify(respostaGemini) }] } }] });
  if (url.includes('api.telegram.org')) return ok({ ok: true, result: { message_id: 1 } });
  throw new Error('fetch inesperado ' + url);
};

const res = () => { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const { default: telegram } = await import('../api/telegram.js');
const { default: cron } = await import('../api/cron.js');
const req = (corpo, cab = {}) => ({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's'.repeat(40), ...cab }, body: corpo, query: {} });

// 1) gasto parcelado no cartão: o app (não a IA) calcula parcelas e vencimentos
respostaGemini = { lancamentos: [{ data: '2026-11-20', descricao: 'Notebook', valor: 3000, tipo: 'saida', cartao_id: 'xp', parcelas: 10, categoria_id: 'cat-merc' }] };
let r = res(); await telegram(req({ message: { chat: { id: 99 }, text: 'notebook 3000 em 10x no cartão xp' } }), r);
assert.equal(r.code, 200);
let ins = chamadas.find((c) => c.url.includes('srv_inserir_lancamentos')).body;
assert.equal(ins.p_linhas.length, 10); assert.equal(ins.p_linhas[0].data_pagamento, '2026-12-15'); assert.equal(ins.p_linhas[9].data_pagamento, '2027-09-15');
assert.equal(ins.p_linhas.reduce((s, l) => s + l.valor, 0), 3000); assert.equal(ins.p_linhas[0].situacao, 'pendente'); assert.equal(ins.p_linhas[0].conta_id, null);
const msg = chamadas.filter((c) => c.url.includes('sendMessage')).pop().body;
assert.match(msg.text, /Notebook/); assert.equal(msg.reply_markup.inline_keyboard[0][0].callback_data, 'desfazer:lote-1');

// 2) regra de categoria vence a IA; sem conta informada usa a conta "pessoal"
chamadas.length = 0;
respostaGemini = { lancamentos: [{ data: '2026-11-19', descricao: 'PEDAGIO VIA 040', valor: 12.4, tipo: 'saida', categoria_id: 'cat-merc' }] };
await telegram(req({ message: { chat: { id: 99 }, text: 'pedagio 12,40' } }), res());
ins = chamadas.find((c) => c.url.includes('srv_inserir_lancamentos')).body;
assert.equal(ins.p_linhas[0].categoria_id, 'cat-ped'); assert.equal(ins.p_linhas[0].conta_id, 'ct2'); assert.equal(ins.p_linhas[0].situacao, 'pago');

// 3) perguntas sobre os dados são respondidas SEM IA (na hora, sem gastar cota)
const ultimaMsg = () => chamadas.filter((c) => c.url.includes('sendMessage')).pop().body.text;
const usouIA = () => chamadas.some((c) => c.url.includes('generativelanguage'));
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 99 }, text: 'quanto gastei com mercado em novembro 2026?' } }), res());
assert.ok(!usouIA()); assert.ok(!chamadas.some((c) => c.url.includes('srv_inserir')));
assert.match(ultimaMsg(), /R\$\s?50,00/); assert.match(ultimaMsg(), /Mercado/);
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 99 }, text: 'Oral dents ate qual mês/ ano' } }), res());
assert.ok(!usouIA()); assert.match(ultimaMsg(), /15\/05\/2027/); assert.match(ultimaMsg(), /maio\/2027/); assert.match(ultimaMsg(), /12x de R\$\s?221,66/);
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 99 }, text: 'quais parcelas tenho?' } }), res());
assert.ok(!usouIA()); assert.match(ultimaMsg(), /ORALDENTS/);
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 99 }, text: 'qual meu saldo?' } }), res());
assert.ok(!usouIA()); assert.match(ultimaMsg(), /Saldo hoje/);

// 3b) pergunta aberta vai para a IA com os dados
chamadas.length = 0; respostaGemini = 'Corte o delivery.';
await telegram(req({ message: { chat: { id: 99 }, text: 'onde posso economizar?' } }), res());
assert.ok(usouIA()); assert.match(ultimaMsg(), /Corte o delivery/);
assert.match(JSON.stringify(chamadas.find((c) => c.url.includes('generativelanguage')).body), /MERCADO/);

// 3c) cota da IA esgotada (429): não fica repetindo, troca de modelo e avisa de forma clara e rápida
chamadas.length = 0; statusGemini = 429;
let t0 = Date.now();
await telegram(req({ message: { chat: { id: 99 }, text: 'dicas para economizar com mercado?' } }), res());
assert.ok(Date.now() - t0 < 3000, 'demorou demais');
const tentativasIA = chamadas.filter((c) => c.url.includes('generativelanguage'));
assert.equal(tentativasIA.length, 3); assert.ok(tentativasIA.some((c) => c.url.includes('flash-lite')));
assert.match(ultimaMsg(), /limite grátis/); assert.doesNotMatch(ultimaMsg(), /"error"/); assert.match(ultimaMsg(), /MERCADO/);

// 3d) lançamento simples sem IA (categoria reconhecida pelo nome); com IA fora do ar, lança sem categoria
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 99 }, text: 'mercado 87,50 no débito' } }), res());
assert.ok(!usouIA());
ins = chamadas.find((c) => c.url.includes('srv_inserir_lancamentos')).body;
assert.equal(ins.p_linhas[0].valor, 87.5); assert.equal(ins.p_linhas[0].categoria_id, 'cat-merc'); assert.equal(ins.p_linhas[0].metodo, 'Débito'); assert.equal(ins.p_linhas[0].conta_id, 'ct2');
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 99 }, text: 'padaria 1.250,00 cartão xp em 5x' } }), res());
ins = chamadas.find((c) => c.url.includes('srv_inserir_lancamentos')).body;
assert.equal(ins.p_linhas.length, 5); assert.equal(ins.p_linhas.reduce((s, l) => s + l.valor, 0), 1250); assert.equal(ins.p_linhas[0].cartao_id, 'xp'); assert.equal(ins.p_linhas[0].categoria_id, null);
assert.match(ultimaMsg(), /sem categoria/);
statusGemini = 200;

// 4) chat de outra pessoa é recusado e nada é lido
chamadas.length = 0;
await telegram(req({ message: { chat: { id: 1234 }, text: 'mercado 10' } }), res());
assert.ok(!chamadas.some((c) => c.url.includes('generativelanguage') || c.url.includes('srv_inserir')));
assert.match(chamadas.filter((c) => c.url.includes('sendMessage')).pop().body.text, /privado/);

// 5) desfazer pelo botão
chamadas.length = 0;
await telegram(req({ callback_query: { id: 'q', data: 'desfazer:lote-1', message: { chat: { id: 99 }, message_id: 5 } } }), res());
assert.equal(chamadas.find((c) => c.url.includes('srv_remover_lote')).body.p_lote, 'lote-1');

// 6) sem cabeçalho secreto: ignora
chamadas.length = 0; r = res();
await telegram({ method: 'POST', headers: {}, body: { message: { chat: { id: 99 }, text: 'oi' } }, query: {} }, r);
assert.equal(r.code, 200); assert.equal(chamadas.length, 0);

// 7) cron: exige segredo; avisa conta pendente de hoje
r = res(); await cron({ headers: {}, query: {} }, r); assert.equal(r.code, 401);
chamadas.length = 0; r = res();
await cron({ headers: { authorization: 'Bearer ' + 'c'.repeat(64) }, query: { tarefa: 'avisos' } }, r);
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.match(chamadas.find((c) => c.url.includes('sendMessage')).body.text, /LUZ/);
console.log('API OK');
// relatório e contexto da IA
{
  const { htmlRelatorio } = await import('../js/relatorio.js');
  const { contextoIA } = await import('../js/contexto-ia.js');
  const h = htmlRelatorio(dados, '2026-11', { nome: 'Edimar' });
  assert.match(h, /Relatório financeiro — Novembro 2026/); assert.match(h, /MERCADO/); assert.match(h, /Edimar/);
  const c = contextoIA(dados, { lancamentosDias: 400 });
  assert.match(c, /conta itau pessoal: 950\.00/); assert.match(c, /MERCADO/); assert.ok(c.length < 20000);
  console.log('RELATÓRIO/CONTEXTO OK');
}
