// Supabase simulado em memória, só para testes locais
const tabelas = { contas: [], cartoes: [], categorias: [], lancamentos: [], lotes_importacao: [], perfis: [], sugestoes: [], recorrentes: [], regras_categoria: [],
  metas: [], metas_movimentos: [], investimentos: [], investimentos_historico: [], dividas: [], dividas_pagamentos: [], patrimonio_mensal: [] };
const arquivos = {}; window.__arquivos = arquivos;
let fatores = []; let nivel = 'aal1'; window.__mfa = () => ({ fatores, nivel });
window.__db = tabelas;
let session = null;
try { session = JSON.parse(sessionStorage.getItem('mockSessao') || 'null'); } catch { /* */ }
const ouvintes = [];
const uid = 'user-1';

class Q {
  constructor(t) { this.t = t; this.op = 'select'; this.filtros = []; this.ord = null; this.rng = null; }
  select() { if (this.op === 'insert' || this.op === 'upsert') this.retornar = true; else this.op = 'select'; return this; }
  order(c, { ascending }) { this.ord = [c, ascending]; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  insert(rows) { this.op = 'insert'; this.rows = rows; return this; }
  upsert(rows, { onConflict }) { this.op = 'upsert'; this.rows = rows; this.conf = onConflict.split(',').filter((c) => c !== 'user_id'); return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
  in(c, vs) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  exec() {
    const T = tabelas[this.t];
    const passa = (r) => this.filtros.every((f) => f(r));
    if (this.op === 'select') {
      let out = T.slice();
      if (this.ord) { const [c, a] = this.ord; out.sort((x, y) => (String(x[c]) < String(y[c]) ? -1 : String(x[c]) > String(y[c]) ? 1 : 0) * (a ? 1 : -1)); }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      return { data: JSON.parse(JSON.stringify(out)), error: null };
    }
    if (this.op === 'insert') {
      const novos = this.rows.map((r) => ({
        id: crypto.randomUUID(), user_id: uid, created_at: new Date().toISOString(), ativo: true,
        valor_mensal: 0, emoji: '', saldo_inicial: 0, limite: 0, ...r,
      }));
      for (const n of novos) {
        if (this.t === 'lancamentos' && n.chave_dedup && T.some((x) => x.chave_dedup === n.chave_dedup))
          return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        if (this.t === 'lancamentos' && !(n.valor > 0)) return { data: null, error: { message: 'check constraint valor' } };
      }
      T.push(...novos);
      return { data: JSON.parse(JSON.stringify(novos)), error: null };
    }
    if (this.op === 'upsert') {
      const out = [];
      for (const r of this.rows) {
        const ex = T.find((x) => this.conf.every((c) => x[c] === r[c]));
        if (ex) { Object.assign(ex, r); out.push(ex); } else { const n = { id: crypto.randomUUID(), user_id: uid, created_at: new Date().toISOString(), ...r }; T.push(n); out.push(n); }
      }
      return { data: JSON.parse(JSON.stringify(out)), error: null };
    }
    if (this.op === 'update') { T.filter(passa).forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null }; }
    if (this.op === 'delete') { for (let i = T.length - 1; i >= 0; i--) if (passa(T[i])) T.splice(i, 1); return { data: null, error: null }; }
  }
}

export function createClient() {
  return {
    from: (t) => new Q(t),
    storage: { from: () => ({
      upload: async (caminho, blob) => { arquivos[caminho] = blob; return { data: { path: caminho }, error: null }; },
      createSignedUrl: async (caminho) => arquivos[caminho] ? { data: { signedUrl: URL.createObjectURL(arquivos[caminho]) }, error: null } : { data: null, error: { message: 'Object not found' } },
      remove: async (l) => { l.forEach((c) => delete arquivos[c]); return { data: [], error: null }; },
    }) },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { ouvintes.push(cb); },
      signInWithPassword: async ({ email, password }) => {
        if (password !== 'senha123') return { data: null, error: { message: 'Invalid login credentials' } };
        session = { user: { id: uid, email }, access_token: 'tok-teste' };
        sessionStorage.setItem('mockSessao', JSON.stringify(session));
        setTimeout(() => ouvintes.forEach((cb) => cb('SIGNED_IN', session)));
        return { data: { session }, error: null };
      },
      signUp: async () => ({ data: { session: null, user: {} }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: nivel, nextLevel: fatores.some((f) => f.status === 'verified') ? 'aal2' : nivel }, error: null }),
        listFactors: async () => ({ data: { totp: fatores.filter((f) => f.status === 'verified'), all: fatores }, error: null }),
        enroll: async () => { const f = { id: 'fator-' + (fatores.length + 1), status: 'unverified' }; fatores.push(f);
          return { data: { id: f.id, totp: { qr_code: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }, error: null }; },
        challengeAndVerify: async ({ factorId, code }) => { if (code !== '123456') return { data: null, error: { message: 'Invalid TOTP code entered' } };
          const f = fatores.find((x) => x.id === factorId); if (f) f.status = 'verified'; nivel = 'aal2'; return { data: {}, error: null }; },
        unenroll: async ({ factorId }) => { fatores = fatores.filter((f) => f.id !== factorId); if (!fatores.some((f) => f.status === 'verified')) nivel = 'aal1'; return { data: {}, error: null }; },
      },
      signOut: async () => { session = null; nivel = 'aal1'; sessionStorage.removeItem('mockSessao'); ouvintes.forEach((cb) => cb('SIGNED_OUT', null)); },
    },
  };
}
