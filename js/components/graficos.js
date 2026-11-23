// Gráficos em SVG puro (sem bibliotecas), com dica ao passar o mouse
import { esc, brl } from '../ui.js';

// cor neutra (cinza) para “Sem categoria” em todos os gráficos (v1.6.3)
export const COR_SEM_CATEGORIA = '#94a3b8';
export const PALETA = ['#2563eb', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#22c55e', '#0ea5e9', '#f97316', '#64748b'];

const kfmt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace('.', ',') + 'k' : Math.round(v).toString());

/** Barras agrupadas: series = [{nome, cor, valores[]}], rotulos[] */
export function barras(rotulos, series, { altura = 220, destaque = -1, linha = null } = {}) {
  const W = 640, H = altura, pe = 44, pb = 26, pt = 10;
  const todos = series.flatMap((s) => s.valores).concat(linha ? linha.valores : []);
  const max = Math.max(1, ...todos);
  const min = Math.min(0, ...todos);
  const passo = (W - pe - 6) / rotulos.length;
  const bw = Math.min(42, Math.max(3, (passo - 8) / series.length));
  const folga = Math.max(0, (passo - 8) - bw * series.length) / 2; // centraliza quando há poucas barras
  const y = (v) => pt + (H - pt - pb) * ((max - v) / (max - min || 1));
  const marcas = min < 0 ? [min, min / 2, 0, max / 2, max] : [0, max * 0.25, max * 0.5, max * 0.75, max];
  const grade = marcas.map((v) => `<line x1="${pe}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="g-grade ${v === 0 ? 'g-zero' : ''}"/>
    <text x="${pe - 6}" y="${y(v) + 4}" text-anchor="end" class="g-rot">${kfmt(v)}</text>`).join('');
  const grupos = rotulos.map((r, i) => {
    const x0 = pe + i * passo + 4;
    const dica = [r, ...series.map((s) => `${s.nome}: ${brl(s.valores[i])}`), ...(linha ? [`${linha.nome}: ${brl(linha.valores[i])}`] : [])].join('\n');
    return `<g class="g-grupo ${i === destaque ? 'g-destaque' : ''}" data-dica="${esc(dica)}">
      <rect x="${x0 - 2}" y="${pt}" width="${passo - 4}" height="${H - pt - pb}" class="g-hover"/>
      ${series.map((s, k) => { const v = s.valores[i]; const y1 = Math.min(y(v), y(0)); return `<rect x="${x0 + folga + k * bw}" y="${y1}" width="${bw - 1}" height="${Math.abs(y(v) - y(0))}" rx="3" fill="${s.cor}"/>`; }).join('')}
      <text x="${x0 + (passo - 8) / 2}" y="${H - 8}" text-anchor="middle" class="g-rot ${i === destaque ? 'g-rot-forte' : ''}">${esc(r)}</text></g>`;
  }).join('');
  let poli = '';
  if (linha) {
    const pts = linha.valores.map((v, i) => `${pe + i * passo + passo / 2},${y(v)}`).join(' ');
    poli = `<polyline points="${pts}" fill="none" stroke="${linha.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
      linha.valores.map((v, i) => `<circle cx="${pe + i * passo + passo / 2}" cy="${y(v)}" r="3.5" fill="${linha.cor}" data-dica="${esc(rotulos[i] + '\n' + linha.nome + ': ' + brl(v))}"/>`).join('');
  }
  const leg = [...series, ...(linha ? [linha] : [])].map((s) => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img">${grade}${grupos}${poli}</svg><div class="legenda">${leg}</div>`;
}

/** Rosca: itens = [{nome, valor, cor?}] */
export function rosca(itens, { centro = '', sub = '' } = {}) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (!total) return '<p class="dica">Sem dados no período.</p>';
  const R = 70, r = 46, C = 90;
  let ang = -Math.PI / 2;
  const fatias = itens.map((it, i) => {
    const frac = it.valor / total;
    const a2 = ang + frac * Math.PI * 2;
    const grande = frac > 0.5 ? 1 : 0;
    const p = (a, rad) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const d = frac >= 0.9999
      ? `M ${C - R},${C} a ${R},${R} 0 1,0 ${2 * R},0 a ${R},${R} 0 1,0 ${-2 * R},0 M ${C - r},${C} a ${r},${r} 0 1,1 ${2 * r},0 a ${r},${r} 0 1,1 ${-2 * r},0`
      : `M ${p(ang, R)} A ${R},${R} 0 ${grande},1 ${p(a2, R)} L ${p(a2, r)} A ${r},${r} 0 ${grande},0 ${p(ang, r)} Z`;
    ang = a2;
    const cor = it.cor || PALETA[i % PALETA.length];
    return `<path d="${d}" fill="${cor}" fill-rule="evenodd" data-dica="${esc(`${it.nome}\n${brl(it.valor)} (${(frac * 100).toFixed(1)}%)`)}"/>`;
  }).join('');
  const leg = itens.map((it, i) => `<li><i style="background:${it.cor || PALETA[i % PALETA.length]}"></i><span>${esc(it.nome)}</span><b>${(it.valor / total * 100).toFixed(0)}%</b></li>`).join('');
  return `<div class="rosca"><svg viewBox="0 0 180 180" role="img">${fatias}
      <text x="90" y="88" text-anchor="middle" class="rosca-centro">${esc(centro)}</text>
      <text x="90" y="106" text-anchor="middle" class="rosca-sub">${esc(sub)}</text></svg>
    <ul class="rosca-leg">${leg}</ul></div>`;
}

/** Lista de barras horizontais: itens = [{rotulo, valor, extra?, cor?}] */
export function barrasH(itens, { max = null, cor = 'var(--acento)' } = {}) {
  if (!itens.length) return '<p class="dica">Sem dados no período.</p>';
  const m = max || Math.max(...itens.map((i) => i.valor), 1);
  return `<div class="barras-h">${itens.map((it) => `
    <div class="bh-linha" data-dica="${esc(`${it.rotulo}\n${brl(it.valor)}`)}">
      <div class="bh-topo"><span>${esc(it.rotulo)}${it.extra ? ` <small>${esc(it.extra)}</small>` : ''}</span><b>${brl(it.valor)}</b></div>
      <div class="bh-trilho"><div class="bh-barra" style="width:${Math.max(1.5, it.valor / m * 100).toFixed(1)}%;background:${it.cor || cor}"></div></div>
    </div>`).join('')}</div>`;
}

/** Indicador de variação ▲ ▼ (para despesas, subir é ruim) */
export function selo(v, { inverso = false } = {}) {
  if (v === null || !Number.isFinite(v)) return '<span class="selo neutro">—</span>';
  const sobe = v > 0;
  const bom = inverso ? !sobe : sobe;
  return `<span class="selo ${Math.abs(v) < 0.005 ? 'neutro' : bom ? 'bom' : 'ruim'}">${sobe ? '▲' : '▼'} ${Math.abs(v * 100).toFixed(0)}%</span>`;
}

// ---------------------------------------------------------------------
// Dica flutuante: aparece ao passar o mouse ou tocar numa barra/fatia (celular e computador)
// ---------------------------------------------------------------------
let dicaEl = null;
function mostrarDica(alvo, x, y) {
  if (!dicaEl) { dicaEl = document.createElement('div'); dicaEl.className = 'dica-flutuante'; dicaEl.setAttribute('role', 'tooltip'); document.body.appendChild(dicaEl); }
  const linhas = alvo.dataset.dica.split('\n');
  dicaEl.innerHTML = `<b>${esc(linhas[0])}</b>${linhas.slice(1).map((l) => `<span>${esc(l)}</span>`).join('')}`;
  dicaEl.classList.add('vis');
  const w = dicaEl.offsetWidth, h = dicaEl.offsetHeight;
  dicaEl.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2))}px`;
  dicaEl.style.top = `${y - h - 14 < 8 ? y + 18 : y - h - 14}px`;
  document.querySelectorAll('.dica-ativa').forEach((e) => e.classList.remove('dica-ativa'));
  alvo.classList.add('dica-ativa');
}
function esconderDica() { dicaEl?.classList.remove('vis'); document.querySelectorAll('.dica-ativa').forEach((e) => e.classList.remove('dica-ativa')); }
if (typeof document !== 'undefined' && !window.__dicas) {
  window.__dicas = true;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const a = e.target.closest?.('[data-dica]');
    if (a) mostrarDica(a, e.clientX, e.clientY); else esconderDica();
  });
  document.addEventListener('pointerdown', (e) => {
    const a = e.target.closest?.('[data-dica]');
    if (a) mostrarDica(a, e.clientX, e.clientY); else esconderDica();
  });
  window.addEventListener('scroll', esconderDica, { passive: true });
  window.addEventListener('hashchange', esconderDica);
}
