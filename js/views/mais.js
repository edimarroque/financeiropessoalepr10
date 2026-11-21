// Tela: Mais — exportar dados, backup, conta, sair
import * as db from '../db.js';
import { S, contaPorId, cartaoPorId, categoriaPorId, nomeUsuario, recarregarPerfil } from '../state.js';
import { fmtData, hoje } from '../calc.js';
import { esc, toast, modal, comCarregando } from '../ui.js';
import { reduzirImagem } from '../components/visual.js';
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

export function avatarHTML(tam = 40) {
  const p = S.perfil;
  if (p && p.foto) return `<span class="avatar" style="width:${tam}px;height:${tam}px"><img src="${esc(p.foto)}" alt=""></span>`;
  const n = nomeUsuario();
  return `<span class="avatar avatar-letra" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.42)}px">${esc((n[0] || '?').toUpperCase())}</span>`;
}

export function abrirPerfil(aoSalvar) {
  const p = S.perfil || {};
  modal('Meu perfil', `
    <form class="form">
      <div class="perfil-foto"><div data-prev>${avatarHTML(96)}</div>
        <div class="acoes"><label class="btn btn-peq vc-upload">📷 Escolher foto<input type="file" accept="image/*" data-foto></label>
        <button type="button" class="btn btn-peq" data-tirar ${p.foto ? '' : 'hidden'}>Remover</button></div></div>
      <label>Como quer ser chamado <input name="nome" maxlength="60" value="${esc(p.nome || '')}" placeholder="${esc(nomeUsuario())}"></label>
      <input type="hidden" name="foto" value="${esc(p.foto || '')}">
      <p class="dica">A foto é reduzida para 256×256 antes de salvar.</p>
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Salvar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    const prev = () => { el.querySelector('[data-prev]').innerHTML = f.foto.value ? `<span class="avatar" style="width:96px;height:96px"><img src="${esc(f.foto.value)}" alt=""></span>` : avatarHTML(96); el.querySelector('[data-tirar]').hidden = !f.foto.value; };
    el.querySelector('[data-foto]').onchange = async (e) => {
      try { f.foto.value = await reduzirImagem(e.target.files[0], 256, 'image/jpeg', true); prev(); } catch (err) { toast(err.message, 'erro'); }
    };
    el.querySelector('[data-tirar]').onclick = () => { f.foto.value = ''; prev(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const dados = { nome: f.nome.value.trim(), foto: f.foto.value || null, updated_at: new Date().toISOString() };
      await comCarregando(f.querySelector('.btn-primario'), async () => {
        if (S.perfil) await db.atualizarOnde('perfis', 'user_id', S.user.id, dados);
        else await db.inserir('perfis', [dados]);
        await recarregarPerfil();
      });
      toast('Perfil salvo.'); fechar(); aoSalvar && aoSalvar();
    };
  });
}

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><h1>Mais</h1></div>
    <section class="cartao-bloco perfil-cartao">
      ${avatarHTML(64)}
      <div class="espaco"><b>${esc(nomeUsuario())}</b><small class="dica">${esc(S.user?.email || '')}</small></div>
      <button class="btn" data-perfil>✏️ Editar perfil</button>
    </section>
    <div class="atalhos">
      <a href="#/importar"><span>📥</span>Importar</a>
      <a href="#/cadastros"><span>⚙️</span>Cadastros</a>
      <a href="#/dashboards"><span>📊</span>Dashboards</a>
      <a href="#/ajuda"><span>❓</span>Como usar</a>
      <a href="#/novidades"><span>✨</span>Novidades <small>v${VERSAO}</small></a>
    </div>
    <section class="cartao-bloco">
      <h2>Seus dados</h2>
      <p class="dica">${S.lancs.length} lançamentos · ${S.contas.length} contas · ${S.cartoes.length} cartões · ${S.categorias.length} categorias</p>
      <div class="botoes-col">
        <button class="btn" data-csv>📄 Exportar lançamentos para Excel (CSV)</button>
        <button class="btn" data-json>💾 Baixar backup completo (JSON)</button>
      </div>
    </section>
    <section class="cartao-bloco">
      <button class="btn btn-perigo" data-sair>🚪 Sair</button>
      <p class="dica mt">Versão ${VERSAO}</p>
    </section>`;
  el.querySelector('[data-perfil]').onclick = () => abrirPerfil(() => { render(el); window.dispatchEvent(new Event('perfil-mudou')); });
  el.querySelector('[data-csv]').onclick = exportarCSV;
  el.querySelector('[data-json]').onclick = backupJSON;
  el.querySelector('[data-sair]').onclick = async () => { await db.sair(); };
}
