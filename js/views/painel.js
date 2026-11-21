// Tela: Painel do mês (Análise Mensal + Painel Mensal + Dashboard da planilha)
import { S } from '../state.js';
import { resumoMes, evolucao, saldoConta, nomeMes, somarMesRef, GRUPOS_DESPESA, GRUPOS_RECEITA, META_GRUPO,
  fatura, vencimentoAtual, limiteUsado, fmtData, MESES, hoje, partes } from '../calc.js';
import { esc, brl, pct, barra } from '../ui.js';
import { abrirFormLancamento } from './form-lancamento.js';

function graficoEvolucao(serie) {
  const W = 640, H = 220, pe = 44, pb = 28, pt = 12;
  const max = Math.max(1, ...serie.map((s) => Math.max(s.receitas, s.despesas)));
  const passo = (W - pe - 8) / serie.length;
  const bw = Math.max(4, passo / 2 - 4);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const linhas = [0, 0.5, 1].map((f) => {
    const v = max * f;
    return `<line x1="${pe}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="eixo"/>
      <text x="${pe - 6}" y="${y(v) + 4}" text-anchor="end" class="rot">${v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : v.toFixed(0)}</text>`;
  }).join('');
  const barras = serie.map((s, i) => {
    const x = pe + i * passo + 2;
    const { m } = partes(s.ref + '-01');
    return `
      <g><title>${nomeMes(s.ref)}\nReceitas: ${brl(s.receitas)}\nDespesas: ${brl(s.despesas)}\nSaldo: ${brl(s.saldo)}</title>
        <rect x="${x}" y="${y(s.receitas)}" width="${bw}" height="${Math.max(0, H - pb - y(s.receitas))}" rx="2" class="b-rec"/>
        <rect x="${x + bw + 2}" y="${y(s.despesas)}" width="${bw}" height="${Math.max(0, H - pb - y(s.despesas))}" rx="2" class="b-desp"/>
        <text x="${x + bw}" y="${H - 8}" text-anchor="middle" class="rot ${s.ref === S.mesRef ? 'rot-atual' : ''}">${MESES[m - 1].slice(0, 3)}</text>
      </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Receitas e despesas dos últimos 12 meses">${linhas}${barras}</svg>
    <div class="legenda"><span><i class="b-rec"></i>Receitas</span><span><i class="b-desp"></i>Despesas</span></div>`;
}

export function render(el) {
  const r = resumoMes(S.lancs, S.categorias, S.mesRef);
  const saldoContas = S.contas.filter((c) => c.ativo).map((c) => ({ c, s: saldoConta(c, S.lancs, hoje()) }));
  const totalContas = saldoContas.reduce((t, x) => t + x.s, 0);

  const cats = [...r.porCategoria.values()];
  const despCats = cats.filter((c) => c.tipo === 'saida').sort((a, b) => b.total - a.total);
  const recCats = cats.filter((c) => c.tipo === 'entrada').sort((a, b) => b.total - a.total);
  const limiteTotal = S.categorias.filter((c) => c.tipo === 'despesa').reduce((t, c) => t + Number(c.valor_mensal || 0), 0);
  const previstoRec = S.categorias.filter((c) => c.tipo === 'receita').reduce((t, c) => t + Number(c.valor_mensal || 0), 0);
  const baseDistrib = r.receitas || r.despesas || 1;

  const semCadastro = S.categorias.length === 0;

  el.innerHTML = `
    <div class="topo-tela">
      <div class="nav-mes">
        <button class="btn-icone" data-mes="-1" aria-label="Mês anterior">‹</button>
        <h1>${nomeMes(S.mesRef)}</h1>
        <button class="btn-icone" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <button class="btn btn-primario" data-novo>+ Lançar</button>
    </div>

    ${semCadastro ? `<div class="aviso">Seu app está vazio. Comece em <a href="#/cadastros">Cadastros</a> e toque em <b>“Carregar cadastros da planilha”</b>.</div>` : ''}

    <section class="kpis">
      <div class="kpi"><small>Receitas</small><b class="pos">${brl(r.receitas)}</b><span>${brl(r.receitasRecebidas)} recebido${previstoRec ? ` · previsto ${brl(previstoRec)}` : ''}</span></div>
      <div class="kpi"><small>Despesas</small><b class="neg">${brl(r.despesas)}</b><span>${brl(r.despesasPagas)} pago${limiteTotal ? ` · limite ${brl(limiteTotal)}` : ''}</span></div>
      <div class="kpi"><small>Saldo do mês</small><b class="${r.saldo >= 0 ? 'pos' : 'neg'}">${brl(r.saldo)}</b><span>${r.pendentesQtd ? `${r.pendentesQtd} pendente(s): ${brl(r.pendentesValor)}` : 'nada pendente'}</span></div>
      <div class="kpi"><small>Saldo nas contas hoje</small><b class="${totalContas >= 0 ? 'pos' : 'neg'}">${brl(totalContas)}</b><span>${saldoContas.length} conta(s)</span></div>
    </section>

    <div class="grade2">
      <section class="cartao-bloco">
        <h2>Distribuição das despesas</h2>
        <p class="dica">Percentual sobre as receitas do mês. Meta: 50% essenciais · 30% não essenciais · 20% metas e investimentos.</p>
        ${GRUPOS_DESPESA.map((g) => {
          const v = r.porGrupo.get(g) || 0;
          const p = v / baseDistrib;
          return `<div class="linha-grupo">
            <div class="lg-topo"><span>${esc(g)}</span><span><b>${brl(v)}</b> · ${pct(p)} <small>(meta ${pct(META_GRUPO[g])})</small></span></div>
            ${barra(p, META_GRUPO[g], g === 'Metas / Investimentos' ? 'barra-meta' : '')}
          </div>`;
        }).join('')}
        ${r.porGrupo.get('Sem categoria') ? `<div class="linha-grupo"><div class="lg-topo"><span>Sem categoria</span><b>${brl(r.porGrupo.get('Sem categoria'))}</b></div></div>` : ''}
        <h3>Receitas por tipo</h3>
        ${GRUPOS_RECEITA.map((g) => `<div class="lg-topo"><span>${esc(g)}</span><b>${brl(r.porGrupo.get(g) || 0)}</b></div>`).join('')}
      </section>

      <section class="cartao-bloco">
        <h2>Últimos 12 meses</h2>
        ${graficoEvolucao(evolucao(S.lancs, S.categorias, S.mesRef, 12))}
      </section>
    </div>

    <div class="grade2">
      <section class="cartao-bloco">
        <h2>Despesas por categoria</h2>
        ${despCats.length === 0 ? '<p class="dica">Nenhuma despesa neste mês.</p>' : despCats.map((c) => {
          const lim = Number(c.categoria?.valor_mensal || 0);
          return `<a class="linha-cat" href="#/lancamentos" data-cat="${c.categoria?.id || ''}">
            <div class="lg-topo"><span>${esc(c.categoria ? `${c.categoria.emoji} ${c.categoria.nome}` : 'Sem categoria')} <small>(${c.qtd})</small></span>
              <span><b>${brl(c.total)}</b>${lim ? ` <small>de ${brl(lim)}</small>` : ''}</span></div>
            ${barra(c.total, lim || despCats[0].total)}
          </a>`;
        }).join('')}
      </section>

      <section class="cartao-bloco">
        <h2>Receitas por categoria</h2>
        ${recCats.length === 0 ? '<p class="dica">Nenhuma receita neste mês.</p>' : recCats.map((c) => `
          <a class="linha-cat" href="#/lancamentos" data-cat="${c.categoria?.id || ''}">
            <div class="lg-topo"><span>${esc(c.categoria ? `${c.categoria.emoji} ${c.categoria.nome}` : 'Sem categoria')} <small>(${c.qtd})</small></span><b class="pos">${brl(c.total)}</b></div>
          </a>`).join('')}

        <h2 class="mt">Contas</h2>
        ${saldoContas.map(({ c, s }) => `<div class="lg-topo"><span>🏦 ${esc(c.nome)}</span><b class="${s >= 0 ? '' : 'neg'}">${brl(s)}</b></div>`).join('') || '<p class="dica">Nenhuma conta cadastrada.</p>'}

        <h2 class="mt">Cartões — fatura atual</h2>
        ${S.cartoes.filter((c) => c.ativo).map((c) => {
          const v = vencimentoAtual(c);
          const fa = fatura(c, S.lancs, v);
          const usado = limiteUsado(c, S.lancs);
          return `<a class="linha-cat" href="#/cartoes"><div class="lg-topo"><span>💳 ${esc(c.nome)} <small>vence ${fmtData(v)}</small></span><b>${brl(fa.total)}</b></div>
            ${barra(usado, Number(c.limite))}<small class="dica">Limite usado ${brl(usado)} de ${brl(c.limite)}</small></a>`;
        }).join('') || '<p class="dica">Nenhum cartão cadastrado.</p>'}
      </section>
    </div>`;

  const rerender = () => render(el);
  el.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => { S.mesRef = somarMesRef(S.mesRef, Number(b.dataset.mes)); rerender(); });
  el.querySelector('[data-novo]').onclick = () => abrirFormLancamento(null, rerender);
  el.querySelectorAll('[data-cat]').forEach((a) => a.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('filtro-categoria', { detail: a.dataset.cat }));
  }));
}
