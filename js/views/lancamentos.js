// Tela: Lançamentos do mês (equivale à aba Movimentações)
import * as db from '../db.js';
import { S, recarregarLancamentos, contaPorId, cartaoPorId, categoriaPorId, nomeCategoria } from '../state.js';
import { mesDe, fmtData, nomeMes, somarMesRef, arred, hoje } from '../calc.js';
import { esc, brl, toast } from '../ui.js';
import { abrirFormLancamento } from './form-lancamento.js';

const filtros = { tipo: '', categoria: '', origem: '', situacao: '', texto: '' };

// vindo do Painel: abre a lista já filtrada pela categoria clicada
window.addEventListener('filtro-categoria', (e) => {
  Object.keys(filtros).forEach((k) => filtros[k] = '');
  filtros.categoria = e.detail || '';
});

function origemTexto(l) {
  if (l.tipo === 'transferencia') return `🏦 ${contaPorId(l.conta_id)?.nome || '?'} → ${contaPorId(l.conta_destino_id)?.nome || '?'}`;
  if (l.tipo === 'pagamento_fatura') return `🏦 ${contaPorId(l.conta_id)?.nome || '?'} → 💳 ${cartaoPorId(l.cartao_id)?.nome || '?'}`;
  if (l.cartao_id) return `💳 ${cartaoPorId(l.cartao_id)?.nome || '?'}`;
  if (l.conta_id) return `🏦 ${contaPorId(l.conta_id)?.nome || '?'}${l.metodo ? ' · ' + l.metodo : ''}`;
  return '';
}

function rotuloTipo(l) {
  return { entrada: 'Receita', saida: 'Despesa', transferencia: 'Transferência', pagamento_fatura: 'Pagamento de fatura' }[l.tipo];
}

function passaFiltro(l) {
  if (mesDe(l.data_pagamento) !== S.mesRef) return false;
  if (filtros.tipo && l.tipo !== filtros.tipo) return false;
  if (filtros.categoria && l.categoria_id !== filtros.categoria) return false;
  if (filtros.origem) {
    const [q, id] = filtros.origem.split(':');
    if (q === 'conta' && l.conta_id !== id && l.conta_destino_id !== id) return false;
    if (q === 'cartao' && l.cartao_id !== id) return false;
  }
  if (filtros.situacao && l.situacao !== filtros.situacao) return false;
  if (filtros.texto) {
    const t = filtros.texto.toLowerCase();
    const alvo = `${l.descricao} ${nomeCategoria(l.categoria_id)} ${l.valor}`.toLowerCase();
    if (!alvo.includes(t)) return false;
  }
  return true;
}

export function render(el) {
  const lista = S.lancs.filter(passaFiltro)
    .sort((a, b) => b.data_movimento.localeCompare(a.data_movimento) || (b.created_at || '').localeCompare(a.created_at || ''));

  let ent = 0, sai = 0;
  for (const l of lista) {
    if (l.tipo === 'entrada') ent += Number(l.valor);
    else if (l.tipo === 'saida') sai += Number(l.valor);
  }

  // agrupar por data do movimento
  const dias = new Map();
  for (const l of lista) {
    if (!dias.has(l.data_movimento)) dias.set(l.data_movimento, []);
    dias.get(l.data_movimento).push(l);
  }

  const optCat = S.categorias.slice().sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome))
    .map((c) => `<option value="${c.id}" ${filtros.categoria === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.nome)}</option>`).join('');
  const optOrig = [
    ...S.contas.map((c) => [`conta:${c.id}`, `🏦 ${c.nome}`]),
    ...S.cartoes.map((c) => [`cartao:${c.id}`, `💳 ${c.nome}`]),
  ].map(([v, r]) => `<option value="${v}" ${filtros.origem === v ? 'selected' : ''}>${esc(r)}</option>`).join('');

  el.innerHTML = `
    <div class="topo-tela">
      <div class="nav-mes">
        <button class="btn-icone" data-mes="-1" aria-label="Mês anterior">‹</button>
        <h1>${nomeMes(S.mesRef)}</h1>
        <button class="btn-icone" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <button class="btn btn-primario" data-novo>+ Novo</button>
    </div>

    <details class="filtros" ${Object.values(filtros).some(Boolean) ? 'open' : ''}>
      <summary>Filtros ${Object.values(filtros).some(Boolean) ? '<span class="pill">ativos</span>' : ''}</summary>
      <div class="filtros-grade">
        <input type="search" placeholder="Buscar descrição…" data-f="texto" value="${esc(filtros.texto)}">
        <select data-f="tipo"><option value="">Todos os tipos</option>
          ${[['saida', 'Despesas'], ['entrada', 'Receitas'], ['transferencia', 'Transferências'], ['pagamento_fatura', 'Pagamentos de fatura']]
            .map(([v, r]) => `<option value="${v}" ${filtros.tipo === v ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <select data-f="categoria"><option value="">Todas as categorias</option>${optCat}</select>
        <select data-f="origem"><option value="">Todas as contas e cartões</option>${optOrig}</select>
        <select data-f="situacao"><option value="">Qualquer situação</option>
          ${[['pago', 'Pago'], ['recebido', 'Recebido'], ['pendente', 'Pendente']].map(([v, r]) => `<option value="${v}" ${filtros.situacao === v ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <button class="btn" data-limpar>Limpar filtros</button>
      </div>
    </details>

    <div class="resumo-linha">
      <div><small>Receitas</small><b class="pos">${brl(ent)}</b></div>
      <div><small>Despesas</small><b class="neg">${brl(sai)}</b></div>
      <div><small>Saldo</small><b class="${ent - sai >= 0 ? 'pos' : 'neg'}">${brl(arred(ent - sai))}</b></div>
      <div><small>Lançamentos</small><b>${lista.length}</b></div>
    </div>

    ${lista.length === 0 ? `
      <div class="vazio">
        <p>Nenhum lançamento em ${nomeMes(S.mesRef)}${Object.values(filtros).some(Boolean) ? ' com esses filtros' : ''}.</p>
        <button class="btn btn-primario" data-novo>Lançar agora</button>
      </div>` : ''}

    <div class="lista">
      ${[...dias.entries()].map(([dia, ls]) => `
        <div class="dia">${fmtData(dia)}</div>
        ${ls.map((l) => {
          const cat = categoriaPorId(l.categoria_id);
          const sinal = l.tipo === 'entrada' ? 'pos' : (l.tipo === 'saida' ? 'neg' : 'neutro');
          const icone = l.tipo === 'transferencia' ? '🔁' : (l.tipo === 'pagamento_fatura' ? '💳' : (cat?.emoji || '•'));
          const titulo = l.descricao || (cat ? cat.nome : rotuloTipo(l));
          const pend = l.situacao === 'pendente';
          return `
          <div class="item" data-id="${l.id}" tabindex="0" role="button">
            <div class="item-icone">${esc(icone)}</div>
            <div class="item-meio">
              <div class="item-titulo">${esc(titulo)} ${l.parcela_total ? `<span class="pill">${l.parcela_num}/${l.parcela_total}</span>` : ''}</div>
              <div class="item-sub">${esc(cat ? cat.nome : rotuloTipo(l))} · ${esc(origemTexto(l))}${l.data_pagamento !== l.data_movimento ? ` · paga em ${fmtData(l.data_pagamento)}` : ''}</div>
            </div>
            <div class="item-fim">
              <div class="valor ${sinal}">${l.tipo === 'saida' ? '−' : (l.tipo === 'entrada' ? '+' : '')}${brl(l.valor)}</div>
              ${l.cartao_id && l.tipo !== 'pagamento_fatura'
                ? `<span class="sit ${pend ? 'sit-pend' : 'sit-ok'}">${pend ? 'na fatura' : 'fatura paga'}</span>`
                : `<button class="sit ${pend ? 'sit-pend' : 'sit-ok'}" data-sit="${l.id}" title="Clique para alternar">${pend ? 'pendente' : (l.tipo === 'entrada' ? 'recebido' : 'pago')}</button>`}
            </div>
          </div>`;
        }).join('')}
      `).join('')}
    </div>`;

  const rerender = () => render(el);
  el.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => { S.mesRef = somarMesRef(S.mesRef, Number(b.dataset.mes)); rerender(); });
  el.querySelectorAll('[data-novo]').forEach((b) => b.onclick = () => abrirFormLancamento(null, rerender, { data: S.mesRef === hoje().slice(0, 7) ? undefined : S.mesRef + '-01' }));
  el.querySelectorAll('[data-f]').forEach((i) => {
    const ev = i.tagName === 'INPUT' ? 'input' : 'change';
    i.addEventListener(ev, () => {
      filtros[i.dataset.f] = i.value;
      if (i.tagName === 'INPUT') { clearTimeout(i._t); i._t = setTimeout(() => { rerender(); const n = el.querySelector('[data-f=texto]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); }
      else rerender();
    });
  });
  const lim = el.querySelector('[data-limpar]');
  if (lim) lim.onclick = () => { Object.keys(filtros).forEach((k) => filtros[k] = ''); rerender(); };

  el.querySelectorAll('.item').forEach((it) => {
    const abrir = () => abrirFormLancamento(S.lancs.find((l) => l.id === it.dataset.id), rerender);
    it.onclick = (e) => { if (!e.target.closest('[data-sit]')) abrir(); };
    it.onkeydown = (e) => { if (e.key === 'Enter') abrir(); };
  });
  el.querySelectorAll('[data-sit]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const l = S.lancs.find((x) => x.id === b.dataset.sit);
    const nova = l.situacao === 'pendente' ? (l.tipo === 'entrada' ? 'recebido' : 'pago') : 'pendente';
    b.disabled = true;
    try {
      await db.atualizar('lancamentos', l.id, { situacao: nova });
      l.situacao = nova;
      rerender();
    } catch (err) { toast(err.message, 'erro'); b.disabled = false; }
  });
}
