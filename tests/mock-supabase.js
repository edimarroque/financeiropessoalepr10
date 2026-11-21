// Supabase simulado em memória, só para testes locais
const tabelas = { contas: [], cartoes: [], categorias: [], lancamentos: [], lotes_importacao: [], perfis: [], sugestoes: [], recorrentes: [], regras_categoria: [] };
window.__db = tabelas;
let session = null;
try { session = JSON.parse(sessionStorage.getItem('mockSessao') || 'null'); } catch { /* */ }
const ouvintes = [];
const uid = 'user-1';

class Q {
  constructor(t) { this.t = t; this.op = 'select'; this.filtros = []; this.ord = null; this.rng = null; }
  select() { if (this.op === 'insert') this.retornar = true; else this.op = 'select'; return this; }
  order(c, { ascending }) { this.ord = [c, ascending]; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  insert(rows) { this.op = 'insert'; this.rows = rows; return this; }
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
    if (this.op === 'update') { T.filter(passa).forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null }; }
    if (this.op === 'delete') { for (let i = T.length - 1; i >= 0; i--) if (passa(T[i])) T.splice(i, 1); return { data: null, error: null }; }
  }
}

export function createClient() {
  return {
    from: (t) => new Q(t),
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
      signOut: async () => { session = null; sessionStorage.removeItem('mockSessao'); ouvintes.forEach((cb) => cb('SIGNED_OUT', null)); },
    },
  };
}
