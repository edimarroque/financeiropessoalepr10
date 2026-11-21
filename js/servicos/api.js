// Chamadas às funções do servidor (/api na Vercel) com o login atual
import * as db from '../db.js';

export async function chamarApi(rota, corpo = {}) {
  const token = await db.tokenAtual();
  if (!token) throw new Error('Sua sessão expirou. Entre de novo.');
  let r;
  try {
    r = await fetch(`/api/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo) });
  } catch { throw new Error('Sem conexão com o servidor.'); }
  let j = {};
  try { j = await r.json(); } catch { /* resposta vazia */ }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status} no servidor.`);
  return j;
}

export function paraBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    fr.readAsDataURL(blob);
  });
}
