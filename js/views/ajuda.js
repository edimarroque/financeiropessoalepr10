// Tela: Como usar — guia simples, passo a passo
import { esc } from '../ui.js';
import { PASSOS_ANDROID, PASSOS_IPHONE, instalar, instalado } from '../servicos/instalar.js';

const PASSOS = [
  { icone: '⚙️', titulo: '1. Deixe os cadastros prontos', link: '#/cadastros', botao: 'Abrir Cadastros', itens: [
    'Contas: coloque o saldo que aparece hoje no app do banco e a data de hoje.',
    'Cartões: confira o dia de fechamento, o dia de vencimento e o limite.',
    'Categorias: use as que vieram da planilha ou crie novas. Em despesas, o “limite mensal” vira meta no Painel.',
    'Personalize: escolha ícone, cor e, se quiser, uma imagem/logo para cada conta e cartão.',
  ] },
  { icone: '➕', titulo: '2. Lance o dia a dia', link: '#/lancamentos', botao: 'Abrir Lançamentos', itens: [
    'No computador use “+ Lançar” no Painel ou “+ Novo” em Lançamentos; no celular, o botão + aparece no Painel, Lançamentos e Cartões.',
    'Escolha Despesa, Receita ou Transferência, digite o valor, a data e a descrição.',
    'Escolha a categoria e por onde pagou: conta (Pix, débito, boleto…) ou cartão.',
    'Compra parcelada no cartão: informe o valor TOTAL e o número de parcelas — o app divide e coloca cada parcela na fatura certa.',
    'Para corrigir ou excluir, toque no lançamento.',
    'Conta que se repete todo mês (aluguel, assinatura, salário)? Marque “🔁 Repetir todo mês”: o app cria os próximos meses como pendentes.',
    'Use tags (#viagem, #reforma) para juntar gastos de um mesmo assunto e filtrar depois.',
  ] },
  { icone: '📥', titulo: '3. Importe faturas e extratos', link: '#/importar', botao: 'Abrir Importar', itens: [
    'Fatura do cartão: envie o PDF, escolha o cartão e o vencimento. Use “Ler com IA” para mais precisão.',
    'Extrato da conta em PDF (Itaú): escolha a conta como destino e “Ler com IA”. Confira a linha de conferência dos saldos.',
    'Extrato da conta: envie o arquivo OFX do banco.',
    'Confira a prévia: marque/desmarque linhas e ajuste categorias. O que já foi importado não entra de novo.',
    'Errou? Use “Desfazer” na lista de importações.',
  ] },
  { icone: '🤖', titulo: '4. Use a IA, o Telegram e o Drive', link: '#/integracoes', botao: 'Abrir Integrações', itens: [
    'Assistente IA: “Gerar análise” mostra onde estão os maiores gastos, juros e o que cortar; em “Perguntar” você conversa sobre os seus números.',
    'Telegram: crie seu bot no @BotFather, cole o token em Integrações e toque em Iniciar. Depois é só escrever “mercado 87,50 débito” ou mandar a foto do cupom.',
    'Google Drive: siga os 4 passos em Integrações (copiar o script e colar no script.new). PDFs colocados em 00_Caixa_de_Entrada aparecem em Importar.',
    'Depois de importar, o arquivo vai sozinho para 01_Arquivo_por_Mes/AAAA/AAAA-MM — assim você sabe o que já foi usado.',
  ] },
  { icone: '💳', titulo: '5. Pague as faturas', link: '#/cartoes', botao: 'Abrir Cartões', itens: [
    'Em Cartões, escolha a fatura e toque em “Pagar fatura”.',
    'Informe a conta de onde saiu o dinheiro. Os itens ficam pagos e o saldo da conta é atualizado.',
  ] },
  { icone: '📊', titulo: '6. Acompanhe', link: '#/dashboards', botao: 'Abrir Dashboards', itens: [
    'Painel: resumo do mês, saldo das contas, calendário de gastos e faturas.',
    'Dashboards: comparativos, categorias mês a mês, maiores gastos e formas de pagamento.',
    'Escolha o mês e o ano no topo das telas (ou “Ano todo”).',
    'Toque (ou passe o mouse) numa barra ou fatia do gráfico para ver o valor.',
    'No Painel, “⚖️ Conferir” compara o saldo do app com o do banco e lança o ajuste se precisar.',
    'Defina limites nas categorias: o app avisa ao chegar em 80% e 100%.',
  ] },
];

const DICAS = [
  ['Caixa de entrada × Arquivo', 'No Drive, 00_Caixa_de_Entrada guarda o que ainda não foi lançado; 01_Arquivo_por_Mes guarda o que já foi usado, separado por ano e mês (Faturas, Extratos, Recibos e Relatórios).'],
  ['Comandos do bot', '/resumo, /saldo, /faturas, /contas, /relatorio e /ajuda. Pergunta termina com “?”.'],
  ['Regras de categoria', 'Em Cadastros → Regras: “se a descrição contém PEDAGIO, use Pedágio”. O app também sugere regras que aprendeu com seus lançamentos.'],
  ['Remover importação', 'Em Importar → Importações feitas → Remover. Apaga todos os lançamentos daquela importação para você importar de novo.'],
  ['Situação', 'Pago/Recebido = já saiu ou entrou na conta. Pendente = ainda vai acontecer. Toque na etiqueta para trocar.'],
  ['Mês do lançamento', 'Conta pela data de pagamento. No cartão é o vencimento da fatura.'],
  ['Transferência', 'Use para mover dinheiro entre suas contas — não conta como receita nem despesa.'],
  ['Pagamento de fatura', 'Também não conta como despesa: as compras do cartão já foram contadas.'],
];

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Como usar</h1><p class="dica">Guia rápido em 6 passos</p></div><a class="btn" href="#/novidades">✨ Novidades</a></div>
    <div class="guia">
      ${PASSOS.map((p) => `
        <section class="cartao-bloco passo">
          <div class="passo-topo"><span class="passo-icone">${p.icone}</span><h2>${esc(p.titulo)}</h2></div>
          <ol class="lista-simples">${p.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>
          <a class="btn btn-peq" href="${p.link}">${esc(p.botao)} →</a>
        </section>`).join('')}
    </div>
    <section class="cartao-bloco" id="instalar">
      <div class="cab-lista"><h2>📲 Instalar no celular (Android e iPhone)</h2>${instalado() ? '<span class="pill">✅ instalado</span>' : '<button class="btn btn-primario btn-peq" data-instalar>Instalar agora</button>'}</div>
      <div class="termos">
        <div><b>🤖 Android</b><ol class="lista-simples">${PASSOS_ANDROID.map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
        <div><b>📱 iPhone</b><ol class="lista-simples">${PASSOS_IPHONE.map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
      </div>
    </section>
    <section class="cartao-bloco">
      <h2>Entendendo os termos</h2>
      <div class="termos">${DICAS.map(([t, d]) => `<div><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join('')}</div>
    </section>`;
  el.querySelector('[data-instalar]')?.addEventListener('click', instalar);
}
