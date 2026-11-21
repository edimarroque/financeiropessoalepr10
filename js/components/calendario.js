// Mini calendário: gastos e ganhos por dia (pela data da compra/movimento)
import { S, nomeCategoria, contaPorId, cartaoPorId } from '../state.js';
import { porDia, MESES, DIAS_SEMANA, diasNoMes, hoje, fmtData } from '../calc.js';
import { esc, brl, modal } from '../ui.js';

let vis = null; // {ano, mes} exibido no calendário

export function calendarioHTML() {
  if (!vis || (S.mes && (vis.ano !== S.ano || vis.mes !== S.mes)) || (!S.mes && vis.ano !== S.ano)) {
    const h = hoje();
    vis = S.mes ? { ano: S.ano, mes: S.mes } : { ano: S.ano, mes: Number(h.slice(0, 4)) === S.ano ? Number(h.slice(5, 7)) : 1 };
  }
  const { ano, mes } = vis;
  const dias = porDia(S.lancs, ano, mes);
  const total = diasNoMes(ano, mes);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const maxG = Math.max(1, ...[...dias.values()].map((d) => d.gastos));
  const hj = hoje();
  let cel = '';
  for (let i = 0; i < inicio; i++) cel += '<div class="cal-dia vazio"></div>';
  for (let d = 1; d <= total; d++) {
    const x = dias.get(d);
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const nivel = x && x.gastos ? Math.min(4, Math.ceil((x.gastos / maxG) * 4)) : 0;
    cel += `<button class="cal-dia n${nivel} ${iso === hj ? 'hoje' : ''} ${x ? 'tem' : ''}" data-dia="${d}" ${x ? '' : 'tabindex="-1"'}
      title="${fmtData(iso)}${x ? `\nGastos: ${brl(x.gastos)}${x.ganhos ? `\nGanhos: ${brl(x.ganhos)}` : ''}` : ''}">
      <span class="cal-num">${d}</span>
      ${x && x.gastos ? `<span class="cal-val">${x.gastos >= 1000 ? (x.gastos / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(x.gastos)}</span>` : ''}
      ${x && x.ganhos ? '<span class="cal-ganho"></span>' : ''}
    </button>`;
  }
  const totG = [...dias.values()].reduce((s, d) => s + d.gastos, 0);
  return `
    <div class="calendario">
      <div class="cal-topo">
        <button class="btn-icone" data-cal="-1" aria-label="Mês anterior">‹</button>
        <b>${MESES[mes - 1]} ${ano}</b>
        <button class="btn-icone" data-cal="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal-semana">${DIAS_SEMANA.map((d) => `<span>${d[0]}</span>`).join('')}</div>
      <div class="cal-grade">${cel}</div>
      <div class="cal-rodape"><span><i class="cal-ganho"></i> teve ganho</span><span>Gastos no mês: <b>${brl(totG)}</b></span></div>
    </div>`;
}

export function ligarCalendario(el, rerender) {
  el.querySelectorAll('[data-cal]').forEach((b) => b.onclick = () => {
    vis.mes += Number(b.dataset.cal);
    if (vis.mes > 12) { vis.mes = 1; vis.ano++; }
    if (vis.mes < 1) { vis.mes = 12; vis.ano--; }
    const alvo = el.querySelector('.calendario');
    // re-renderiza só o calendário, sem mudar o período das outras telas
    const tmp = document.createElement('div');
    const salvo = { ano: S.ano, mes: S.mes };
    S.ano = vis.ano; S.mes = vis.mes;
    tmp.innerHTML = calendarioHTML();
    S.ano = salvo.ano; S.mes = salvo.mes;
    alvo.replaceWith(tmp.firstElementChild);
    ligarCalendario(el, rerender);
  });
  el.querySelectorAll('.cal-dia.tem').forEach((b) => b.onclick = () => abrirDia(Number(b.dataset.dia)));
}

function abrirDia(d) {
  const x = porDia(S.lancs, vis.ano, vis.mes).get(d);
  if (!x) return;
  const iso = `${vis.ano}-${String(vis.mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  modal(`Dia ${fmtData(iso)}`, `
    <div class="resumo-linha r2"><div><small>Gastos</small><b class="neg">${brl(x.gastos)}</b></div><div><small>Ganhos</small><b class="pos">${brl(x.ganhos)}</b></div></div>
    <div class="lista">${x.itens.map((l) => `
      <div class="item item-estatico">
        <div class="item-meio"><div class="item-titulo">${esc(l.descricao || nomeCategoria(l.categoria_id))}</div>
          <div class="item-sub">${esc(nomeCategoria(l.categoria_id))} · ${esc(l.cartao_id ? '💳 ' + (cartaoPorId(l.cartao_id)?.nome || '') : '🏦 ' + (contaPorId(l.conta_id)?.nome || ''))}</div></div>
        <div class="item-fim"><div class="valor ${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'entrada' ? '+' : '−'}${brl(l.valor)}</div></div>
      </div>`).join('')}</div>`);
}
