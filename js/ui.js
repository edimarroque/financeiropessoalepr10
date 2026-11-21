// Utilidades de tela

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => fmtBRL.format(Number(v) || 0);
export const pct = (v) => `${(Number(v) * 100 || 0).toFixed(0)}%`;

// Converte "1.234,56" ou "1234.56" em número
export function numero(txt) {
  if (typeof txt === 'number') return txt;
  let s = String(txt || '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function toast(msg, tipo = 'ok') {
  let pilha = document.querySelector('.toasts');
  if (!pilha) { pilha = document.createElement('div'); pilha.className = 'toasts'; pilha.setAttribute('aria-live', 'polite'); document.body.appendChild(pilha); }
  while (pilha.children.length >= 3) pilha.firstChild.remove();
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  pilha.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, tipo === 'erro' ? 6000 : 3000);
}

/** Abre um modal. conteudo = HTML; aoAbrir(el, fechar) para ligar eventos. */
export function modal(titulo, conteudo, aoAbrir, aoFechar) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="modal-topo"><h2>${esc(titulo)}</h2><button class="btn-icone" data-fechar aria-label="Fechar">✕</button></header>
      <div class="modal-corpo">${conteudo}</div>
    </div>`;
  let fechado = false;
  const fechar = () => {
    if (fechado) return; fechado = true;
    fundo.remove(); document.removeEventListener('keydown', esc_);
    aoFechar && aoFechar();
  };
  const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc_);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  fundo.querySelector('[data-fechar]').onclick = fechar;
  document.body.appendChild(fundo);
  aoAbrir && aoAbrir(fundo.querySelector('.modal'), fechar);
  const primeiro = fundo.querySelector('input:not([type=hidden]),select,textarea');
  primeiro && setTimeout(() => primeiro.focus(), 50);
  return fechar;
}

/** Confirmação simples. Retorna Promise<string|false> com o valor do botão escolhido. */
export function confirmar(titulo, texto, botoes = [{ valor: 'sim', rotulo: 'Confirmar', classe: 'btn-perigo' }]) {
  return new Promise((resolve) => {
    let escolhido = false;
    modal(titulo, `
      <p class="texto-confirmar">${texto}</p>
      <div class="acoes">
        <button class="btn" data-v="">Cancelar</button>
        ${botoes.map((b) => `<button class="btn ${b.classe || 'btn-primario'}" data-v="${esc(b.valor)}">${esc(b.rotulo)}</button>`).join('')}
      </div>`, (el, f) => {
      el.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { escolhido = b.dataset.v || false; f(); });
    }, () => resolve(escolhido));
  });
}

/** Executa ação com botão em estado "carregando" e mostra erro amigável */
export async function comCarregando(botao, fn) {
  const txt = botao ? botao.innerHTML : '';
  if (botao) { botao.disabled = true; botao.innerHTML = '<span class="giro"></span>'; }
  try { return await fn(); }
  catch (e) { toast(e.message || String(e), 'erro'); throw e; }
  finally { if (botao) { botao.disabled = false; botao.innerHTML = txt; } }
}

export function barra(valor, maximo, classe = '') {
  const p = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  const estouro = maximo > 0 && valor > maximo;
  return `<div class="barra ${classe}"><div class="barra-preench ${estouro ? 'estouro' : ''}" style="width:${p.toFixed(1)}%"></div></div>`;
}
