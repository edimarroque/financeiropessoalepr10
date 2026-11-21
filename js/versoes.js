// Histórico de versões (aparece na tela Novidades). A mais nova fica no topo.
export const VERSOES = [
  {
    versao: '1.2.0', data: '2026-11-21', titulo: 'Dashboards, calendário e personalização',
    novidades: [
      '📊 Nova tela Dashboards: comparativo com o período anterior, despesas por grupo e categoria, painel anual (categorias × 12 meses com total, média e previsto), maiores gastos por estabelecimento, formas de pagamento, dia da semana e recebimentos.',
      '🗓️ Mini calendário com os gastos de cada dia — toque no dia para ver os lançamentos.',
      '📅 Seleção de mês e ano separadas, com opção “Ano todo”.',
      '🏦 Painel com saldo inicial, saldo final e diferença de cada conta no período, além de “A receber” e “A pagar”.',
      '🎨 Contas e cartões com ícone, cor e imagem/logo próprios; cartões aparecem como cartão de verdade, com os 4 últimos dígitos.',
      '🙂 Escolha de emojis por lista para categorias, contas e cartões.',
      '👤 Meu perfil: nome e foto (aparecem na barra lateral).',
      '🚪 Botão Sair na barra lateral.',
      '❓ Telas Novidades (esta) e Como usar.',
      '✨ Visual renovado, mais limpo e moderno, com tema claro/escuro automático.',
    ],
    correcoes: [
      'Histórico da planilha: vencimentos do dia 16 ajustados para o dia 15 (fatura não fica mais dividida em duas).',
      'Faturas de agosto e setembro marcadas como pagas, conforme os pagamentos registrados.',
      'Saldos iniciais da planilha (31/08 e 18/08) aplicados — saldos de setembro iguais aos da planilha.',
    ],
  },
  {
    versao: '1.1.0', data: '2026-11-21', titulo: 'Importação',
    novidades: [
      '📥 Tela Importar: fatura em PDF, extrato OFX e CSV, com prévia antes de gravar.',
      '🏷️ Sugestão de categoria pelo histórico; o que não for reconhecido fica “A classificar”.',
      '📅 Parcelas futuras criadas automaticamente (ex.: 6/10 cria 7/10 a 10/10).',
      '🔁 Bloqueio de duplicados e botão Desfazer para cada importação.',
      '📊 Migração do histórico da planilha (275 lançamentos, 62 datas corrigidas).',
    ],
    correcoes: [],
  },
  {
    versao: '1.0.0', data: '2026-11-20', titulo: 'Primeira versão',
    novidades: [
      '🔐 Login com e-mail e senha; cada usuário só vê os próprios dados.',
      '📋 Lançamentos de receitas, despesas, transferências e compras parceladas.',
      '💳 Cartões com fatura por ciclo de fechamento, limite usado e pagamento de fatura.',
      '📊 Painel do mês com distribuição 50/30/20 e evolução de 12 meses.',
      '⚙️ Cadastros de contas, cartões e categorias (carregados da planilha).',
      '📱 Instalável no celular como app; exportação para Excel (CSV) e backup.',
    ],
    correcoes: [],
  },
];

export const PROXIMAS = [
  '🎯 Metas financeiras (objetivo, prazo, valor mensal necessário e evolução).',
  '📈 Investimentos — renda fixa e renda variável.',
  '📄 Leitura ajustada para os PDFs reais das faturas do XP e do Itaú.',
];
