// Dados carregados em memória (uso pessoal: milhares de linhas cabem tranquilamente)
import * as db from './db.js';
import { hoje } from './calc.js';

export const S = {
  user: null,
  contas: [],
  cartoes: [],
  categorias: [],
  lancs: [],
  lotes: [],
  recorrentes: [],
  regras: [],
  integracao: null,
  metas: [], metasMov: [], investimentos: [], invHist: [], dividas: [], dividasPag: [], patrimonio: [],
  ano: Number(hoje().slice(0, 4)),   // período selecionado (compartilhado entre telas)
  mes: Number(hoje().slice(5, 7)),   // 1..12, ou 0 = ano todo
  perfil: null,
};

export async function recarregarCadastros() {
  const [contas, cartoes, categorias] = await Promise.all([
    db.listar('contas', 'nome'),
    db.listar('cartoes', 'nome'),
    db.listar('categorias', 'nome'),
  ]);
  Object.assign(S, { contas, cartoes, categorias });
}

export async function recarregarLancamentos() {
  S.lancs = await db.listar('lancamentos', 'data_movimento', false);
}

export async function recarregarLotes() {
  S.lotes = await db.listar('lotes_importacao', 'created_at', false);
}

export async function recarregarPerfil() {
  try {
    const p = await db.listar('perfis', 'updated_at');
    S.perfil = p[0] || null;
  } catch { S.perfil = null; }
}

// tabelas novas: se ainda não existirem no banco, o app segue funcionando
async function listarOpcional(t, ordem) { try { return await db.listar(t, ordem); } catch (e) { console.warn(t, e.message); return []; } }

export async function recarregarExtras() {
  const [recorrentes, regras, metas, metasMov, investimentos, invHist, dividas, dividasPag, patrimonio] = await Promise.all([
    listarOpcional('recorrentes', 'descricao'), listarOpcional('regras_categoria', 'contem'),
    listarOpcional('metas', 'created_at'), listarOpcional('metas_movimentos', 'data'),
    listarOpcional('investimentos', 'nome'), listarOpcional('investimentos_historico', 'data'),
    listarOpcional('dividas', 'created_at'), listarOpcional('dividas_pagamentos', 'data'), listarOpcional('patrimonio_mensal', 'mes'),
  ]);
  Object.assign(S, { recorrentes, regras, metas, metasMov, investimentos, invHist, dividas, dividasPag, patrimonio });
  await recarregarIntegracao();
}

export async function recarregarIntegracao() {
  const [i] = await listarOpcional('integracoes', 'updated_at');
  S.integracao = i || null;
}

export async function recarregarTudo() {
  await Promise.all([recarregarCadastros(), recarregarLancamentos(), recarregarLotes(), recarregarPerfil(), recarregarExtras()]);
}

export const nomeUsuario = () => (S.perfil && S.perfil.nome) || (S.user?.email || '').split('@')[0];

export const contaPorId = (id) => S.contas.find((c) => c.id === id);
export const cartaoPorId = (id) => S.cartoes.find((c) => c.id === id);
export const categoriaPorId = (id) => S.categorias.find((c) => c.id === id);
export const nomeCategoria = (id) => { const c = categoriaPorId(id); return c ? `${c.emoji ? c.emoji + ' ' : ''}${c.nome}` : 'Sem categoria'; };
