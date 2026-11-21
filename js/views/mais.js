// Tela: Mais — exportar dados, backup, conta, sair
import * as db from '../db.js';
import { S, contaPorId, cartaoPorId, categoriaPorId } from '../state.js';
import { fmtData, hoje } from '../calc.js';
import { esc, toast } from '../ui.js';
import { VERSAO } from '../config.js';

function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const celula = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportarCSV() {
  const rot = { entrada: '⬆️ Entrada', saida: '⬇️ Saída', transferencia: '🔁 Transferência', pagamento_fatura: '💳 Pagamento da Fatura' };
  const cab = ['Data da Movimentação', 'Data do Pagamento', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Conta Bancária', 'Conta Destino', 'Cartão', 'Método de Pagamento', 'Nº da Parcela', 'Situação'];
  const linhas = S.lancs.slice().sort((a, b) => a.data_movimento.localeCompare(b.data_movimento)).map((l) => {
    const c = categoriaPorId(l.categoria_id);
    return [fmtData(l.data_movimento), fmtData(l.data_pagamento), rot[l.tipo], c ? `${c.emoji} ${c.nome}` : '', l.descricao,
      String(l.valor).replace('.', ','), contaPorId(l.conta_id)?.nome || '', contaPorId(l.conta_destino_id)?.nome || '',
      cartaoPorId(l.cartao_id)?.nome || '', l.metodo, l.parcela_total ? `${l.parcela_num} de ${l.parcela_total}` : '',
      { pago: 'Pago', pendente: 'Pendente', recebido: 'Recebido' }[l.situacao]].map(celula).join(';');
  });
  baixar(`lancamentos_${hoje()}.csv`, '﻿' + [cab.join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
  toast(`${linhas.length} lançamentos exportados.`);
}

export function backupJSON() {
  const dados = { versao: VERSAO, gerado_em: new Date().toISOString(), contas: S.contas, cartoes: S.cartoes, categorias: S.categorias, lancamentos: S.lancs };
  baixar(`backup_financeiro_${hoje()}.json`, JSON.stringify(dados, null, 2), 'application/json');
  toast('Backup gerado.');
}

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><h1>Mais</h1></div>
    <section class="cartao-bloco">
      <h2>Cadastros</h2>
      <p class="dica">Contas, cartões e categorias.</p>
      <a class="btn" href="#/cadastros">⚙️ Abrir cadastros</a>
    </section>
    <section class="cartao-bloco">
      <h2>Seus dados</h2>
      <p class="dica">${S.lancs.length} lançamentos · ${S.contas.length} contas · ${S.cartoes.length} cartões · ${S.categorias.length} categorias</p>
      <div class="botoes-col">
        <button class="btn" data-csv>📄 Exportar lançamentos para Excel (CSV)</button>
        <button class="btn" data-json>💾 Baixar backup completo (JSON)</button>
      </div>
    </section>
    <section class="cartao-bloco">
      <h2>Em breve</h2>
      <ul class="lista-simples">
        <li>📄 Leitura ajustada para os PDFs do XP e do Itaú</li>
        <li>🎯 Metas financeiras e investimentos</li>
      </ul>
    </section>
    <section class="cartao-bloco">
      <h2>Conta</h2>
      <p>Conectado como <b>${esc(S.user?.email || '')}</b></p>
      <button class="btn btn-perigo" data-sair>Sair</button>
      <p class="dica mt">Versão ${VERSAO}</p>
    </section>`;
  el.querySelector('[data-csv]').onclick = exportarCSV;
  el.querySelector('[data-json]').onclick = backupJSON;
  el.querySelector('[data-sair]').onclick = async () => { await db.sair(); };
}
