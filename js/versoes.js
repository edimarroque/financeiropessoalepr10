// Histórico de versões (aparece na tela Novidades). A mais nova fica no topo.
export const VERSOES = [
  {
    versao: '1.6.0', data: '2026-11-21', titulo: 'IA, Telegram e Google Drive',
    novidades: [
      '🤖 Assistente IA (Gemini): botão “Gerar análise” com nota de saúde financeira, maiores gastos, juros/IOF/tarifas, desperdícios, economia possível e ações para o mês. Só roda quando você pede.',
      '💬 Chat com IA sobre os seus dados: pergunte “onde estou gastando mais?”, “que assinaturas cortar?”… (vê os totais de 6 meses e os lançamentos de 90 dias).',
      '✈️ Bot do Telegram (o seu bot): lance gastos escrevendo (“uber 23,90 cartão xp”, “notebook 3000 em 10x”), mande a foto do cupom, envie PDFs de fatura/extrato e faça perguntas. Botão “Desfazer” em cada lançamento.',
      '📥 Caixa de entrada em Importar: PDFs da pasta 00_Caixa_de_Entrada do Drive e os enviados pelo Telegram. Depois de importar, o arquivo vai sozinho para 01_Arquivo_por_Mes/AAAA/AAAA-MM (já usado), com nome padrão.',
      '📁 Google Drive organizado por ano/mês: faturas, extratos, recibos (foto original do comprovante) e relatórios; backups em 02_Backups.',
      '📄 Relatório mensal: ver, imprimir/salvar PDF, salvar no Drive e enviar no Telegram. Todo dia 1º chega sozinho.',
      '⏰ Avisos de vencimento no Telegram (contas, boletos e faturas), com antecedência configurável.',
      '💾 Backup automático semanal no Google Drive (JSON + CSV) e botão “Fazer backup agora”.',
      '🔌 Nova tela Integrações (Mais e ajustes) com o passo a passo do Telegram e do Drive.',
    ],
    correcoes: ['Valores digitados como “12.000” agora são entendidos como doze mil.', 'Formulários: o cursor não pula mais para o primeiro campo enquanto você digita.'],
  },
  {
    versao: '1.5.0', data: '2026-11-21', titulo: 'Planejamento e patrimônio',
    novidades: [
      '💎 Nova tela Patrimônio: patrimônio líquido (contas + investimentos + a receber − dívidas) com gráfico de evolução mês a mês, registrado automaticamente.',
      '🎯 Metas financeiras: objetivo, valor, prazo, quanto guardar por mês, anel de progresso e evolução. “+ Guardar” pode lançar a saída da conta junto.',
      '📈 Investimentos de renda fixa e variável (também cripto e previdência): valor aplicado × atual, rentabilidade, aportes/resgates e histórico.',
      '🤝 Dívidas e empréstimos (eu devo / me devem): saldo, parcelas, juros, simulação de quando quita e registro de pagamentos.',
      '🔮 Projeção de saldo para 3, 6 ou 12 meses com pendências, faturas, parcelas futuras, recorrentes e dívidas — avisa se for ficar negativo.',
      '💵 Contas em dólar (ex.: Nomad): saldo em US$ e convertido para reais pela cotação do dia; ao lançar, informe o valor em US$ e a cotação.',
      '🧾 Despesas dedutíveis do IR: marque no lançamento ou na categoria; relatório anual em Dashboards → Imposto de Renda (imprimível em PDF).',
      '📎 Comprovante no lançamento: foto reduzida automaticamente (ou PDF até 1 MB), guardada com segurança; miniatura no lançamento.',
      '🔐 Verificação em 2 etapas com app autenticador (Mais e ajustes → Segurança). Quando ativada, os dados só abrem depois do código.',
    ],
    correcoes: ['Backup completo (JSON) agora inclui recorrentes, regras, metas, investimentos, dívidas e patrimônio.'],
  },
  {
    versao: '1.4.0', data: '2026-11-21', titulo: 'Usabilidade e controle',
    novidades: [
      '🎨 Temas: claro, escuro ou automático e 7 cores de destaque (Mais e ajustes → Aparência). Vale em todos os aparelhos.',
      '➕ Botão “+” flutuante só onde faz sentido (Painel, Lançamentos e Cartões, no celular); no computador, use “+ Lançar”/“+ Novo”.',
      '👆 Gráficos: toque ou passe o mouse na barra/fatia para ver o valor.',
      '📲 Botão “Instalar app” e passo a passo para Android e iPhone (Como usar → Instalar no celular).',
      '🗑️ Remover importação que deu errado: em Importar → Importações feitas (com “Ver” para conferir antes), ou direto num lançamento importado.',
      '🔐 Sessão encerra sozinha após 15 min sem uso (configurável); 1 min antes aparece aviso para continuar. Enquanto você usa, nunca fecha.',
      '🔁 Lançamentos recorrentes (aluguel, assinaturas, salário, dízimo): gerados como pendentes até o mês que vem. Marque “Repetir todo mês” ao lançar ou use Cadastros → Recorrentes.',
      '🚦 Orçamento por categoria no Painel, com alerta ao chegar em 80% e 100% do limite (também avisa ao lançar).',
      '⚖️ Conferir saldo com o banco: informe o saldo real, veja a diferença e lance o ajuste.',
      '🪄 Regras automáticas de categoria (ex.: PEDAGIO → Pedágio) e o app aprende com seus lançamentos, sugerindo regras novas.',
      '🏷️ Tags livres nos lançamentos (#viagem, #reforma), com filtro.',
      '🔎 Dashboards → Gastos: assinaturas e gastos repetidos, com alerta de cobrança em dobro no mesmo mês.',
    ],
    correcoes: ['Categoria sugerida automaticamente também no lançamento manual, ao digitar a descrição.'],
  },
  {
    versao: '1.3.0', data: '2026-11-21', titulo: 'Leitura de PDF com IA',
    novidades: [
      '🤖 Importar → “Ler com IA (Gemini)”: lê a fatura do cartão XP e os extratos do Itaú (salário e pessoal) direto do PDF, no lugar dos Apps Scripts de conversão.',
      '🏦 Extrato da conta em PDF: escolha a conta como destino; salário e PIX recebidos entram como receita e o restante como despesa.',
      '✅ Conferência automática: total da fatura do PDF × total lido; no extrato, saldo final − saldo inicial × entradas − saídas.',
      '📅 Aviso quando o vencimento lido no PDF é diferente do escolhido.',
      '🔐 PDF com senha também é lido pela IA (as páginas são abertas aqui com a senha e enviadas como imagem).',
      '🔁 Lançamento que já veio por outra importação (ex.: OFX e PDF do mesmo extrato) aparece como “parecido” e fica desmarcado.',
    ],
    correcoes: [],
  },
  {
    versao: '1.2.1', data: '2026-11-21', titulo: 'Sugestões de melhorias',
    novidades: [
      '💡 Campo “Sugestões de melhorias” no topo desta tela: anote correções e ideias, marque como feitas ou apague.',
    ],
    correcoes: [],
  },
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
  '💡 Continue anotando ideias no campo “Sugestões de melhorias” acima — cada item vira uma versão nova.',
];
