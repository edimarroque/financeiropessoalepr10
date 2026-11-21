// Envio do relatório mensal (PDF pelo Google Drive, ou HTML) para o Telegram — usado pelo bot e pelo agendador.
import { srv, drive, tgEnviarDocumento } from './_comum.js';
import { somarMesRef, nomeMes } from '../js/calc.js';
import { htmlRelatorio } from '../js/relatorio.js';

/** ctx = { user_id, token (bot), drive_url, drive_token } */
export async function enviarRelatorio(ctx, chat, ref) {
  const d = await srv('srv_dados', { p_user: ctx.user_id, p_desde: somarMesRef(ref, -2) + '-01' });
  const html = htmlRelatorio(d, ref, { nome: d.perfil?.nome || '' });
  if (ctx.drive_url && ctx.drive_token) {
    const r = await drive(ctx.drive_url, ctx.drive_token, 'relatorioPdf', { mes: ref, html, nome: `Relatorio_${ref}.pdf` });
    await tgEnviarDocumento(ctx.token, chat, `Relatorio_${ref}.pdf`, Buffer.from(r.base64, 'base64'), `📄 Relatório de <b>${nomeMes(ref)}</b> (também salvo no Google Drive).`);
  } else {
    await tgEnviarDocumento(ctx.token, chat, `Relatorio_${ref}.html`, Buffer.from(html, 'utf8'), `📄 Relatório de <b>${nomeMes(ref)}</b>. Abra e use “Imprimir → Salvar em PDF”. Configure o Google Drive no app para receber em PDF.`, 'text/html');
  }
}

