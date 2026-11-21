// Preferências do usuário: tema (claro/escuro/automático), cor de destaque e tempo da sessão.
// Ficam no perfil (banco, valem em todos os aparelhos) e numa cópia local (para abrir já com o tema certo).
import { S } from './state.js';
import * as db from './db.js';

export const CORES_TEMA = {
  indigo:  { nome: 'Índigo',   claro: ['#4f46e5', '#06b6d4', '#eef0ff'], escuro: ['#818cf8', '#22d3ee', '#1b2340'] },
  azul:    { nome: 'Azul',     claro: ['#2563eb', '#0ea5e9', '#e8f0ff'], escuro: ['#60a5fa', '#38bdf8', '#14233d'] },
  verde:   { nome: 'Esmeralda', claro: ['#059669', '#14b8a6', '#e6f7f1'], escuro: ['#34d399', '#2dd4bf', '#0f2a22'] },
  roxo:    { nome: 'Roxo',     claro: ['#7c3aed', '#db2777', '#f3ecff'], escuro: ['#a78bfa', '#f472b6', '#24183d'] },
  laranja: { nome: 'Laranja',  claro: ['#ea580c', '#f59e0b', '#fff1e7'], escuro: ['#fb923c', '#fbbf24', '#33200f'] },
  rosa:    { nome: 'Rosa',     claro: ['#e11d48', '#f97316', '#ffe9ee'], escuro: ['#fb7185', '#fdba74', '#3a1820'] },
  grafite: { nome: 'Grafite',  claro: ['#334155', '#0ea5e9', '#eef2f7'], escuro: ['#cbd5e1', '#38bdf8', '#1e293b'] },
};

export const PADRAO = { tema: 'auto', cor: 'indigo', sessaoMin: 15 };

let atual = { ...PADRAO };
try { atual = { ...PADRAO, ...JSON.parse(localStorage.getItem('prefs') || '{}') }; } catch { /* sem armazenamento */ }

export const prefs = () => atual;

const midia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function temaEfetivo(p = atual) {
  if (p.tema === 'claro' || p.tema === 'escuro') return p.tema;
  return midia && midia.matches ? 'escuro' : 'claro';
}

export function aplicarTema(p = atual) {
  const raiz = document.documentElement;
  const tema = temaEfetivo(p);
  raiz.dataset.tema = tema;
  const c = (CORES_TEMA[p.cor] || CORES_TEMA.indigo)[tema];
  raiz.style.setProperty('--acento', c[0]);
  raiz.style.setProperty('--acento-2', c[1]);
  raiz.style.setProperty('--acento-claro', c[2]);
  raiz.style.setProperty('--gradiente', `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 100%)`);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = tema === 'escuro' ? '#070b14' : '#0b1220';
}

if (midia) midia.addEventListener?.('change', () => { if (atual.tema === 'auto') aplicarTema(); });

/** Chamado depois do login, quando o perfil já foi lido do banco */
export function carregarDoPerfil() {
  const p = S.perfil?.preferencias;
  if (p && typeof p === 'object') {
    atual = { ...PADRAO, ...p };
    try { localStorage.setItem('prefs', JSON.stringify(atual)); } catch { /* */ }
  }
  aplicarTema();
}

export async function salvarPrefs(patch) {
  atual = { ...atual, ...patch };
  try { localStorage.setItem('prefs', JSON.stringify(atual)); } catch { /* */ }
  aplicarTema();
  if (!S.user) return;
  if (S.perfil) {
    await db.atualizarOnde('perfis', 'user_id', S.user.id, { preferencias: atual, updated_at: new Date().toISOString() });
    S.perfil.preferencias = atual;
  } else {
    const [p] = await db.inserir('perfis', [{ nome: '', preferencias: atual }]);
    S.perfil = p;
  }
}

aplicarTema();
