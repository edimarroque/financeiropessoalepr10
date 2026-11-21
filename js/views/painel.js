// Tela: Painel — Análise Mensal da planilha (resumo, contas, distribuição, calendário, cartões)
import { S, nomeUsuario } from '../state.js';
import { resumoIntervalo, saldoConta, diaAnterior, GRUPOS_DESPESA, GRUPOS_RECEITA, META_GRUPO, fatura,
  vencimentoAtual, limiteUsado, fmtData, hoje, periodoAnterior, intervalo, variacao, evolucao, MESES_CURTOS, partes } from '../calc.js';
import { esc, brl, pct, barra } from '../ui.js';
import { periodoHTML, ligarPeriodo, periodoAtual, rotuloPeriodo } from '../components/periodo.js';
import { calendarioHTML, ligarCalendario } from '../components/calendario.js';
import { barras, selo as seloVar } from '../components/graficos.js';
import { selo } from '../components/visual.js';
import { abrirFormLancamento } from './form-lancamento.js';
import { orcamentoCategorias } from '../calc.js';
import { emReais, moedaFmt } from '../servicos/cotacao.js';
import { modal, toast, comCarregando, numero } from '../ui.js';
import * as db from '../db.js';
import { recarregarCadastros, recarregarLancamentos } from '../state.js';

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function render(el) {
  const { ini, fim } = periodoAtual();
  const r = resumoIntervalo(S.lancs, S.categorias, ini, fim);
  const ant = periodoAnterior(S.ano, S.mes);
  const ia = intervalo(ant.ano, ant.mes);
  const rAnt = resumoIntervalo(S.lancs, S.categorias, ia.ini, ia.fim);
  const ateHoje = fim < hoje() ? fim : hoje();

  const contas = S.contas.filter((c) => c.ativo).map((c) => {
    const si = c.data_saldo > ini ? Number(c.saldo_inicial) : saldoConta(c, S.lancs, diaAnterior(ini));
    const sf = saldoConta(c, S.lancs, fim);
    return { c, si, sf, dif: sf - si };
  });
  const totIni = contas.reduce((s, x) => s + emReais(x.si, x.c.moeda), 0), totFim = contas.reduce((s, x) => s + emReais(x.sf, x.c.moeda), 0);
  const saldoHoje = S.contas.filter((c) => c.ativo).reduce((s, c) => s + emReais(saldoConta(c, S.lancs, hoje()), c.moeda), 0);

  const investido = r.porGrupo.get('Metas / Investimentos') || 0;
  const base = r.receitas || r.despesas || 1;
  const limiteTotal = S.categorias.filter((c) => c.tipo === 'despesa').reduce((t, c) => t + Number(c.valor_mensal || 0), 0) * (S.mes ? 1 : 12);
  const semCadastro = S.categorias.length === 0;

  // evolução: 12 meses terminando no mês escolhido (ou dezembro, no ano todo)
  const refFim = `${S.ano}-${String(S.mes || 12).padStart(2, '0')}`;
  const ev = evolucao(S.lancs, S.categorias, refFim, 12);

  // faturas que vencem no período
  const faturas = S.cartoes.filter((c) => c.ativo).map((c) => {
    const vencs = [...new Set(S.lancs.filter((l) => l.cartao_id === c.id && l.data_pagamento >= ini && l.data_pagamento <= fim && l.tipo !== 'pagamento_fatura').map((l) => l.data_pagamento))].sort();
    const lista = vencs.map((v) => fatura(c, S.lancs, v));
    return { c, lista, total: lista.reduce((s, f) => s + f.total, 0), aberto: lista.filter((f) => !f.paga).reduce((s, f) => s + f.total, 0), usado: limiteUsado(c, S.lancs) };
  });

  const orc = orcamentoCategorias(S.lancs, S.categorias, ini, fim, S.mes ? 1 : 12);
  const estouradas = orc.filter((o) => o.nivel === 'estourou'), atencao = orc.filter((o) => o.nivel === 'atencao');

  el.innerHTML = `
    <div class="topo-tela">
      <div><p class="ola">${saudacao()}, <b>${esc(nomeUsuario())}</b> 👋</p><h1>${esc(rotuloPeriodo())}</h1></div>
      <div class="topo-acoes">${periodoHTML()}<button class="btn btn-primario" data-novo>+ Lançar</button></div>
    </div>

    ${semCadastro ? `<div class="aviso">Seu app está vazio. Comece em <a href="#/cadastros">Cadastros</a> → <b>“Carregar cadastros da planilha”</b>.</div>` : ''}

    ${estouradas.length || atencao.length ? `<div class="aviso ${estouradas.length ? 'erro' : ''} alerta-orc">
      ${estouradas.length ? `🚨 <b>Limite estourado:</b> ${estouradas.map((o) => `${esc(o.categoria.emoji)} ${esc(o.categoria.nome)} (${Math.round(o.p * 100)}%)`).join(', ')}.` : ''}
      ${atencao.length ? ` ⚠️ <b>Acima de 80%:</b> ${atencao.map((o) => `${esc(o.categoria.emoji)} ${esc(o.categoria.nome)} (${Math.round(o.p * 100)}%)`).join(', ')}.` : ''}
      <a href="#orcamento" data-ir-orc>ver orçamento</a></div>` : ''}

    <section class="kpis">
      <div class="kpi kpi-rec"><small>Ganhos</small><b>${brl(r.receitas)}</b><span>${seloVar(variacao(r.receitas, rAnt.receitas))} vs. período anterior</span></div>
      <div class="kpi kpi-desp"><small>Gastos</small><b>${brl(r.despesas)}</b><span>${seloVar(variacao(r.despesas, rAnt.despesas), { inverso: true })} ${limiteTotal ? `· limite ${brl(limiteTotal)}` : 'vs. período anterior'}</span></div>
      <div class="kpi kpi-saldo"><small>Saldo do período</small><b class="${r.saldo >= 0 ? 'pos' : 'neg'}">${brl(r.saldo)}</b><span>${r.receitas ? `guardou ${pct(Math.max(0, r.saldo) / r.receitas)} dos ganhos` : '—'}</span></div>
      <div class="kpi kpi-contas"><small>Saldo nas contas hoje</small><b class="${saldoHoje >= 0 ? '' : 'neg'}">${brl(saldoHoje)}</b><span>${contas.length} conta(s)</span></div>
    </section>

    <div class="grade-painel">
      <section class="cartao-bloco">
        <h2>Resumo do período</h2>
        <div class="resumo-tabela">
          <div><span>💰 Ganhos</span><b class="pos">${brl(r.receitas)}</b></div>
          <div><span>💸 Gastos</span><b class="neg">${brl(r.despesas)}</b></div>
          <div><span>📈 Investido / metas</span><b>${brl(investido)}</b></div>
          <div><span>🐷 Guardado (saldo positivo)</span><b>${brl(Math.max(0, r.saldo))}</b></div>
          <div><span>⏳ A receber</span><b>${brl(r.aReceber)}</b></div>
          <div><span>🧾 A pagar</span><b>${brl(r.aPagar)}</b></div>
          <div class="total"><span>Saldo final</span><b class="${r.saldo >= 0 ? 'pos' : 'neg'}">${brl(r.saldo)}</b></div>
        </div>
      </section>

      <section class="cartao-bloco">
        <h2>Calendário de gastos</h2>
        ${calendarioHTML()}
      </section>

      <section class="cartao-bloco span2">
        <h2>Contas no período</h2>
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th>Conta</th><th class="num opc">Saldo inicial</th><th class="num">Saldo final</th><th class="num">Diferença</th><th class="num">Banco</th></tr></thead>
          <tbody>
            ${contas.map(({ c, si, sf, dif }) => `<tr><td><span class="com-selo">${selo(c, 26)} ${esc(c.nome)}${c.moeda === 'USD' ? '<span class="moeda-tag">US$</span>' : ''}</span></td><td class="num opc">${moedaFmt(si, c.moeda)}</td><td class="num"><b>${moedaFmt(sf, c.moeda)}</b>${c.moeda === 'USD' ? `<br><small>≈ ${brl(emReais(sf, 'USD'))}</small>` : ''}</td><td class="num ${dif >= 0 ? 'pos' : 'neg'}">${dif >= 0 ? '+' : ''}${moedaFmt(dif, c.moeda)}</td><td class="num"><button class="btn btn-peq ${c.conferido_em === hoje() ? 'conferido' : ''}" data-conferir="${c.id}" title="${c.conferido_em ? `Conferido em ${fmtData(c.conferido_em)}` : 'Comparar com o saldo do banco'}">${c.conferido_em === hoje() ? '✓<span class="txt-opc"> ok</span>' : '⚖️<span class="txt-opc"> Conferir</span>'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="dica">Nenhuma conta.</td></tr>'}
          </tbody>
          ${contas.length > 1 ? `<tfoot><tr><td>Total</td><td class="num opc">${brl(totIni)}</td><td class="num"><b>${brl(totFim)}</b></td><td class="num ${totFim - totIni >= 0 ? 'pos' : 'neg'}">${totFim - totIni >= 0 ? '+' : ''}${brl(totFim - totIni)}</td><td></td></tr></tfoot>` : ''}
        </table></div>
        ${fim > hoje() ? `<p class="dica">Saldo final considera só o que já foi pago/recebido até ${fmtData(ateHoje)}; pendências aparecem em “A receber” e “A pagar”.</p>` : ''}
      </section>

      <section class="cartao-bloco">
        <h2>Distribuição dos gastos</h2>
        <p class="dica">Sobre os ganhos do período. Ideal: 50% essenciais · 30% não essenciais · 20% metas.</p>
        ${GRUPOS_DESPESA.map((g) => {
          const v = r.porGrupo.get(g) || 0, p = v / base;
          return `<div class="linha-grupo"><div class="lg-topo"><span>${esc(g)}</span><span><b>${brl(v)}</b> · ${pct(p)} <small>ideal ${pct(META_GRUPO[g])}</small></span></div>
            ${barra(p, META_GRUPO[g], g === 'Metas / Investimentos' ? 'barra-meta' : '')}</div>`;
        }).join('')}
        <h3>Ganhos por tipo</h3>
        ${GRUPOS_RECEITA.map((g) => `<div class="lg-topo"><span>${esc(g)}</span><b>${brl(r.porGrupo.get(g) || 0)}</b></div>`).join('')}
      </section>

      <section class="cartao-bloco">
        <h2>Cartões — faturas do período</h2>
        ${faturas.map(({ c, lista, total, aberto, usado }) => `
          <a class="linha-cartao" href="#/cartoes">
            ${selo(c, 30)}
            <div class="lc-meio"><b>${esc(c.nome)}</b><small>${lista.length ? lista.map((f) => `vence ${fmtData(f.venc)}${f.paga ? ' ✓' : ''}`).join(' · ') : `próxima: ${fmtData(vencimentoAtual(c))}`}</small>
              ${barra(usado, Number(c.limite))}<small>limite usado ${brl(usado)} de ${brl(c.limite)}</small></div>
            <div class="lc-fim"><b>${brl(total)}</b>${aberto ? `<small class="neg">em aberto ${brl(aberto)}</small>` : lista.length ? '<small class="pos">paga</small>' : ''}</div>
          </a>`).join('') || '<p class="dica">Nenhum cartão cadastrado.</p>'}
      </section>

      <section class="cartao-bloco span2" id="orcamento">
        <div class="cab-lista"><h2>Orçamento por categoria</h2><a class="btn btn-peq" href="#/cadastros" data-abrir-cats>Definir limites</a></div>
        ${orc.length ? `<div class="orc-grade">${orc.map((o) => `
          <div class="orc-item orc-${o.nivel}">
            <div class="lg-topo"><span>${esc(o.categoria.emoji)} ${esc(o.categoria.nome)}</span><span><b>${brl(o.gasto)}</b> <small>de ${brl(o.limite)}</small></span></div>
            <div class="barra"><div style="width:${Math.min(100, o.p * 100).toFixed(1)}%"></div></div>
            <small>${o.nivel === 'estourou' ? `🚨 passou ${brl(o.gasto - o.limite)}` : o.nivel === 'atencao' ? `⚠️ ${Math.round(o.p * 100)}% — restam ${brl(o.limite - o.gasto)}` : `${Math.round(o.p * 100)}% — restam ${brl(o.limite - o.gasto)}`}</small>
          </div>`).join('')}</div>` : '<p class="dica">Defina um <b>limite mensal</b> nas categorias de despesa (Cadastros) para ver alertas ao chegar em 80% e 100%.</p>'}
      </section>

      <section class="cartao-bloco span2">
        <div class="cab-lista"><h2>Últimos 12 meses</h2><a class="btn btn-peq" href="#/dashboards">Ver dashboards →</a></div>
        ${barras(ev.map((x) => { const { y, m } = partes(x.ref + '-01'); return `${MESES_CURTOS[m - 1]}${m === 1 ? '/' + String(y).slice(2) : ''}`; }),
          [{ nome: 'Ganhos', cor: 'var(--verde)', valores: ev.map((x) => x.receitas) }, { nome: 'Gastos', cor: 'var(--vermelho)', valores: ev.map((x) => x.despesas) }],
          { destaque: S.mes ? 11 : -1 })}
      </section>
    </div>`;

  const rerender = () => render(el);
  ligarPeriodo(el, rerender);
  ligarCalendario(el, rerender);
  el.querySelector('[data-novo]').onclick = () => abrirFormLancamento(null, rerender);
  el.querySelectorAll('[data-conferir]').forEach((b) => b.onclick = () => conferirSaldo(S.contas.find((c) => c.id === b.dataset.conferir), rerender));
  el.querySelector('[data-ir-orc]')?.addEventListener('click', (e) => { e.preventDefault(); el.querySelector('#orcamento').scrollIntoView({ behavior: 'smooth' }); });
  el.querySelector('[data-abrir-cats]').onclick = () => sessionStorage.setItem('abaCadastros', 'despesa');
}

/** Conferir o saldo do app com o saldo que aparece no banco e, se quiser, lançar o ajuste */
export function conferirSaldo(c, aoFim) {
  const noApp = saldoConta(c, S.lancs, hoje());
  modal(`Conferir saldo — ${c.nome}`, `
    <form class="form">
      <div class="resumo-tabela"><div><span>Saldo no app hoje</span><b>${moedaFmt(noApp, c.moeda)}</b></div></div>
      ${c.conferido_em ? `<p class="dica">Última conferência: ${fmtData(c.conferido_em)} (${brl(c.conferido_saldo)}).</p>` : ''}
      <label>Saldo que aparece no banco agora <input name="real" inputmode="decimal" placeholder="0,00" required></label>
      <p class="conf-dif" data-dif></p>
      <p class="dica">Se houver diferença, confira lançamentos que faltam (ou duplicados) antes de ajustar. O ajuste cria um lançamento “Ajuste de saldo”, sem categoria.</p>
      <div class="acoes"><button type="button" class="btn" data-so>Só registrar conferência</button><span class="espaco"></span><button class="btn btn-primario" data-ajustar disabled>Lançar ajuste</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = (e) => e.preventDefault();
    const dif = () => { const v = numero(f.real.value); return Number.isFinite(v) ? Math.round((v - noApp) * 100) / 100 : NaN; };
    f.real.oninput = () => {
      const d = dif(), out = el.querySelector('[data-dif]');
      if (!Number.isFinite(d)) { out.textContent = ''; return; }
      out.className = `conf-dif ${Math.abs(d) < 0.01 ? 'pos' : 'neg'}`;
      out.textContent = Math.abs(d) < 0.01 ? '✅ Saldo bate com o banco!' : `Diferença: ${d > 0 ? '+' : ''}${moedaFmt(d, c.moeda)} (${d > 0 ? 'o banco tem mais' : 'o banco tem menos'} que o app)`;
      el.querySelector('[data-ajustar]').disabled = Math.abs(d) < 0.01;
    };
    const registrar = async (b, ajuste) => {
      const real = numero(f.real.value);
      if (!Number.isFinite(real)) return toast('Informe o saldo do banco.', 'erro');
      const d = dif();
      await comCarregando(b, async () => {
        if (ajuste && Math.abs(d) >= 0.01) {
          await db.inserir('lancamentos', [{ tipo: d > 0 ? 'entrada' : 'saida', valor: emReais(Math.abs(d), c.moeda), conta_id: c.id,
            ...(c.moeda === 'USD' ? { moeda: 'USD', valor_moeda: Math.abs(d), cotacao: emReais(1, 'USD') } : {}), data_movimento: hoje(), data_pagamento: hoje(),
            descricao: 'Ajuste de saldo (conferência com o banco)', metodo: 'Outro', situacao: d > 0 ? 'recebido' : 'pago', origem: 'ajuste', categoria_id: null }]);
          await recarregarLancamentos();
        }
        await db.atualizar('contas', c.id, { conferido_em: hoje(), conferido_saldo: real });
        await recarregarCadastros();
      });
      toast(ajuste ? 'Ajuste lançado e conferência registrada.' : 'Conferência registrada.'); fechar(); aoFim && aoFim();
    };
    el.querySelector('[data-so]').onclick = (e) => registrar(e.currentTarget, false);
    el.querySelector('[data-ajustar]').onclick = (e) => { e.preventDefault(); registrar(e.currentTarget, true); };
  });
}
