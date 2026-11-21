// Tela: Mais — exportar dados, backup, conta, sair
import * as db from '../db.js';
import { S, contaPorId, cartaoPorId, categoriaPorId, nomeUsuario, recarregarPerfil } from '../state.js';
import { fmtData, hoje } from '../calc.js';
import { esc, toast, modal, comCarregando } from '../ui.js';
import { reduzirImagem } from '../components/visual.js';
import { VERSAO } from '../config.js';
import { prefs, salvarPrefs, CORES_TEMA } from '../prefs.js';
import { instalar, instalado } from '../servicos/instalar.js';
import { reiniciarSessao } from '../servicos/sessao.js';
import { cotacaoUSD, infoCotacao, atualizarCotacao, definirCotacaoManual } from '../servicos/cotacao.js';
import { numero } from '../ui.js';

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

export function exportarCSVTexto() {
  const rot = { entrada: '⬆️ Entrada', saida: '⬇️ Saída', transferencia: '🔁 Transferência', pagamento_fatura: '💳 Pagamento da Fatura' };
  const cab = ['Data da Movimentação', 'Data do Pagamento', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Conta Bancária', 'Conta Destino', 'Cartão', 'Método de Pagamento', 'Nº da Parcela', 'Situação'];
  const linhas = S.lancs.slice().sort((a, b) => a.data_movimento.localeCompare(b.data_movimento)).map((l) => {
    const c = categoriaPorId(l.categoria_id);
    return [fmtData(l.data_movimento), fmtData(l.data_pagamento), rot[l.tipo], c ? `${c.emoji} ${c.nome}` : '', l.descricao,
      String(l.valor).replace('.', ','), contaPorId(l.conta_id)?.nome || '', contaPorId(l.conta_destino_id)?.nome || '',
      cartaoPorId(l.cartao_id)?.nome || '', l.metodo, l.parcela_total ? `${l.parcela_num} de ${l.parcela_total}` : '',
      { pago: 'Pago', pendente: 'Pendente', recebido: 'Recebido' }[l.situacao]].map(celula).join(';');
  });
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n');
}

export function exportarCSV() {
  baixar(`lancamentos_${hoje()}.csv`, exportarCSVTexto(), 'text/csv;charset=utf-8');
  toast(`${S.lancs.length} lançamentos exportados.`);
}

export function backupObjeto() {
  return { versao: VERSAO, gerado_em: new Date().toISOString(), contas: S.contas, cartoes: S.cartoes, categorias: S.categorias, lancamentos: S.lancs,
    recorrentes: S.recorrentes, regras: S.regras, metas: S.metas, metas_movimentos: S.metasMov, investimentos: S.investimentos, investimentos_historico: S.invHist,
    dividas: S.dividas, dividas_pagamentos: S.dividasPag, patrimonio_mensal: S.patrimonio };
}

export function backupJSON() {
  baixar(`backup_financeiro_${hoje()}.json`, JSON.stringify(backupObjeto(), null, 2), 'application/json');
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
      <a href="#/assistente"><span>🤖</span>Assistente IA</a>
      <a href="#/patrimonio"><span>💎</span>Patrimônio</a>
      <a href="#/integracoes"><span>🔌</span>Integrações <small>Telegram · Drive</small></a>
      <a href="#/relatorio"><span>📄</span>Relatório mensal</a>
      <a href="#/dashboards"><span>📊</span>Dashboards</a>
      <a href="#/ajuda"><span>❓</span>Como usar</a>
      <a href="#/novidades"><span>✨</span>Novidades <small>v${VERSAO}</small></a>
    </div>
    <section class="cartao-bloco" id="aparencia">
      <h2>🎨 Aparência</h2>
      <h3>Tema</h3>
      <div class="seg seg3" role="radiogroup" aria-label="Tema">
        ${[['auto', '🌗 Automático'], ['claro', '☀️ Claro'], ['escuro', '🌙 Escuro']].map(([v, r]) => `<label><input type="radio" name="tema" value="${v}" ${prefs().tema === v ? 'checked' : ''}><span>${r}</span></label>`).join('')}
      </div>
      <h3>Cor de destaque</h3>
      <div class="temas-cores">${Object.entries(CORES_TEMA).map(([k, c]) => `<button class="tema-cor ${prefs().cor === k ? 'sel' : ''}" data-cor-tema="${k}" style="--c1:${c.claro[0]};--c2:${c.claro[1]}" aria-label="${esc(c.nome)}"><i></i><span>${esc(c.nome)}</span></button>`).join('')}</div>
      <p class="dica">Vale para todos os seus aparelhos.</p>
    </section>
    <section class="cartao-bloco">
      <h2>🔐 Segurança</h2>
      <label class="form-linha">Encerrar a sessão depois de
        <select data-sessao>${[5, 10, 15, 30, 60].map((m) => `<option value="${m}" ${Number(prefs().sessaoMin) === m ? 'selected' : ''}>${m} minutos sem uso</option>`).join('')}</select>
      </label>
      <p class="dica">Enquanto você estiver mexendo no app, a sessão nunca é encerrada. Um minuto antes, aparece um aviso para continuar.</p>
      <h3>Verificação em 2 etapas</h3>
      <div data-mfa><p class="dica">Carregando…</p></div>
    </section>
    ${S.contas.some((c) => c.moeda === 'USD') || S.investimentos.some((i) => i.moeda === 'USD') ? `<section class="cartao-bloco">
      <h2>💵 Cotação do dólar</h2>
      <p>US$ 1 = <b>R$ ${cotacaoUSD().toFixed(4).replace('.', ',')}</b> <small class="dica">${infoCotacao() ? `(${infoCotacao().fonte}, ${new Date(infoCotacao().em).toLocaleString('pt-BR')})` : '(padrão)'}</small></p>
      <div class="acoes"><button class="btn btn-peq" data-cot-atualizar>🔄 Atualizar agora</button><button class="btn btn-peq" data-cot-manual>✎ Informar à mão</button></div>
    </section>` : ''}
    <section class="cartao-bloco">
      <h2>📲 App no celular</h2>
      ${instalado() ? '<p>✅ Você está usando o app instalado.</p>' : '<p class="dica">Funciona no Android e no iPhone, com os mesmos dados do computador.</p><button class="btn btn-primario" data-instalar>📲 Instalar app</button>'}
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
      <button class="btn btn-perigo" data-sair>🚪 Sair</button>
      <p class="dica mt">Versão ${VERSAO}</p>
    </section>`;
  el.querySelector('[data-perfil]').onclick = () => abrirPerfil(() => { render(el); window.dispatchEvent(new Event('perfil-mudou')); });
  el.querySelector('[data-csv]').onclick = exportarCSV;
  el.querySelectorAll('[name=tema]').forEach((r) => r.onchange = () => salvarPrefs({ tema: r.value }).catch((e) => toast(e.message, 'erro')));
  el.querySelectorAll('[data-cor-tema]').forEach((b) => b.onclick = async () => {
    el.querySelectorAll('[data-cor-tema]').forEach((x) => x.classList.toggle('sel', x === b));
    await salvarPrefs({ cor: b.dataset.corTema }).catch((e) => toast(e.message, 'erro'));
  });
  el.querySelector('[data-sessao]').onchange = async (e) => { await salvarPrefs({ sessaoMin: Number(e.target.value) }).catch((er) => toast(er.message, 'erro')); reiniciarSessao(); toast('Tempo de sessão salvo.'); };
  el.querySelector('[data-instalar]')?.addEventListener('click', instalar);
  montarMFA(el.querySelector('[data-mfa]'));
  el.querySelector('[data-cot-atualizar]')?.addEventListener('click', async (e) => { await comCarregando(e.currentTarget, () => atualizarCotacao(true)); toast(`Cotação: R$ ${cotacaoUSD().toFixed(4).replace('.', ',')}`); render(el); });
  el.querySelector('[data-cot-manual]')?.addEventListener('click', () => {
    const v = numero(prompt('Quantos reais vale US$ 1? (ex.: 5,43)', String(cotacaoUSD()).replace('.', ',')) || '');
    if (v > 0) { definirCotacaoManual(v); toast('Cotação salva.'); render(el); }
  });
  el.querySelector('[data-json]').onclick = backupJSON;
  el.querySelector('[data-sair]').onclick = async () => { await db.sair(); };
}

// ---------------- Verificação em 2 etapas (Google Authenticator, Microsoft Authenticator, Authy…) ----------------
async function montarMFA(box) {
  if (!box) return;
  let fatores = [];
  try { fatores = await db.fatoresMFA(); } catch (e) { box.innerHTML = `<p class="dica">Não foi possível consultar: ${esc(e.message)}</p>`; return; }
  if (fatores.length) {
    box.innerHTML = `<p>✅ <b>Ativada.</b> Ao entrar, o app pede o código de 6 dígitos do seu app autenticador.</p><button class="btn btn-perigo btn-peq" data-mfa-off>Desativar</button>`;
    box.querySelector('[data-mfa-off]').onclick = async (e) => {
      const { confirmar } = await import('../ui.js');
      if (!(await confirmar('Desativar 2 etapas', 'Seu login volta a pedir só e-mail e senha. Continuar?', [{ valor: 'sim', rotulo: 'Desativar', classe: 'btn-perigo' }]))) return;
      await comCarregando(e.currentTarget, () => db.removerMFA(fatores[0].id));
      toast('Verificação em 2 etapas desativada.'); montarMFA(box);
    };
    return;
  }
  box.innerHTML = `<p class="dica">Além da senha, pede um código do celular (Google Authenticator, Microsoft Authenticator ou Authy). Recomendado.</p><button class="btn btn-primario btn-peq" data-mfa-on>🔐 Ativar verificação em 2 etapas</button>`;
  box.querySelector('[data-mfa-on]').onclick = async (e) => {
    const r = await comCarregando(e.currentTarget, () => db.cadastrarMFA());
    modal('Ativar verificação em 2 etapas', `
      <form class="form">
        <ol class="lista-simples"><li>Abra o app autenticador no celular e toque em <b>+</b> / “Escanear QR code”.</li>
          <li>Aponte para o código abaixo (ou digite a chave manualmente).</li><li>Digite o código de 6 dígitos que aparecer.</li></ol>
        <div class="mfa-qr"><img src="${esc(r.totp.qr_code)}" alt="QR code"><code>${esc(r.totp.secret)}</code></div>
        <label>Código de 6 dígitos <input name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="000000"></label>
        <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Confirmar e ativar</button></div>
      </form>`, (el, fechar) => {
      const f = el.querySelector('form');
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        try { await comCarregando(f.querySelector('.btn-primario'), () => db.verificarMFA(r.id, f.codigo.value)); }
        catch { f.codigo.select(); return; }
        toast('🔐 Verificação em 2 etapas ativada!'); fechar(); montarMFA(box);
      };
    });
  };
}
