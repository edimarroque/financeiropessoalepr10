// Acesso ao Supabase (banco + login)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurado = !SUPABASE_URL.startsWith('COLE_') && !SUPABASE_ANON_KEY.startsWith('COLE_');

export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function traduzErro(error) {
  const m = (error && error.message) || String(error);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail antes de entrar (veja sua caixa de entrada).';
  if (/User already registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (/Signups not allowed/i.test(m)) return 'Novos cadastros estão desativados.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/duplicate key/i.test(m)) return 'Já existe um registro com esse nome.';
  if (/violates foreign key/i.test(m)) return 'Este item está em uso e não pode ser removido.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/Invalid TOTP|invalid.*code|otp/i.test(m)) return 'Código inválido ou expirado. Confira o horário do celular e tente de novo.';
  return m;
}

function ok({ data, error }) {
  if (error) throw new Error(traduzErro(error));
  return data;
}

// ---------------- Login ----------------
export async function sessaoAtual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export function aoMudarLogin(cb) { sb.auth.onAuthStateChange((ev, session) => cb(session, ev)); }
export async function entrar(email, senha) { return ok(await sb.auth.signInWithPassword({ email, password: senha })); }
export async function cadastrar(email, senha) {
  return ok(await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } }));
}
export async function sair() { await sb.auth.signOut(); }
export async function recuperarSenha(email) { return ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin })); }
export async function trocarSenha(senha) { return ok(await sb.auth.updateUser({ password: senha })); }

// ---------------- Dados ----------------
// Busca tudo, de 1000 em 1000 (limite do Supabase por consulta)
export async function listar(tabela, ordem = 'created_at', asc = true) {
  const passo = 1000;
  let de = 0;
  const todos = [];
  for (;;) {
    const lote = ok(await sb.from(tabela).select('*').order(ordem, { ascending: asc }).range(de, de + passo - 1));
    todos.push(...lote);
    if (lote.length < passo) break;
    de += passo;
  }
  return todos;
}

export async function inserir(tabela, linhas) {
  const arr = Array.isArray(linhas) ? linhas : [linhas];
  const out = [];
  for (let i = 0; i < arr.length; i += 500) {
    out.push(...ok(await sb.from(tabela).insert(arr.slice(i, i + 500)).select()));
  }
  return out;
}

export async function atualizar(tabela, id, patch) {
  return ok(await sb.from(tabela).update(patch).eq('id', id));
}

export async function atualizarVarios(tabela, ids, patch) {
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 200) {
    ok(await sb.from(tabela).update(patch).in('id', ids.slice(i, i + 200)));
  }
}

export async function excluir(tabela, id) {
  return ok(await sb.from(tabela).delete().eq('id', id));
}

export async function excluirOnde(tabela, coluna, valor) {
  return ok(await sb.from(tabela).delete().eq(coluna, valor));
}

export async function excluirVarios(tabela, ids) {
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 200) {
    ok(await sb.from(tabela).delete().in('id', ids.slice(i, i + 200)));
  }
}

export async function atualizarOnde(tabela, coluna, valor, patch) {
  return ok(await sb.from(tabela).update(patch).eq(coluna, valor));
}

// ---------------- Comprovantes (Supabase Storage, bucket privado) ----------------
export async function enviarComprovante(caminho, blob) {
  return ok(await sb.storage.from('comprovantes').upload(caminho, blob, { upsert: true, contentType: blob.type }));
}
export async function linkComprovante(caminho, segundos = 600) {
  const { data, error } = await sb.storage.from('comprovantes').createSignedUrl(caminho, segundos);
  if (error) throw new Error(traduzErro(error));
  return data.signedUrl;
}
export async function apagarComprovante(caminho) {
  return ok(await sb.storage.from('comprovantes').remove([caminho]));
}

// ---------------- Verificação em 2 etapas (app autenticador / TOTP) ----------------
export async function nivelMFA() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(traduzErro(error));
  return data; // { currentLevel, nextLevel }
}
export async function fatoresMFA() {
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw new Error(traduzErro(error));
  return (data.totp || []);
}
export async function cadastrarMFA() {
  // remove tentativas antigas não confirmadas
  const { data: lista } = await sb.auth.mfa.listFactors();
  for (const f of (lista?.all || []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  return ok(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Financeiro ' + new Date().toISOString().slice(0, 10) }));
}
export async function verificarMFA(factorId, codigo) {
  return ok(await sb.auth.mfa.challengeAndVerify({ factorId, code: String(codigo).replace(/\D/g, '') }));
}
export async function removerMFA(factorId) {
  return ok(await sb.auth.mfa.unenroll({ factorId }));
}
export async function tokenAtual() {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token || '';
}

export async function salvarVarios(tabela, linhas, conflito) {
  if (!linhas.length) return [];
  return ok(await sb.from(tabela).upsert(linhas, { onConflict: conflito }).select());
}
