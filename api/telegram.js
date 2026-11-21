// Bot do Telegram (seu bot pessoal): lança gastos por texto ou foto, guarda PDFs na Caixa de entrada e responde perguntas com IA.
//
// 1) Webhook (chamado pelo Telegram): cabeçalho X-Telegram-Bot-Api-Secret-Token identifica a sua configuração.
// 2) Ações do app (com login): POST /api/telegram?acao=configurar|testar|desconectar|arquivo|enviar_pdf
import { usuarioDoPedido, rest, srv, gemini, tg, tgEnviarDocumento, tgBaixarArquivo, drive, responderErro, corpo, ErroHttp, SITE, SISTEMA, escHtml } from './_comum.js';
import { vencimentoDaCompra, gerarParcelas, hoje, mesDe, fmtData, nomeMes, somarMesRef, saldoConta, fatura, vencimentoAtual, arred } from '../js/calc.js';
import { numerosDoMes } from '../js/relatorio.js';
import { enviarRelatorio } from './_envios.js';
import { contextoIA } from '../js/contexto-ia.js';
import crypto from 'node:crypto';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => fmt.format(Number(v) || 0);
const AJUDA = `🤖 <b>Financeiro Pessoal — bot</b>

<b>Lançar um gasto:</b> escreva do seu jeito, ex.:
• <i>mercado 87,50 no débito</i>
• <i>uber 23,90 cartão xp</i>
• <i>notebook 3000 em 10x no cartão xp</i>
• <i>recebi 1500 de freela pix</i>
📸 Ou mande a <b>foto do cupom/comprovante</b>.

<b>Faturas e extratos (PDF):</b> envie o arquivo — ele vai para a Caixa de entrada e você confere em Importar no app.

<b>Perguntas:</b> termine com “?”, ex.: <i>quanto gastei com mercado esse mês?</i>

<b>Comandos:</b> /resumo · /saldo · /faturas · /contas · /relatorio · /ajuda`;

const SCHEMA_LANC = {
  type: 'OBJECT',
  properties: {
    lancamentos: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      data: { type: 'STRING' }, descricao: { type: 'STRING' }, valor: { type: 'NUMBER' }, tipo: { type: 'STRING', enum: ['saida', 'entrada'] },
      categoria_id: { type: 'STRING', nullable: true }, conta_id: { type: 'STRING', nullable: true }, cartao_id: { type: 'STRING', nullable: true },
      parcelas: { type: 'INTEGER', nullable: true }, metodo: { type: 'STRING', nullable: true },
    }, required: ['data', 'descricao', 'valor', 'tipo'] } },
    observacao: { type: 'STRING', nullable: true },
  },
  required: ['lancamentos'],
};

function promptLancamento(ctx, extra) {
  const cats = ctx.categorias.map((c) => `${c.id} = ${c.nome} (${c.tipo})`).join('\n');
  const contas = ctx.contas.map((c) => `${c.id} = ${c.nome}`).join('\n');
  const cartoes = ctx.cartoes.map((c) => `${c.id} = ${c.nome}`).join('\n');
  return `Hoje é ${hoje()}. Transforme a mensagem em lançamento(s) financeiro(s) do usuário.
Regras: valor sempre positivo; tipo "saida" para gastos/pagamentos e "entrada" para recebimentos. Data AAAA-MM-DD (ontem/anteontem/dia X relativos a hoje; sem data = hoje).
Escolha categoria_id, conta_id e cartao_id SOMENTE das listas abaixo (ou null). Se citar cartão/crédito, use cartao_id e conta_id null.
Se citar parcelas ("10x", "em 3 vezes"), informe parcelas e o VALOR TOTAL da compra. metodo: Pix, Débito, Boleto, Dinheiro, Transferência ou Crédito.
Descrição curta e clara (ex.: "Mercado BH"). Se a mensagem não for um lançamento, devolva lista vazia e explique em observacao.
${extra || ''}
CATEGORIAS:\n${cats}\nCONTAS:\n${contas}\nCARTÕES:\n${cartoes}`;
}

function contaPadrao(ctx) {
  return ctx.contas.find((c) => /pessoal/i.test(c.nome)) || ctx.contas.find((c) => !/salario|salário|ticket|aliment|dinheiro/i.test(c.nome)) || ctx.contas[0];
}

function aplicarRegras(ctx, desc, tipo) {
  const n = String(desc || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const r = (ctx.regras || []).filter((x) => x.tipo === tipo && n.includes(String(x.contem).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()))
    .sort((a, b) => b.contem.length - a.contem.length)[0];
  return r ? r.categoria_id : null;
}

/** Converte a resposta da IA em linhas do banco (parcelas e fatura do cartão calculadas pelo app, não pela IA) */
function montarLinhas(ctx, itens, origem, tags = []) {
  const ids = (l) => new Set(l.map((x) => x.id));
  const okCat = ids(ctx.categorias), okConta = ids(ctx.contas), okCartao = ids(ctx.cartoes);
  const linhas = [];
  for (const it of itens) {
    const valor = arred(Math.abs(Number(it.valor)));
    if (!(valor > 0)) continue;
    const data = /^\d{4}-\d{2}-\d{2}$/.test(it.data || '') ? it.data : hoje();
    const tipo = it.tipo === 'entrada' ? 'entrada' : 'saida';
    const cartao = it.cartao_id && okCartao.has(it.cartao_id) && tipo === 'saida' ? ctx.cartoes.find((c) => c.id === it.cartao_id) : null;
    const contaId = cartao ? null : (it.conta_id && okConta.has(it.conta_id) ? it.conta_id : contaPadrao(ctx)?.id);
    let categoria = it.categoria_id && okCat.has(it.categoria_id) ? it.categoria_id : null;
    categoria = aplicarRegras(ctx, it.descricao, tipo) || categoria;
    const n = cartao ? Math.min(48, Math.max(1, Number(it.parcelas) || 1)) : 1;
    const grupo = n > 1 ? crypto.randomUUID() : null;
    for (const p of gerarParcelas({ data_movimento: data, valor, parcelas: n, cartao })) {
      linhas.push({ data_movimento: data, data_pagamento: p.data_pagamento, tipo, categoria_id: categoria, descricao: String(it.descricao || 'Telegram').slice(0, 200),
        valor: p.valor, conta_id: contaId, cartao_id: cartao?.id || null, metodo: cartao ? 'Crédito' : (it.metodo || (tipo === 'entrada' ? 'Pix' : 'Débito')),
        parcela_num: p.parcela_num, parcela_total: p.parcela_total, grupo_parcela: grupo,
        situacao: cartao ? 'pendente' : (p.data_pagamento > hoje() ? 'pendente' : (tipo === 'entrada' ? 'recebido' : 'pago')), origem, tags });
    }
  }
  return linhas;
}

function textoLancados(ctx, linhas) {
  const nomeCat = (id) => ctx.categorias.find((c) => c.id === id)?.nome || '❓ sem categoria';
  const onde = (l) => (l.cartao_id ? `💳 ${ctx.cartoes.find((c) => c.id === l.cartao_id)?.nome}` : `🏦 ${ctx.contas.find((c) => c.id === l.conta_id)?.nome || ''}`);
  const principais = linhas.filter((l) => !l.parcela_num || l.parcela_num === 1);
  return principais.map((l) => `${l.tipo === 'entrada' ? '⬆️' : '⬇️'} <b>${escHtml(l.descricao)}</b> — ${brl(l.parcela_total ? l.valor * l.parcela_total : l.valor)}${l.parcela_total ? ` (${l.parcela_total}x)` : ''}\n   ${fmtData(l.data_movimento)} · ${escHtml(nomeCat(l.categoria_id))} · ${escHtml(onde(l))}${l.cartao_id ? ` · fatura ${fmtData(l.data_pagamento)}` : ''}`).join('\n');
}

async function lancar(ctx, chat, linhas, descricaoLote) {
  if (!linhas.length) return null;
  const r = await srv('srv_inserir_lancamentos', { p_user: ctx.user_id, p_lote: { origem: 'telegram', descricao: descricaoLote }, p_linhas: linhas });
  await tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: `✅ Lançado:\n${textoLancados(ctx, linhas)}\n\nErrou algo? Toque em desfazer ou ajuste no app.`,
    reply_markup: { inline_keyboard: [[{ text: '↩️ Desfazer', callback_data: `desfazer:${r.lote_id}` }, { text: '📱 Abrir app', url: `${SITE}/#/lancamentos` }]] } });
  return r;
}

async function dadosRecentes(ctx, meses = 7) {
  return srv('srv_dados', { p_user: ctx.user_id, p_desde: somarMesRef(mesDe(hoje()), -meses) + '-01' });
}

// ---------------- comandos ----------------
async function cmdResumo(ctx, chat, arg) {
  const d = await dadosRecentes(ctx);
  const ref = /^\d{4}-\d{2}$/.test(arg || '') ? arg : mesDe(hoje());
  const n = numerosDoMes(d, ref);
  const top = n.porCat.slice(0, 6).map((x) => `• ${escHtml(x.categoria?.nome || 'Sem categoria')}: ${brl(x.total)}`).join('\n');
  const txt = `📊 <b>${nomeMes(ref)}</b>\n⬆️ Ganhos: <b>${brl(n.r.receitas)}</b>\n⬇️ Gastos: <b>${brl(n.r.despesas)}</b>\n💰 Saldo: <b>${brl(n.r.saldo)}</b>\n⏳ Pendente: ${brl(n.r.pendentesValor)}` +
    `${n.encargos ? `\n💸 Juros/IOF/tarifas: ${brl(n.encargos)}` : ''}\n\n<b>Maiores categorias</b>\n${top || '—'}` +
    `${n.orc.length ? `\n\n⚠️ Limite: ${n.orc.map((o) => `${escHtml(o.categoria.nome)} ${Math.round(o.p * 100)}%`).join(', ')}` : ''}`;
  await tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: txt });
}

async function cmdSaldo(ctx, chat) {
  const d = await dadosRecentes(ctx, 120);
  const linhas = d.contas.filter((c) => c.ativo).map((c) => { const s = saldoConta(c, d.lancamentos, hoje()); return `🏦 ${escHtml(c.nome)}: <b>${c.moeda === 'USD' ? 'US$ ' + s.toFixed(2) : brl(s)}</b>`; });
  await tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: `💰 <b>Saldo hoje</b>\n${linhas.join('\n')}` });
}

async function cmdFaturas(ctx, chat) {
  const d = await dadosRecentes(ctx, 2);
  const linhas = d.cartoes.filter((c) => c.ativo).map((c) => {
    const v = vencimentoAtual(c); const f = fatura(c, d.lancamentos, v);
    const prox = fatura(c, d.lancamentos, somarMesRef(mesDe(v), 1) + v.slice(7));
    return `💳 <b>${escHtml(c.nome)}</b>\n   vence ${fmtData(v)}: <b>${brl(f.total)}</b>${f.paga ? ' ✓ paga' : ''}\n   próxima: ${brl(prox.total)}`;
  });
  await tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: linhas.join('\n') || 'Nenhum cartão.' });
}

async function cmdContas(ctx, chat) {
  const d = await dadosRecentes(ctx, 1);
  const lim = somarMesRef(mesDe(hoje()), 1) + hoje().slice(7);
  const pend = d.lancamentos.filter((l) => l.situacao === 'pendente' && l.tipo === 'saida' && !l.cartao_id && l.data_pagamento <= lim).sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento));
  const txt = pend.map((l) => `${l.data_pagamento < hoje() ? '🔴' : '🟡'} ${fmtData(l.data_pagamento)} · ${escHtml(l.descricao)} · <b>${brl(l.valor)}</b>`).join('\n');
  await tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: txt ? `🧾 <b>Contas a pagar (próximos 30 dias)</b>\n${txt}` : '✅ Nenhuma conta pendente nos próximos 30 dias.' });
}

async function responderPergunta(ctx, chat, pergunta) {
  await tg(ctx.token, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
  const d = await dadosRecentes(ctx, 6);
  const contexto = contextoIA(d, { meses: 6, lancamentosDias: 75 });
  const { texto } = await gemini([{ text: pergunta.slice(0, 2000) }], {
    sistema: SISTEMA + '\nVocê está no Telegram: responda em até 10 linhas, texto simples (sem markdown).',
    historico: [{ role: 'user', parts: [{ text: `DADOS FINANCEIROS:\n${contexto}` }] }, { role: 'model', parts: [{ text: 'Entendido.' }] }], temperatura: 0.4,
  });
  await tg(ctx.token, 'sendMessage', { chat_id: chat, text: `🤖 ${texto.slice(0, 3900)}` });
}

function ehPergunta(t) {
  const s = t.trim().toLowerCase();
  if (s.endsWith('?')) return true;
  if (/^(quanto|quantos|quantas|qual|quais|como|onde|quando|por ?que|me (diga|mostra|mostre)|mostre|liste|resuma|analis|tenho|estou|devo|posso|vale)/.test(s) && !/\d+[.,]?\d*\s*(reais|r\$)?$/.test(s)) return true;
  return !/\d/.test(s); // sem número não dá para lançar: trata como pergunta
}

// ---------------- foto e documentos ----------------
async function lerImagem(ctx, chat, fileId, legenda) {
  await tg(ctx.token, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
  const { bytes, caminho } = await tgBaixarArquivo(ctx.token, fileId);
  const mime = /\.png$/i.test(caminho) ? 'image/png' : 'image/jpeg';
  const { json } = await gemini([{ inlineData: { mimeType: mime, data: bytes.toString('base64') } }, { text: promptLancamento(ctx,
    `A mensagem é a FOTO de um cupom fiscal, nota, recibo ou comprovante (Pix, boleto, cartão). Use o valor TOTAL pago e o nome do estabelecimento. ${legenda ? `Legenda do usuário: "${legenda}".` : ''}`) }],
  { schema: SCHEMA_LANC, temperatura: 0 });
  const linhas = montarLinhas(ctx, json.lancamentos || [], 'telegram', ['comprovante']);
  if (!linhas.length) return tg(ctx.token, 'sendMessage', { chat_id: chat, text: `Não consegui identificar um valor nessa imagem. ${json.observacao || ''}`.trim() });
  const r = await lancar(ctx, chat, linhas, `📸 Foto pelo Telegram · ${linhas[0].descricao}`);
  // original no Google Drive, na pasta do mês (Recibos_Comprovantes)
  if (r && ctx.drive_url && ctx.drive_token) {
    const l = linhas[0];
    await drive(ctx.drive_url, ctx.drive_token, 'salvar', { mes: mesDe(l.data_pagamento), tipo: 'recibo', mime,
      nome: `${l.data_movimento}_${l.descricao.replace(/[^\w\- ]+/g, '').slice(0, 40)}_${String(l.valor).replace('.', ',')}.${mime === 'image/png' ? 'png' : 'jpg'}`,
      base64: bytes.toString('base64'), descricao: `Lançamento via Telegram (lote ${r.lote_id})` }).catch((e) => console.warn('drive recibo', e.message));
  }
}

async function guardarDocumento(ctx, chat, doc) {
  if (doc.file_size > 19 * 1024 * 1024) return tg(ctx.token, 'sendMessage', { chat_id: chat, text: 'Arquivo grande demais para o bot (máx. 20 MB). Coloque direto na Caixa de entrada do Drive.' });
  let driveId = null;
  if (ctx.drive_url && ctx.drive_token) {
    const { bytes } = await tgBaixarArquivo(ctx.token, doc.file_id);
    const r = await drive(ctx.drive_url, ctx.drive_token, 'salvarEntrada', { nome: doc.file_name || `telegram_${Date.now()}.pdf`, mime: doc.mime_type || 'application/pdf', base64: bytes.toString('base64') });
    driveId = r.id;
  }
  await srv('srv_caixa_inserir', { p_user: ctx.user_id, p_item: { origem: 'telegram', nome: doc.file_name || 'arquivo.pdf', mime: doc.mime_type || '', tamanho: doc.file_size || 0,
    telegram_file_id: doc.file_id, drive_file_id: driveId } });
  await tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML',
    text: `📥 <b>${escHtml(doc.file_name || 'Arquivo')}</b> guardado na Caixa de entrada${driveId ? ' (Google Drive)' : ''}.\nAbra <b>Importar</b> no app para ler com IA, conferir e lançar.`,
    reply_markup: { inline_keyboard: [[{ text: '📥 Abrir Importar', url: `${SITE}/#/importar` }]] } });
}

// ---------------- webhook ----------------
async function processar(ctx, upd) {
  if (upd.callback_query) {
    const q = upd.callback_query;
    if (String(q.message?.chat?.id) !== String(ctx.chat_id)) return;
    const [acao, id] = String(q.data || '').split(':');
    if (acao === 'desfazer' && id) {
      const n = await srv('srv_remover_lote', { p_user: ctx.user_id, p_lote: id });
      await tg(ctx.token, 'answerCallbackQuery', { callback_query_id: q.id, text: n ? 'Desfeito.' : 'Já tinha sido removido.' });
      await tg(ctx.token, 'editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `↩️ Desfeito (${n} lançamento(s) removido(s)).` }).catch(() => {});
    }
    return;
  }
  const m = upd.message;
  if (!m) return;
  const chat = m.chat.id;
  const texto = String(m.text || '').trim();

  // vincular o seu chat com o código mostrado no app
  if (!ctx.chat_id || String(ctx.chat_id) !== String(chat)) {
    const cod = (texto.match(/^\/start\s+(\S+)/) || [])[1];
    const valido = cod && ctx.codigo && cod === ctx.codigo && ctx.codigo_em && Date.now() - new Date(ctx.codigo_em).getTime() < 48 * 3600 * 1000;
    if (valido && !ctx.chat_id) {
      await srv('srv_tg_vincular', { p_user: ctx.user_id, p_chat: chat });
      return tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: `✅ Bot conectado ao seu Financeiro Pessoal!\n\n${AJUDA}` });
    }
    return tg(ctx.token, 'sendMessage', { chat_id: chat, text: '🔒 Este bot é privado. Conecte pelo app: Mais e ajustes → Integrações → Telegram.' });
  }

  if (m.photo?.length) return lerImagem(ctx, chat, m.photo[m.photo.length - 1].file_id, m.caption || '');
  if (m.document) {
    if (/^image\//.test(m.document.mime_type || '')) return lerImagem(ctx, chat, m.document.file_id, m.caption || '');
    return guardarDocumento(ctx, chat, m.document);
  }
  if (m.voice || m.audio) return tg(ctx.token, 'sendMessage', { chat_id: chat, text: 'Ainda não entendo áudio. Escreva o gasto ou mande a foto do comprovante 🙂' });
  if (!texto) return;

  const [cmd, ...resto] = texto.split(/\s+/);
  const arg = resto.join(' ');
  switch (cmd.toLowerCase().replace(/@.*$/, '')) {
    case '/start': case '/ajuda': case '/help': return tg(ctx.token, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: AJUDA });
    case '/resumo': return cmdResumo(ctx, chat, arg);
    case '/saldo': return cmdSaldo(ctx, chat);
    case '/faturas': return cmdFaturas(ctx, chat);
    case '/contas': return cmdContas(ctx, chat);
    case '/relatorio': {
      const ref = /^\d{4}-\d{2}$/.test(arg) ? arg : mesDe(hoje());
      await tg(ctx.token, 'sendMessage', { chat_id: chat, text: `⏳ Gerando o relatório de ${nomeMes(ref)}…` });
      return enviarRelatorio(ctx, chat, ref);
    }
    default: break;
  }
  if (ehPergunta(texto)) return responderPergunta(ctx, chat, texto);

  await tg(ctx.token, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
  const { json } = await gemini([{ text: `${promptLancamento(ctx)}\n\nMENSAGEM: ${texto.slice(0, 1000)}` }], { schema: SCHEMA_LANC, temperatura: 0 });
  const linhas = montarLinhas(ctx, json.lancamentos || [], 'telegram');
  if (!linhas.length) return responderPergunta(ctx, chat, texto);
  await lancar(ctx, chat, linhas, `💬 Telegram · ${texto.slice(0, 60)}`);
}

// ---------------- ações do app ----------------
async function acaoApp(req, res, acao) {
  const u = await usuarioDoPedido(req);
  const b = corpo(req);
  const [cfg] = await rest(u.token, `integracoes?user_id=eq.${u.id}&select=*`) || [];
  if (acao === 'configurar') {
    const token = String(b.token || cfg?.telegram_token || '').trim();
    if (!/^\d{5,}:[\w-]{30,}$/.test(token)) throw new ErroHttp(400, 'Token inválido. Copie o token que o @BotFather enviou (ex.: 123456789:AA...).');
    const eu = await tg(token, 'getMe');
    const segredo = crypto.randomBytes(24).toString('hex');
    const codigo = String(crypto.randomInt(100000, 999999));
    const dados = { telegram_token: token, telegram_bot: eu.username, telegram_segredo: segredo, telegram_codigo: codigo, telegram_codigo_em: new Date().toISOString(),
      telegram_chat_id: b.manterChat && cfg?.telegram_token === token ? cfg.telegram_chat_id : null, updated_at: new Date().toISOString() };
    if (cfg) await rest(u.token, `integracoes?user_id=eq.${u.id}`, { metodo: 'PATCH', corpo: dados });
    else await rest(u.token, 'integracoes', { metodo: 'POST', corpo: { user_id: u.id, ...dados } });
    await tg(token, 'setWebhook', { url: `${SITE}/api/telegram`, secret_token: segredo, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    await tg(token, 'setMyCommands', { commands: [
      { command: 'resumo', description: 'Resumo do mês' }, { command: 'saldo', description: 'Saldo das contas' }, { command: 'faturas', description: 'Faturas dos cartões' },
      { command: 'contas', description: 'Contas a pagar' }, { command: 'relatorio', description: 'Relatório do mês em PDF' }, { command: 'ajuda', description: 'Como usar' }] }).catch(() => {});
    return res.status(200).json({ bot: eu.username, link: `https://t.me/${eu.username}?start=${codigo}`, codigo });
  }
  if (!cfg?.telegram_token) throw new ErroHttp(400, 'Telegram ainda não configurado.');
  if (acao === 'testar') {
    if (!cfg.telegram_chat_id) throw new ErroHttp(400, 'Falta conectar: abra o link do bot e toque em “Iniciar”.');
    await tg(cfg.telegram_token, 'sendMessage', { chat_id: cfg.telegram_chat_id, text: '👋 Teste do Financeiro Pessoal: o bot está funcionando!' });
    return res.status(200).json({ ok: true });
  }
  if (acao === 'desconectar') {
    await tg(cfg.telegram_token, 'deleteWebhook', {}).catch(() => {});
    await rest(u.token, `integracoes?user_id=eq.${u.id}`, { metodo: 'PATCH', corpo: { telegram_token: null, telegram_bot: null, telegram_chat_id: null, telegram_segredo: null, telegram_codigo: null } });
    return res.status(200).json({ ok: true });
  }
  if (acao === 'arquivo') {
    const { bytes } = await tgBaixarArquivo(cfg.telegram_token, String(b.file_id || ''));
    return res.status(200).json({ base64: bytes.toString('base64') });
  }
  if (acao === 'enviar_pdf') {
    if (!cfg.telegram_chat_id) throw new ErroHttp(400, 'Conecte o bot primeiro.');
    await tgEnviarDocumento(cfg.telegram_token, cfg.telegram_chat_id, String(b.nome || 'relatorio.pdf'), Buffer.from(String(b.base64 || ''), 'base64'), String(b.legenda || ''), String(b.mime || 'application/pdf'));
    return res.status(200).json({ ok: true });
  }
  if (acao === 'relatorio') {
    if (!cfg.telegram_chat_id) throw new ErroHttp(400, 'Conecte o bot primeiro.');
    await enviarRelatorio({ ...cfg, user_id: u.id, token: cfg.telegram_token, drive_url: cfg.drive_url, drive_token: cfg.drive_token }, cfg.telegram_chat_id, /^\d{4}-\d{2}$/.test(b.mes || '') ? b.mes : mesDe(hoje()));
    return res.status(200).json({ ok: true });
  }
  throw new ErroHttp(400, 'Ação inválida.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const acao = String(req.query?.acao || '');
  if (acao) { try { return await acaoApp(req, res, acao); } catch (e) { return responderErro(res, e); } }

  // webhook do Telegram: responde 200 sempre (senão o Telegram reenvia a mesma mensagem várias vezes)
  const segredoTg = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  let ctx = null;
  try {
    ctx = segredoTg ? await srv('srv_tg_contexto', { p_tg_segredo: segredoTg }) : null;
    if (ctx) await processar(ctx, corpo(req));
  } catch (e) {
    console.error('telegram', e);
    const chat = corpo(req)?.message?.chat?.id;
    if (ctx?.token && chat && String(chat) === String(ctx.chat_id)) await tg(ctx.token, 'sendMessage', { chat_id: chat, text: `⚠️ Não consegui agora: ${String(e.message || e).slice(0, 300)}` }).catch(() => {});
  }
  return res.status(200).json({ ok: true });
}
