// Tarefas automáticas (todo dia às 08:00 de Brasília, pelo agendador da Vercel):
//  • avisos de vencimento no Telegram (contas, boletos e faturas nos próximos dias + atrasados)
//  • dia 1: relatório do mês anterior em PDF no Telegram (e salvo no Drive)
//  • domingo (ou 7 dias sem backup): backup completo (JSON + CSV) no Google Drive
import { srv, drive, tg, escHtml, responderErro, ErroHttp } from './_comum.js';
import { enviarRelatorio } from './_envios.js';
import { hoje, mesDe, somarMesRef, fmtData, nomeMes, diasEntre } from '../js/calc.js';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => fmt.format(Number(v) || 0);
const somaDias = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

function csvLancamentos(d) {
  const cat = new Map(d.categorias.map((c) => [c.id, c.nome])), conta = new Map(d.contas.map((c) => [c.id, c.nome])), cartao = new Map(d.cartoes.map((c) => [c.id, c.nome]));
  const cel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cab = 'Data da Movimentação;Data do Pagamento;Tipo;Categoria;Descrição;Valor;Conta Bancária;Conta Destino;Cartão;Método de Pagamento;Nº da Parcela;Situação';
  const br = (x) => x.split('-').reverse().join('/');
  return '﻿' + [cab, ...d.lancamentos.map((l) => [br(l.data_movimento), br(l.data_pagamento), l.tipo, cat.get(l.categoria_id) || '', l.descricao, String(l.valor).replace('.', ','),
    conta.get(l.conta_id) || '', conta.get(l.conta_destino_id) || '', cartao.get(l.cartao_id) || '', l.metodo, l.parcela_total ? `${l.parcela_num} de ${l.parcela_total}` : '', l.situacao].map(cel).join(';'))].join('\r\n');
}

async function avisos(i, d) {
  const hj = hoje(), lim = somaDias(hj, i.avisos_dias ?? 3), desde = somaDias(hj, -10);
  const pend = d.lancamentos.filter((l) => l.situacao === 'pendente' && l.tipo === 'saida' && l.data_pagamento >= desde && l.data_pagamento <= lim);
  const contas = pend.filter((l) => !l.cartao_id).sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento));
  const faturas = new Map();
  for (const l of pend.filter((x) => x.cartao_id)) { const k = `${l.cartao_id}|${l.data_pagamento}`; faturas.set(k, (faturas.get(k) || 0) + Number(l.valor)); }
  const nomeCartao = (id) => d.cartoes.find((c) => c.id === id)?.nome || 'Cartão';
  const quando = (dt) => (dt < hj ? `🔴 venceu ${fmtData(dt)}` : dt === hj ? '🟠 vence HOJE' : `🟡 vence ${fmtData(dt)} (${diasEntre(hj, dt) - 1} dia(s))`);
  const linhas = [
    ...[...faturas.entries()].map(([k, v]) => { const [c, dt] = k.split('|'); return `${quando(dt)} · 💳 Fatura ${escHtml(nomeCartao(c))} · <b>${brl(v)}</b>`; }),
    ...contas.map((l) => `${quando(l.data_pagamento)} · ${escHtml(l.descricao)} · <b>${brl(l.valor)}</b>`),
  ];
  if (!linhas.length) return 0;
  await tg(i.telegram_token, 'sendMessage', { chat_id: i.telegram_chat_id, parse_mode: 'HTML',
    text: `⏰ <b>Vencimentos</b>\n${linhas.join('\n')}\n\nJá pagou? Marque como pago no app.`,
    reply_markup: { inline_keyboard: [[{ text: '📱 Abrir lançamentos', url: 'https://financeiropessoalepr10.vercel.app/#/lancamentos' }]] } });
  return linhas.length;
}

async function backup(i, d) {
  const nome = `Backup_${hoje()}`;
  const r = await drive(i.drive_url, i.drive_token, 'salvarBackup', { nome, json: JSON.stringify({ gerado_em: new Date().toISOString(), ...d }), csv: csvLancamentos(d) });
  await srv('srv_marcar_backup', { p_user: i.user_id });
  return r;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const auth = String(req.headers.authorization || '');
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) throw new ErroHttp(401, 'Não autorizado.');
    const forcar = String(req.query?.tarefa || '');
    const lista = await srv('srv_integracoes');
    const out = [];
    const hj = hoje(), diaSemana = new Date(hj + 'T12:00:00Z').getUTCDay();
    for (const i of lista) {
      const r = { user: i.user_id.slice(0, 8) };
      try {
        const tgOk = i.telegram_token && i.telegram_chat_id;
        const precisaBackup = i.drive_url && i.backup_semanal && (forcar === 'backup' || diaSemana === 0 || !i.ultimo_backup || Date.now() - new Date(i.ultimo_backup).getTime() > 7.5 * 86400000);
        const d = await srv('srv_dados', { p_user: i.user_id, p_desde: precisaBackup ? null : somarMesRef(mesDe(hj), -3) + '-01' });
        if (tgOk && i.avisos_ativos && (!forcar || forcar === 'avisos')) r.avisos = await avisos(i, d);
        if (tgOk && i.relatorio_mensal && (hj.endsWith('-01') || forcar === 'relatorio')) {
          const ref = somarMesRef(mesDe(hj), -1);
          await enviarRelatorio({ user_id: i.user_id, token: i.telegram_token, drive_url: i.drive_url, drive_token: i.drive_token }, i.telegram_chat_id, ref);
          r.relatorio = nomeMes(ref);
        }
        if (precisaBackup && (!forcar || forcar === 'backup')) {
          await backup(i, d); r.backup = true;
          if (tgOk) await tg(i.telegram_token, 'sendMessage', { chat_id: i.telegram_chat_id, text: `💾 Backup semanal salvo no Google Drive (02_Backups) — ${d.lancamentos.length} lançamentos.` }).catch(() => {});
        }
      } catch (e) { r.erro = e.message; console.error('cron', i.user_id, e); }
      out.push(r);
    }
    return res.status(200).json({ ok: true, hoje: hj, resultado: out });
  } catch (e) { return responderErro(res, e); }
}
