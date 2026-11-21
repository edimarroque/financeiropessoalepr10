// Google Drive pelo Apps Script do próprio usuário (pasta Aplicativo_Financeiro_WEB).
// POST /api/drive  Authorization: Bearer <login>  { acao, ...dados }
//   configurar { url, token } · ping · estrutura · listarEntrada · baixar { id } · arquivar { id, mes, tipo, nome }
//   salvar { mes, tipo, nome, mime, base64 } · salvarEntrada · salvarBackup { nome, json, csv } · relatorioPdf { mes, html, nome } · descartar { id }
import { usuarioDoPedido, rest, drive, responderErro, corpo, ErroHttp } from './_comum.js';

const PERMITIDAS = new Set(['ping', 'estrutura', 'listarEntrada', 'baixar', 'arquivar', 'salvar', 'salvarEntrada', 'salvarBackup', 'relatorioPdf', 'descartar']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    const u = await usuarioDoPedido(req);
    const { acao, ...dados } = corpo(req);
    const [cfg] = await rest(u.token, `integracoes?user_id=eq.${u.id}&select=drive_url,drive_token`) || [];
    if (acao === 'configurar') {
      const url = String(dados.url || '').trim(), token = String(dados.token || '').trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new ErroHttp(400, 'Cole o endereço do “App da Web” (termina com /exec).');
      if (token.length < 24) throw new ErroHttp(400, 'Token inválido.');
      const r = await drive(url, token, 'estrutura', {});
      const patch = { drive_url: url, drive_token: token, updated_at: new Date().toISOString() };
      if (cfg) await rest(u.token, `integracoes?user_id=eq.${u.id}`, { metodo: 'PATCH', corpo: patch });
      else await rest(u.token, 'integracoes', { metodo: 'POST', corpo: { user_id: u.id, ...patch } });
      return res.status(200).json(r);
    }
    if (!PERMITIDAS.has(acao)) throw new ErroHttp(400, 'Ação inválida.');
    const r = await drive(cfg?.drive_url, cfg?.drive_token, acao, dados);
    return res.status(200).json(r);
  } catch (e) { return responderErro(res, e); }
}
