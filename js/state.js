// Dados carregados em memória (uso pessoal: milhares de linhas cabem tranquilamente)
import * as db from './db.js';
import { hoje } from './calc.js';

export const S = {
  user: null,
  contas: [],
  cartoes: [],
  categorias: [],
  lancs: [],
  mesRef: hoje().slice(0, 7), // mês selecionado no app (compartilhado entre telas)
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

export async function recarregarTudo() {
  await Promise.all([recarregarCadastros(), recarregarLancamentos()]);
}

export const contaPorId = (id) => S.contas.find((c) => c.id === id);
export const cartaoPorId = (id) => S.cartoes.find((c) => c.id === id);
export const categoriaPorId = (id) => S.categorias.find((c) => c.id === id);
export const nomeCategoria = (id) => { const c = categoriaPorId(id); return c ? `${c.emoji ? c.emoji + ' ' : ''}${c.nome}` : 'Sem categoria'; };
