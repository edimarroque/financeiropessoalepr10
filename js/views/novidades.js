// Tela: Novidades (o que mudou em cada versão) e perguntas frequentes
import { VERSOES, PROXIMAS } from '../versoes.js';
import { VERSAO } from '../config.js';
import { fmtData } from '../calc.js';
import { esc } from '../ui.js';

const FAQ = [
  ['Meus dados ficam seguros?', 'Sim. Eles ficam no seu banco do Supabase e só são vistos depois do login. Cada usuário só enxerga os próprios dados (regra aplicada no próprio banco) e novos cadastros estão desligados.'],
  ['Por que um gasto do cartão aparece em outro mês?', 'O mês de um lançamento é o da data de pagamento. No cartão, é o vencimento da fatura: uma compra feita no dia 20 entra na fatura que vence no mês seguinte, igual à planilha.'],
  ['Como marcar uma fatura como paga?', 'Em Cartões, escolha a fatura e toque em “Pagar fatura”. O valor sai da conta escolhida e os itens ficam pagos, sem contar a despesa duas vezes.'],
  ['Importei algo errado. E agora?', 'Em Importar, na lista “Importações feitas”, toque em Desfazer. Todos os lançamentos daquela importação são apagados.'],
  ['Posso usar no celular?', 'Sim. Abra o site e use “Instalar app” (Android) ou Compartilhar → “Adicionar à Tela de Início” (iPhone).'],
  ['Como faço backup?', 'Em Mais: “Exportar para Excel (CSV)” ou “Baixar backup completo (JSON)”.'],
];

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Novidades</h1><p class="dica">Você está na versão <b>${VERSAO}</b></p></div><a class="btn" href="#/ajuda">❓ Como usar</a></div>
    <div class="linha-tempo">
      ${VERSOES.map((v, i) => `
        <section class="cartao-bloco versao ${i === 0 ? 'atual' : ''}">
          <div class="versao-topo"><span class="versao-tag">v${esc(v.versao)}</span><h2>${esc(v.titulo)}</h2><small>${fmtData(v.data)}</small></div>
          <h3>Novas funções e melhorias</h3>
          <ul class="lista-simples">${v.novidades.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
          ${v.correcoes.length ? `<h3>Correções</h3><ul class="lista-simples">${v.correcoes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        </section>`).join('')}
      <section class="cartao-bloco versao proxima">
        <div class="versao-topo"><span class="versao-tag">em breve</span><h2>Próximas versões</h2></div>
        <ul class="lista-simples">${PROXIMAS.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </section>
    </div>
    <section class="cartao-bloco">
      <h2>Perguntas frequentes</h2>
      ${FAQ.map(([p, r]) => `<details class="faq"><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('')}
    </section>`;
  try { localStorage.setItem('versaoVista', VERSAO); } catch { /* sem armazenamento */ }
}
