// Cadastros trazidos da "Super Planilha Tríade Financeira 3.0" (nomes já corrigidos)
import * as db from './db.js';
import { hoje } from './calc.js';

export const CONTAS = ['conta itau salario', 'conta itau pessoal', 'conta Ticket Alimentação', 'Dinheiro'];

export const CARTOES = [
  { nome: 'Cartão XP', dia_fechamento: 7, dia_vencimento: 15, limite: 39265.86 },
  { nome: 'Cartão Itau', dia_fechamento: 5, dia_vencimento: 15, limite: 12000 },
  { nome: 'Cartão Alimentação', dia_fechamento: 1, dia_vencimento: 30, limite: 1550 },
];

export const DESPESAS = [
  ['🎯', 'Metas Financeiras', 'Metas / Investimentos'],
  ['💰', 'Investimentos', 'Metas / Investimentos'],
  ['🛒', 'Mercado', 'Despesas Essenciais'],
  ['🍽️', 'Delivery / Restaurantes', 'Despesas Não Essenciais'],
  ['🏠', 'Moradia', 'Despesas Essenciais'],
  ['💻', 'Trabalho', 'Despesas Essenciais'],
  ['📕', 'Educação', 'Despesas Essenciais'],
  ['🩺', 'Saúde', 'Despesas Essenciais'],
  ['🏺', 'Utilidades domésticas', 'Despesas Não Essenciais'],
  ['📺', 'Assinaturas', 'Despesas Não Essenciais'],
  ['👚', 'Vestuários', 'Despesas Não Essenciais'],
  ['💅', 'Cuidados pessoais', 'Despesas Não Essenciais'],
  ['🎁', 'Doações / Presentes', 'Despesas Não Essenciais'],
  ['🏖️', 'Lazer', 'Despesas Não Essenciais'],
  ['🖥️', 'Eletrônicos', 'Despesas Não Essenciais'],
  ['🐈', 'Pets', 'Despesas Essenciais'],
  ['🧾', 'Tributos', 'Despesas Essenciais'],
  ['👩‍👦', 'Familia', 'Despesas Essenciais'],
  ['💸', 'Juros', 'Despesas Essenciais'],
  ['🛃', 'Pedagio', 'Despesas Essenciais'],
  ['🤔', 'Diversos', 'Despesas Não Essenciais'],
  ['⛪', 'Dizimo', 'Despesas Essenciais'],
  ['🥧', 'Padaria', 'Despesas Essenciais'],
  ['🚙', 'Carros', 'Despesas Essenciais'],
  ['🚗', 'Transporte', 'Despesas Essenciais'],
];

export const RECEITAS = [
  ['💼', 'Salário Mensal Stefanini', 'Renda Ativa'],
  ['🎄', '13º salário', 'Renda Ativa'],
  ['🌴', 'Remuneração de Férias', 'Renda Ativa'],
  ['🏢', 'Pró-labore', 'Renda Ativa'],
  ['📈', 'Distribuição de lucros', 'Renda Ativa'],
  ['🛠️', 'Prestação de serviços', 'Renda Ativa'],
  ['🏅', 'Bonificações', 'Renda Ativa'],
  ['🏷️', 'Vendas Diversas', 'Renda Ativa'],
  ['🏘️', 'Aluguéis de Imóveis', 'Renda Passiva'],
  ['💲', 'Rendimento de Investimentos', 'Renda Passiva'],
  ['🤝', 'Auxílio de Familiares', 'Renda Passiva'],
  ['💵', 'Recebimento de Empréstimos', 'Renda Passiva'],
  ['👨‍👩‍👦', 'Transferencia Familiares', 'Renda Passiva'],
  ['↩️', 'Estornos', 'Renda Passiva'],
];

/** Insere só o que ainda não existe (pode rodar mais de uma vez) */
export async function carregarCadastrosPadrao(S) {
  const nomesContas = new Set(S.contas.map((c) => c.nome.toLowerCase()));
  const contas = CONTAS.filter((n) => !nomesContas.has(n.toLowerCase()))
    .map((nome) => ({ nome, saldo_inicial: 0, data_saldo: hoje() }));
  const novasContas = contas.length ? await db.inserir('contas', contas) : [];
  const todasContas = [...S.contas, ...novasContas];
  const contaSalario = todasContas.find((c) => c.nome === 'conta itau salario');
  const contaTicket = todasContas.find((c) => c.nome === 'conta Ticket Alimentação');

  const nomesCartoes = new Set(S.cartoes.map((c) => c.nome.toLowerCase()));
  const cartoes = CARTOES.filter((c) => !nomesCartoes.has(c.nome.toLowerCase())).map((c) => ({
    ...c,
    conta_pagamento_id: (c.nome === 'Cartão Alimentação' ? contaTicket : contaSalario)?.id || null,
  }));
  if (cartoes.length) await db.inserir('cartoes', cartoes);

  const chave = (tipo, nome) => `${tipo}|${nome.toLowerCase()}`;
  const existentes = new Set(S.categorias.map((c) => chave(c.tipo, c.nome)));
  const cats = [
    ...DESPESAS.map(([emoji, nome, grupo]) => ({ emoji, nome, grupo, tipo: 'despesa' })),
    ...RECEITAS.map(([emoji, nome, grupo]) => ({ emoji, nome, grupo, tipo: 'receita' })),
  ].filter((c) => !existentes.has(chave(c.tipo, c.nome)));
  if (cats.length) await db.inserir('categorias', cats);

  return { contas: contas.length, cartoes: cartoes.length, categorias: cats.length };
}
