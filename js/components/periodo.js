// Seletor de período: mês e ano separados (mês "Ano todo" = 0). Compartilhado entre as telas.
import { S } from '../state.js';
import { MESES, intervalo } from '../calc.js';

export function anosDisponiveis() {
  const atual = new Date().getFullYear();
  let min = atual, max = atual + 1;
  for (const l of S.lancs) {
    const y = Number(l.data_pagamento.slice(0, 4));
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const out = [];
  for (let y = max; y >= min; y--) out.push(y);
  return out;
}

export function periodoAtual() { return intervalo(S.ano, S.mes); }

export function rotuloPeriodo(ano = S.ano, mes = S.mes) {
  return mes ? `${MESES[mes - 1]} de ${ano}` : `Ano de ${ano}`;
}

export function noPeriodo(iso) {
  const { ini, fim } = periodoAtual();
  return iso >= ini && iso <= fim;
}

/** HTML do seletor. permitirAno=false esconde a opção "Ano todo" */
export function periodoHTML({ permitirAno = true } = {}) {
  const mes = !permitirAno && !S.mes ? new Date().getMonth() + 1 : S.mes;
  return `
    <div class="periodo" role="group" aria-label="Período">
      <button class="btn-icone" data-per="-1" aria-label="Período anterior">‹</button>
      <select data-per-mes aria-label="Mês">
        ${permitirAno ? `<option value="0" ${!mes ? 'selected' : ''}>📅 Ano todo</option>` : ''}
        ${MESES.map((m, i) => `<option value="${i + 1}" ${mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <select data-per-ano aria-label="Ano">
        ${anosDisponiveis().map((y) => `<option ${y === S.ano ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <button class="btn-icone" data-per="1" aria-label="Próximo período">›</button>
    </div>`;
}

export function ligarPeriodo(el, aoMudar, { permitirAno = true } = {}) {
  if (!permitirAno && !S.mes) S.mes = new Date().getMonth() + 1;
  const m = el.querySelector('[data-per-mes]'), a = el.querySelector('[data-per-ano]');
  if (!m) return;
  m.onchange = () => { S.mes = Number(m.value); aoMudar(); };
  a.onchange = () => { S.ano = Number(a.value); aoMudar(); };
  el.querySelectorAll('[data-per]').forEach((b) => b.onclick = () => {
    const passo = Number(b.dataset.per);
    if (!S.mes) S.ano += passo;
    else {
      S.mes += passo;
      if (S.mes > 12) { S.mes = 1; S.ano++; }
      if (S.mes < 1) { S.mes = 12; S.ano--; }
    }
    aoMudar();
  });
}
