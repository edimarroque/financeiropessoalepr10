// Tela: Como usar — guia simples, passo a passo
import { esc } from '../ui.js';

const PASSOS = [
  { icone: '⚙️', titulo: '1. Deixe os cadastros prontos', link: '#/cadastros', botao: 'Abrir Cadastros', itens: [
    'Contas: coloque o saldo que aparece hoje no app do banco e a data de hoje.',
    'Cartões: confira o dia de fechamento, o dia de vencimento e o limite.',
    'Categorias: use as que vieram da planilha ou crie novas. Em despesas, o “limite mensal” vira meta no Painel.',
    'Personalize: escolha ícone, cor e, se quiser, uma imagem/logo para cada conta e cartão.',
  ] },
  { icone: '➕', titulo: '2. Lance o dia a dia', link: '#/lancamentos', botao: 'Abrir Lançamentos', itens: [
    'Toque no botão + (canto inferior direito) em qualquer tela.',
    'Escolha Despesa, Receita ou Transferência, digite o valor, a data e a descrição.',
    'Escolha a categoria e por onde pagou: conta (Pix, débito, boleto…) ou cartão.',
    'Compra parcelada no cartão: informe o valor TOTAL e o número de parcelas — o app divide e coloca cada parcela na fatura certa.',
    'Para corrigir ou excluir, toque no lançamento.',
  ] },
  { icone: '📥', titulo: '3. Importe faturas e extratos', link: '#/importar', botao: 'Abrir Importar', itens: [
    'Fatura do cartão: envie o PDF, escolha o cartão e o vencimento.',
    'Extrato da conta: envie o arquivo OFX do banco.',
    'Confira a prévia: marque/desmarque linhas e ajuste categorias. O que já foi importado não entra de novo.',
    'Errou? Use “Desfazer” na lista de importações.',
  ] },
  { icone: '💳', titulo: '4. Pague as faturas', link: '#/cartoes', botao: 'Abrir Cartões', itens: [
    'Em Cartões, escolha a fatura e toque em “Pagar fatura”.',
    'Informe a conta de onde saiu o dinheiro. Os itens ficam pagos e o saldo da conta é atualizado.',
  ] },
  { icone: '📊', titulo: '5. Acompanhe', link: '#/dashboards', botao: 'Abrir Dashboards', itens: [
    'Painel: resumo do mês, saldo das contas, calendário de gastos e faturas.',
    'Dashboards: comparativos, categorias mês a mês, maiores gastos e formas de pagamento.',
    'Escolha o mês e o ano no topo das telas (ou “Ano todo”).',
  ] },
];

const DICAS = [
  ['Situação', 'Pago/Recebido = já saiu ou entrou na conta. Pendente = ainda vai acontecer. Toque na etiqueta para trocar.'],
  ['Mês do lançamento', 'Conta pela data de pagamento. No cartão é o vencimento da fatura.'],
  ['Transferência', 'Use para mover dinheiro entre suas contas — não conta como receita nem despesa.'],
  ['Pagamento de fatura', 'Também não conta como despesa: as compras do cartão já foram contadas.'],
];

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Como usar</h1><p class="dica">Guia rápido em 5 passos</p></div><a class="btn" href="#/novidades">✨ Novidades</a></div>
    <div class="guia">
      ${PASSOS.map((p) => `
        <section class="cartao-bloco passo">
          <div class="passo-topo"><span class="passo-icone">${p.icone}</span><h2>${esc(p.titulo)}</h2></div>
          <ol class="lista-simples">${p.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>
          <a class="btn btn-peq" href="${p.link}">${esc(p.botao)} →</a>
        </section>`).join('')}
    </div>
    <section class="cartao-bloco">
      <h2>Entendendo os termos</h2>
      <div class="termos">${DICAS.map(([t, d]) => `<div><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join('')}</div>
    </section>`;
}
