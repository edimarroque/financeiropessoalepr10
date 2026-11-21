// IA financeira (Gemini): análise do cenário e bate-papo sobre os seus dados. Só roda quando você pede.
// POST /api/ia  Authorization: Bearer <login>
//   { acao: 'analise', contexto: '<resumo em texto>' }  → { resumo, nota, destaques[], acoes[] }
//   { acao: 'chat', contexto: '<dados>', mensagens: [{ papel: 'usuario'|'ia', texto }] } → { texto }
// O app monta um resumo compacto dos dados (totais, categorias, lançamentos recentes) para gastar o mínimo de cota.
import { usuarioDoPedido, gemini, responderErro, corpo, ErroHttp, SISTEMA } from './_comum.js';

const SCHEMA_ANALISE = {
  type: 'OBJECT',
  properties: {
    resumo: { type: 'STRING' },
    nota: { type: 'INTEGER' },
    destaques: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      tipo: { type: 'STRING', enum: ['alerta', 'oportunidade', 'positivo'] }, titulo: { type: 'STRING' }, texto: { type: 'STRING' },
      economia_mensal: { type: 'NUMBER', nullable: true } }, required: ['tipo', 'titulo', 'texto'] } },
    acoes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['resumo', 'nota', 'destaques', 'acoes'],
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    await usuarioDoPedido(req);
    const { acao, contexto, mensagens } = corpo(req);
    const ctx = String(contexto || '').slice(0, 60000);
    if (!ctx) throw new ErroHttp(400, 'Sem dados para analisar.');

    if (acao === 'analise') {
      const prompt = `DADOS FINANCEIROS:\n${ctx}\n\nFaça uma análise do cenário: onde estão os maiores gastos, quanto foi para juros/encargos, ` +
        'o que está fora do orçamento, riscos e oportunidades de economia. Dê uma nota de 0 a 10 para a saúde financeira. ' +
        'Em "destaques" traga de 4 a 8 itens (alertas, oportunidades e pontos positivos) e em "acoes" de 3 a 6 ações práticas para o próximo mês.';
      const { json, modelo, uso } = await gemini([{ text: prompt }], { schema: SCHEMA_ANALISE, sistema: SISTEMA, temperatura: 0.3 });
      return res.status(200).json({ ...json, modelo, tokens: uso?.totalTokenCount || null });
    }

    if (acao === 'chat') {
      const msgs = Array.isArray(mensagens) ? mensagens.slice(-12) : [];
      if (!msgs.length) throw new ErroHttp(400, 'Escreva uma pergunta.');
      const historico = [{ role: 'user', parts: [{ text: `DADOS FINANCEIROS (use para responder):\n${ctx}` }] }, { role: 'model', parts: [{ text: 'Entendido. Pode perguntar.' }] },
        ...msgs.slice(0, -1).map((m) => ({ role: m.papel === 'ia' ? 'model' : 'user', parts: [{ text: String(m.texto).slice(0, 4000) }] }))];
      const ultima = String(msgs[msgs.length - 1].texto || '').slice(0, 4000);
      const { texto, modelo, uso } = await gemini([{ text: ultima }], { sistema: SISTEMA + '\nResponda em até 12 linhas, com listas curtas quando ajudar.', historico, temperatura: 0.4 });
      return res.status(200).json({ texto, modelo, tokens: uso?.totalTokenCount || null });
    }
    throw new ErroHttp(400, 'Ação inválida.');
  } catch (e) { return responderErro(res, e); }
}
