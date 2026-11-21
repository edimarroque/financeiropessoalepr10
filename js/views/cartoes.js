// Tela: Cartões de crédito (Análise Cartões da planilha) — faturas, limite e pagamento
import * as db from '../db.js';
import { S, recarregarLancamentos, contaPorId, nomeCategoria } from '../state.js';
import { fatura, vencimentosDoCartao, vencimentoAtual, limiteUsado, fmtData, hoje, arred } from '../calc.js';
import { esc, brl, barra, modal, toast, comCarregando, numero } from '../ui.js';
import { abrirFormLancamento } from './form-lancamento.js';
import { cartaoVisual } from '../components/visual.js';

const aberto = {}; // cartão id -> vencimento selecionado

// total gasto no cartão no ano corrente (pelo vencimento da fatura), como na Análise Cartões da planilha
function totalAno(c) {
  const y = String(new Date().getFullYear());
  return arred(S.lancs.filter((l) => l.cartao_id === c.id && l.data_pagamento.startsWith(y) && (l.tipo === 'saida' || l.tipo === 'entrada'))
    .reduce((s, l) => s + (l.tipo === 'saida' ? 1 : -1) * Number(l.valor), 0));
}

export function render(el) {
  const cartoes = S.cartoes.filter((c) => c.ativo);
  if (!cartoes.length) {
    el.innerHTML = `<div class="topo-tela"><h1>Cartões</h1></div>
      <div class="vazio"><p>Nenhum cartão cadastrado.</p><a class="btn btn-primario" href="#/cadastros">Cadastrar cartão</a></div>`;
    return;
  }

  el.innerHTML = `<div class="topo-tela"><h1>Cartões</h1></div>` + cartoes.map((c) => {
    const vencs = vencimentosDoCartao(c, S.lancs);
    const atual = vencimentoAtual(c);
    const sel = aberto[c.id] || atual;
    const fa = fatura(c, S.lancs, sel);
    const usado = limiteUsado(c, S.lancs);
    const disp = arred(Number(c.limite) - usado);
    return `
    <section class="cartao-bloco cartao-cc" data-cartao="${c.id}">
      <div class="cc-cabeca">
        ${cartaoVisual(c)}
        <div class="cc-info">
          <h2>${esc(c.nome)}</h2>
          <small class="dica">Fecha dia ${c.dia_fechamento} · vence dia ${c.dia_vencimento}${c.conta_pagamento_id ? ` · paga pela ${esc(contaPorId(c.conta_pagamento_id)?.nome || '')}` : ''}</small>
          <div class="cc-numeros">
            <div><small>Fatura atual</small><b>${brl(fatura(c, S.lancs, atual).total)}</b></div>
            <div><small>Disponível</small><b class="${disp >= 0 ? 'pos' : 'neg'}">${brl(disp)}</b></div>
            <div><small>No ano ${String(new Date().getFullYear())}</small><b>${brl(totalAno(c))}</b></div>
          </div>
          <div class="acoes"><button class="btn btn-primario" data-lancar="${c.id}">+ Compra</button><a class="btn" href="#/cadastros" data-editar-cartao="${c.id}">🎨 Personalizar</a></div>
        </div>
      </div>
      <div class="cc-limite">
        ${barra(usado, Number(c.limite))}
        <div class="lg-topo"><span>Usado <b>${brl(usado)}</b></span><span>Disponível <b class="${disp >= 0 ? 'pos' : 'neg'}">${brl(disp)}</b></span><span>Limite ${brl(c.limite)}</span></div>
      </div>

      <div class="cc-faturas">
        <label>Fatura
          <select data-venc="${c.id}">
            ${vencs.map((v) => {
              const f = fatura(c, S.lancs, v);
              const st = f.itens.length === 0 ? '' : (f.paga ? ' ✓ paga' : (v < hoje() ? ' ⚠ vencida' : (v === atual ? ' (atual)' : '')));
              return `<option value="${v}" ${v === sel ? 'selected' : ''}>Vence ${fmtData(v)} — ${brl(f.total)}${st}</option>`;
            }).join('')}
          </select>
        </label>
      </div>

      <div class="fatura-resumo">
        <div><small>Fechamento</small><b>${fmtData(fa.fechamento)}</b></div>
        <div><small>Total</small><b>${brl(fa.total)}</b></div>
        <div><small>Itens</small><b>${fa.itens.length}</b></div>
        <div>${fa.itens.length === 0 ? '' : fa.paga
          ? '<span class="sit sit-ok">Fatura paga</span>'
          : `<button class="btn btn-primario" data-pagar="${c.id}" data-v="${sel}">Pagar fatura</button>`}</div>
      </div>

      <div class="lista">
        ${fa.itens.map((l) => `
          <div class="item" data-id="${l.id}" tabindex="0" role="button">
            <div class="item-meio">
              <div class="item-titulo">${esc(l.descricao || nomeCategoria(l.categoria_id))} ${l.parcela_total ? `<span class="pill">${l.parcela_num}/${l.parcela_total}</span>` : ''}</div>
              <div class="item-sub">${fmtData(l.data_movimento)} · ${esc(nomeCategoria(l.categoria_id))}</div>
            </div>
            <div class="item-fim"><div class="valor ${l.tipo === 'entrada' ? 'pos' : ''}">${l.tipo === 'entrada' ? '−' : ''}${brl(l.valor)}</div></div>
          </div>`).join('') || '<p class="dica">Nenhum lançamento nesta fatura.</p>'}
      </div>
    </section>`;
  }).join('');

  const rerender = () => render(el);
  el.querySelectorAll('[data-venc]').forEach((s) => s.onchange = () => { aberto[s.dataset.venc] = s.value; rerender(); });
  el.querySelectorAll('[data-editar-cartao]').forEach((a) => a.onclick = () => { sessionStorage.setItem('abrirCartao', a.dataset.editarCartao); });
  el.querySelectorAll('[data-lancar]').forEach((b) => b.onclick = () => abrirFormLancamento(null, rerender, { tipo: 'saida', origem: `cartao:${b.dataset.lancar}` }));
  el.querySelectorAll('.item[data-id]').forEach((it) => it.onclick = () => abrirFormLancamento(S.lancs.find((l) => l.id === it.dataset.id), rerender));
  el.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => pagarFatura(S.cartoes.find((c) => c.id === b.dataset.pagar), b.dataset.v, rerender));
}

function pagarFatura(cartao, venc, aoSalvar) {
  const fa = fatura(cartao, S.lancs, venc);
  const pendentes = fa.itens.filter((l) => l.situacao === 'pendente');
  const contas = S.contas.filter((c) => c.ativo);
  modal(`Pagar fatura — ${cartao.nome}`, `
    <form class="form" id="f-pag">
      <p>Fatura com vencimento em <b>${fmtData(venc)}</b>: ${fa.itens.length} itens, total <b>${brl(fa.total)}</b>.</p>
      <div class="linha2">
        <label>Valor pago <input name="valor" inputmode="decimal" value="${String(fa.total).replace('.', ',')}"></label>
        <label>Data do pagamento <input type="date" name="data" value="${venc < hoje() ? venc : hoje()}"></label>
      </div>
      <label>Pago pela conta
        <select name="conta">${contas.map((c) => `<option value="${c.id}" ${c.id === cartao.conta_pagamento_id ? 'selected' : ''}>🏦 ${esc(c.nome)}</option>`).join('')}</select>
      </label>
      <p class="dica">O valor sai da conta escolhida e os ${pendentes.length} itens desta fatura ficam como pagos. Isso não conta como despesa de novo (as compras já foram contadas).</p>
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario" type="submit">Confirmar pagamento</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('#f-pag');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const valor = numero(f.valor.value);
      if (!(valor > 0)) return toast('Informe o valor pago.', 'erro');
      if (!f.conta.value) return toast('Escolha a conta.', 'erro');
      await comCarregando(f.querySelector('[type=submit]'), async () => {
        await db.inserir('lancamentos', [{
          tipo: 'pagamento_fatura', descricao: `Pagamento fatura ${cartao.nome} (venc. ${fmtData(venc)})`,
          valor: arred(valor), data_movimento: f.data.value, data_pagamento: f.data.value,
          conta_id: f.conta.value, cartao_id: cartao.id, metodo: 'Transferência', situacao: 'pago',
          chave_dedup: `pgto:${cartao.id}:${venc}`,
        }]);
        await db.atualizarVarios('lancamentos', pendentes.map((l) => l.id), { situacao: 'pago' });
        await recarregarLancamentos();
      });
      toast('Fatura paga.');
      fechar(); aoSalvar();
    };
  });
}
