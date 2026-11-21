// Tela: Importar (fatura PDF, extrato OFX, CSV de banco e migração da planilha)
import * as db from '../db.js';
import { S, recarregarLancamentos, recarregarLotes, cartaoPorId, contaPorId } from '../state.js';
import { hoje, fmtData, somarMeses, vencimentosDoCartao, vencimentoAtual, fechamentoDoVencimento, arred } from '../calc.js';
import { esc, brl, toast, confirmar, comCarregando } from '../ui.js';
import { lerCSV, lerOFX, textoDoPDF, itensDaFatura, decodificar, normDesc, chavesDesc } from '../import/parsers.js';

// estado da importação em andamento
let imp = null;

const ORIGEM_ROT = { fatura_pdf: '📄 Fatura PDF', ofx: '🏦 Extrato OFX', csv: '📑 CSV', planilha: '📊 Planilha/CSV do app' };

export function render(el) {
  if (imp && imp.etapa === 'previa') return renderPrevia(el);
  renderInicio(el);
}

// =====================================================================
// Etapa 1 — escolher arquivo e destino
// =====================================================================
function renderInicio(el) {
  const cartoes = S.cartoes.filter((c) => c.ativo), contas = S.contas.filter((c) => c.ativo);
  el.innerHTML = `
    <div class="topo-tela"><h1>Importar</h1></div>
    <section class="cartao-bloco">
      <h2>1. Escolha o arquivo</h2>
      <p class="dica">PDF da fatura do cartão, extrato OFX da conta ou CSV. Nada é gravado antes de você conferir a prévia.</p>
      <label class="arquivo">
        <input type="file" accept=".pdf,.ofx,.csv,.txt,application/pdf,text/csv" data-arquivo>
        <span>📎 Selecionar arquivo</span>
      </label>
      <p class="dica" data-nome></p>
    </section>

    <section class="cartao-bloco" data-destino hidden>
      <h2>2. Para onde vão os lançamentos</h2>
      <div class="form">
        <label data-bloco="tipo-dest">Destino
          <select name="destino">
            <optgroup label="Cartões (fatura)">${cartoes.map((c) => `<option value="cartao:${c.id}">💳 ${esc(c.nome)}</option>`).join('')}</optgroup>
            <optgroup label="Contas (extrato)">${contas.map((c) => `<option value="conta:${c.id}">🏦 ${esc(c.nome)}</option>`).join('')}</optgroup>
          </select>
        </label>
        <div class="linha2" data-bloco="fatura">
          <label>Vencimento desta fatura <select name="venc"></select></label>
          <label>Senha do PDF (se tiver) <input name="senha" type="password" autocomplete="off" placeholder="opcional"></label>
        </div>
        <label class="check" data-bloco="fatura"><input type="checkbox" name="futuras" checked> Criar as parcelas futuras das compras parceladas (ex.: 6/10 cria 7/10 até 10/10)</label>
        <label class="check" data-bloco="fatura"><input type="checkbox" name="paga"> Esta fatura já foi paga</label>
        <p class="dica" data-bloco="app">Arquivo no formato do app (exportação ou migração da planilha): cada linha já traz conta, cartão e categoria.</p>
        <div class="acoes"><span class="espaco"></span><button class="btn btn-primario" data-ler>Ler arquivo e ver prévia</button></div>
      </div>
    </section>

    <section class="cartao-bloco">
      <h2>Importações feitas</h2>
      ${S.lotes.length ? `<div class="lista">${S.lotes.map((l) => `
        <div class="item item-estatico">
          <div class="item-icone">${ORIGEM_ROT[l.origem]?.slice(0, 2) || '📥'}</div>
          <div class="item-meio"><div class="item-titulo">${esc(l.descricao || ORIGEM_ROT[l.origem] || l.origem)}</div>
            <div class="item-sub">${new Date(l.created_at).toLocaleString('pt-BR')} · ${l.quantidade} lançamento(s) · ${brl(l.total)}</div></div>
          <div class="item-fim"><button class="btn btn-perigo" data-desfazer="${l.id}">Desfazer</button></div>
        </div>`).join('')}</div>` : '<p class="dica">Nenhuma importação ainda.</p>'}
    </section>`;

  const arq = el.querySelector('[data-arquivo]');
  const dest = el.querySelector('[data-destino]');
  const selDest = el.querySelector('[name=destino]');
  const selVenc = el.querySelector('[name=venc]');
  let arquivo = null, ext = '';

  function opcoesVenc() {
    const [q, id] = selDest.value.split(':');
    if (q !== 'cartao') return;
    const c = cartaoPorId(id);
    const atual = vencimentoAtual(c);
    const lista = new Set([somarMeses(atual, 1), atual, ...vencimentosDoCartao(c, S.lancs)]);
    for (let i = 1; i <= 6; i++) lista.add(somarMeses(atual, -i));
    // sugestão: a fatura fechada mais recente (é a que já tem PDF disponível)
    const sugerido = fechamentoDoVencimento(atual, c) <= hoje() ? atual : somarMeses(atual, -1);
    selVenc.innerHTML = [...lista].sort().reverse().map((v) => `<option value="${v}" ${v === sugerido ? 'selected' : ''}>${fmtData(v)}${v === atual ? ' (atual)' : ''}</option>`).join('');
    atualizarPaga();
  }
  function atualizarPaga() { el.querySelector('[name=paga]').checked = selVenc.value && selVenc.value < hoje(); }
  function visibilidade() {
    const q = selDest.value.split(':')[0];
    const app = ext === 'csv-app';
    el.querySelectorAll('[data-bloco=fatura]').forEach((x) => x.hidden = app || q !== 'cartao' || ext === 'ofx');
    el.querySelector('[data-bloco=tipo-dest]').hidden = app;
    el.querySelector('[data-bloco=app]').hidden = !app;
    el.querySelector('[name=senha]').closest('label').hidden = ext !== 'pdf';
  }

  arq.onchange = async () => {
    arquivo = arq.files[0];
    if (!arquivo) return;
    const nome = arquivo.name.toLowerCase();
    ext = nome.endsWith('.pdf') ? 'pdf' : nome.endsWith('.ofx') ? 'ofx' : 'csv';
    if (ext === 'csv') {
      const t = decodificar(await arquivo.arrayBuffer());
      if (/data da movimenta/i.test(t.split(/\r?\n/)[0] || '')) ext = 'csv-app';
    }
    el.querySelector('[data-nome]').textContent = `Arquivo: ${arquivo.name} (${(arquivo.size / 1024).toFixed(0)} KB)`;
    // sugere destino pelo tipo do arquivo
    if (ext === 'ofx') { const o = selDest.querySelector('option[value^="conta:"]'); if (o) selDest.value = o.value; }
    if (ext === 'pdf') { const o = selDest.querySelector('option[value^="cartao:"]'); if (o) selDest.value = o.value; }
    dest.hidden = false;
    opcoesVenc(); visibilidade();
  };
  selDest.onchange = () => { opcoesVenc(); visibilidade(); };
  selVenc.onchange = atualizarPaga;

  el.querySelector('[data-ler]').onclick = async (e) => {
    if (!arquivo) return toast('Escolha um arquivo.', 'erro');
    const [q, id] = selDest.value.split(':');
    const cfg = {
      arquivo: arquivo.name, ext, destTipo: ext === 'csv-app' ? 'app' : q, destId: id,
      venc: selVenc.value, futuras: el.querySelector('[name=futuras]').checked, paga: el.querySelector('[name=paga]').checked,
    };
    if (cfg.destTipo !== 'app' && !id) return toast('Escolha o destino.', 'erro');
    await comCarregando(e.currentTarget, async () => {
      const buf = await arquivo.arrayBuffer();
      let lido;
      if (ext === 'pdf') {
        if (q !== 'cartao') throw new Error('PDF de fatura precisa ter um cartão como destino.');
        const linhas = await textoDoPDF(buf, el.querySelector('[name=senha]').value);
        lido = itensDaFatura(linhas, cfg.venc);
        lido.textoBruto = linhas;
      } else if (ext === 'ofx') lido = lerOFX(decodificar(buf));
      else lido = lerCSV(decodificar(buf));
      if (lido.formato === 'app') cfg.destTipo = 'app';
      if (!lido.linhas.length) throw new Error(lido.avisos[0] || 'Nenhuma linha encontrada no arquivo.');
      imp = { etapa: 'previa', cfg, lido, edits: new Map() };
      preparar();
    });
    render(el);
  };

  el.querySelectorAll('[data-desfazer]').forEach((b) => b.onclick = () => desfazer(S.lotes.find((l) => l.id === b.dataset.desfazer), b, () => render(el)));
}

// =====================================================================
// Preparação: transforma o que foi lido em lançamentos, sugere categoria e marca duplicados
// =====================================================================
function indiceCategorias() {
  const idx = new Map(); // chave -> Map(categoria_id -> contagem)
  for (const l of S.lancs) {
    if (!l.categoria_id || (l.tipo !== 'saida' && l.tipo !== 'entrada')) continue;
    for (const k of chavesDesc(l.descricao)) {
      if (!idx.has(k)) idx.set(k, new Map());
      const m = idx.get(k);
      m.set(l.categoria_id, (m.get(l.categoria_id) || 0) + 1);
    }
  }
  return idx;
}

function sugerirCategoria(idx, desc, tipo) {
  const tipoCat = tipo === 'entrada' ? 'receita' : 'despesa';
  for (const k of chavesDesc(desc)) {
    const m = idx.get(k);
    if (!m) continue;
    const ordenado = [...m.entries()].filter(([id]) => S.categorias.find((c) => c.id === id && c.tipo === tipoCat)).sort((a, b) => b[1] - a[1]);
    if (ordenado.length) return ordenado[0][0];
  }
  return null;
}

const porNome = (lista, nome, limpar = (s) => s) => {
  const n = limpar(normDesc(nome));
  if (!n) return null;
  return lista.find((x) => limpar(normDesc(x.nome)) === n) || null;
};
const limparCartao = (s) => s.replace(/^CREDITO /, '');
const centavos = (v) => Math.round(Number(v) * 100);

function metodoPorDescricao(d) {
  const s = normDesc(d);
  if (/\bPIX\b/.test(s)) return 'Pix';
  if (/BOLETO|\bPAG\b/.test(s)) return 'Boleto';
  if (/TED|DOC|TRANSF/.test(s)) return 'Transferência';
  return 'Débito';
}

function pareceFatura(d) {
  return /FATURA|BOLETO BANCO XP|PAG.*CARTAO|CARTAO.*PAG/.test(normDesc(d));
}

function preparar() {
  const { cfg, lido, edits } = imp;
  const idx = indiceCategorias();
  const existentes = new Set(S.lancs.map((l) => l.chave_dedup).filter(Boolean));
  const seq = new Map(); // para manter duas compras iguais no mesmo dia
  const comSeq = (k) => { const n = (seq.get(k) || 0) + 1; seq.set(k, n); return n > 1 ? `${k}#${n}` : k; };
  const linhas = [];
  const faltando = { categoria: new Map(), conta: new Map(), cartao: new Map() };

  for (const r of lido.linhas) {
    const e = edits.get(r.ref) || {};
    let L;
    if (cfg.destTipo === 'app') {
      const cat = r.categoria ? porNome(S.categorias, r.categoria) : null;
      const conta = r.conta ? porNome(S.contas, r.conta) : null;
      const destino = r.conta_destino ? porNome(S.contas, r.conta_destino) : null;
      const cartao = r.cartao ? porNome(S.cartoes, r.cartao, limparCartao) : null;
      const erros = [];
      if (r.categoria && !cat && r.tipo !== 'pagamento_fatura' && r.tipo !== 'transferencia') { erros.push(`categoria “${r.categoria}”`); faltando.categoria.set(r.categoria.trim(), (faltando.categoria.get(r.categoria.trim()) || 0) + 1); }
      if (r.conta && !conta) { erros.push(`conta “${r.conta}”`); faltando.conta.set(r.conta, (faltando.conta.get(r.conta) || 0) + 1); }
      if (r.cartao && !cartao) { erros.push(`cartão “${r.cartao}”`); faltando.cartao.set(r.cartao, (faltando.cartao.get(r.cartao) || 0) + 1); }
      const viaCartao = !!cartao && r.tipo !== 'pagamento_fatura';
      if (!viaCartao && !conta && !erros.length) erros.push('sem conta nem cartão');
      if (r.tipo === 'pagamento_fatura' && !cartao) erros.push('pagamento de fatura sem cartão');
      const sitPadrao = viaCartao ? 'pendente' : (r.data_pagamento > hoje() ? 'pendente' : (r.tipo === 'entrada' ? 'recebido' : 'pago'));
      L = {
        ref: r.ref, data_movimento: r.data_movimento, data_pagamento: r.data_pagamento, tipo: r.tipo,
        descricao: r.descricao, valor: arred(r.valor),
        categoria_id: e.categoria_id !== undefined ? e.categoria_id : (cat?.id || null),
        conta_id: viaCartao ? null : (conta?.id || null), conta_destino_id: destino?.id || null,
        cartao_id: cartao?.id || null, metodo: viaCartao ? 'Crédito' : (r.metodo || ''),
        parcela_num: r.parcela_num, parcela_total: r.parcela_total,
        situacao: r.situacao || sitPadrao, erro: erros.length ? `Não encontrei ${erros.join(', ')}` : null,
      };
      L.chave = comSeq(`app:${L.data_movimento}:${L.data_pagamento}:${L.tipo}:${centavos(L.valor)}:${normDesc(L.descricao)}:${L.parcela_num || ''}/${L.parcela_total || ''}`);
    } else if (cfg.destTipo === 'cartao') {
      const cartao = cartaoPorId(cfg.destId);
      const sinal = r.sinal !== undefined ? r.sinal : -(r.sinalBruto || 1); // CSV de fatura: positivo = compra
      const tipo = e.tipo || (sinal > 0 ? 'entrada' : 'saida');
      L = {
        ref: r.ref, data_movimento: r.data, data_pagamento: cfg.venc, tipo, descricao: r.descricao, valor: arred(r.valor),
        categoria_id: null, conta_id: null, conta_destino_id: null, cartao_id: cartao.id, metodo: 'Crédito',
        parcela_num: r.parcela_num, parcela_total: r.parcela_total, situacao: cfg.paga ? 'pago' : 'pendente', erro: null,
      };
      L.chave = r.parcela_total
        ? `parc:${cartao.id}:${normDesc(r.descricao)}:${centavos(r.valor)}:${r.parcela_num}/${r.parcela_total}`
        : comSeq(`cc:${cartao.id}:${cfg.venc}:${r.data}:${centavos(r.valor)}:${normDesc(r.descricao)}`);
      if (r.ignorarSugerido && e.incluir === undefined) e.incluirPadrao = false;
    } else {
      const conta = contaPorId(cfg.destId);
      const sinal = r.sinal !== undefined ? r.sinal : (r.sinalBruto || -1);
      const tipoPadrao = sinal > 0 ? 'entrada' : (pareceFatura(r.descricao) ? 'pagamento_fatura' : 'saida');
      const tipo = e.tipo || tipoPadrao;
      let cartaoPag = null;
      if (tipo === 'pagamento_fatura') {
        const d = normDesc(r.descricao);
        cartaoPag = e.cartao_id || (S.cartoes.find((c) => d.includes(limparCartao(normDesc(c.nome)).replace(/^CARTAO /, ''))) || S.cartoes[0])?.id || null;
      }
      L = {
        ref: r.ref, data_movimento: r.data, data_pagamento: r.data, tipo, descricao: r.descricao, valor: arred(r.valor),
        categoria_id: null, conta_id: conta.id, conta_destino_id: null, cartao_id: cartaoPag,
        metodo: tipo === 'pagamento_fatura' ? 'Boleto' : metodoPorDescricao(r.descricao),
        parcela_num: null, parcela_total: null,
        situacao: r.data > hoje() ? 'pendente' : (tipo === 'entrada' ? 'recebido' : 'pago'), erro: null,
      };
      L.chave = r.fitid ? `ofx:${conta.id}:${r.fitid}:${r.data}:${centavos(r.valor)}` : comSeq(`ct:${conta.id}:${r.data}:${centavos(r.valor)}:${normDesc(r.descricao)}`);
    }

    // categoria sugerida pelo histórico
    if (L.tipo === 'entrada' || L.tipo === 'saida') {
      if (e.categoria_id !== undefined) L.categoria_id = e.categoria_id;
      else if (!L.categoria_id) { L.categoria_id = sugerirCategoria(idx, L.descricao, L.tipo); L.sugerida = !!L.categoria_id; }
    } else L.categoria_id = null;

    // duplicados: mesma chave já gravada, ou lançamento manual muito parecido
    L.dup = existentes.has(L.chave);
    if (!L.dup) {
      const k0 = normDesc(L.descricao);
      L.parecido = S.lancs.some((x) => !x.chave_dedup && x.tipo === L.tipo && centavos(x.valor) === centavos(L.valor) &&
        x.data_movimento === L.data_movimento && (x.cartao_id || null) === (L.cartao_id || null) && (L.cartao_id || x.conta_id === L.conta_id) &&
        (!k0 || normDesc(x.descricao) === k0 || normDesc(x.descricao).split(' ')[0] === k0.split(' ')[0]));
    }
    const incluirPadrao = e.incluirPadrao !== undefined ? e.incluirPadrao : !(L.dup || L.parecido || L.erro);
    L.incluir = L.erro || L.dup ? false : (e.incluir !== undefined ? e.incluir : incluirPadrao);
    linhas.push(L);

    // parcelas futuras (só fatura de cartão)
    if (cfg.destTipo === 'cartao' && cfg.futuras && L.tipo === 'saida' && L.parcela_total && L.parcela_num < L.parcela_total) {
      for (let k = L.parcela_num + 1; k <= L.parcela_total; k++) {
        const F = {
          ...L, ref: `${L.ref}-f${k}`, futura: true, parcela_num: k, data_pagamento: somarMeses(cfg.venc, k - L.parcela_num), situacao: 'pendente',
          chave: `parc:${L.cartao_id}:${normDesc(L.descricao)}:${centavos(L.valor)}:${k}/${L.parcela_total}`,
        };
        F.dup = existentes.has(F.chave);
        F.parecido = false;
        F.incluir = L.incluir && !F.dup;
        linhas.push(F);
      }
    }
  }
  imp.linhas = linhas;
  imp.faltando = faltando;
}

// =====================================================================
// Etapa 2 — prévia
// =====================================================================
function opcoesCat(tipo, sel) {
  const t = tipo === 'entrada' ? 'receita' : 'despesa';
  return `<option value="">A classificar</option>` + S.categorias.filter((c) => c.tipo === t && (c.ativo || c.id === sel))
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.nome)}</option>`).join('');
}

function renderPrevia(el) {
  const { cfg, lido, linhas } = imp;
  const sel = linhas.filter((l) => l.incluir);
  const tot = (arr, f) => arred(arr.filter(f).reduce((s, l) => s + Number(l.valor), 0));
  const principais = linhas.filter((l) => !l.futura);
  const totalArquivo = arred(principais.filter((l) => l.incluir || l.dup).reduce((s, l) => s + (l.tipo === 'entrada' ? -1 : 1) * l.valor, 0));
  const saidas = tot(sel, (l) => l.tipo === 'saida'), entradas = tot(sel, (l) => l.tipo === 'entrada'), pagFat = tot(sel, (l) => l.tipo === 'pagamento_fatura');
  const semCat = sel.filter((l) => (l.tipo === 'entrada' || l.tipo === 'saida') && !l.categoria_id).length;
  const dups = linhas.filter((l) => l.dup).length, parec = linhas.filter((l) => l.parecido).length, erros = linhas.filter((l) => l.erro).length;
  const futuras = sel.filter((l) => l.futura).length;
  const destino = cfg.destTipo === 'cartao' ? `💳 ${cartaoPorId(cfg.destId).nome} · fatura de ${fmtData(cfg.venc)}`
    : cfg.destTipo === 'conta' ? `🏦 ${contaPorId(cfg.destId).nome}` : 'Contas e cartões indicados no arquivo';

  let conferencia = '';
  if (lido.totalDeclarado != null) {
    const ok = Math.abs(lido.totalDeclarado - totalArquivo) < 0.02;
    conferencia = `<div class="aviso ${ok ? 'ok' : ''}">${ok ? '✅' : '⚠️'} Total da fatura no PDF: <b>${brl(lido.totalDeclarado)}</b> · total marcado: <b>${brl(totalArquivo)}</b>${ok ? '' : ' — confira se faltou alguma linha (pagamentos e encargos podem explicar a diferença).'}</div>`;
  }

  el.innerHTML = `
    <div class="topo-tela"><h1>Prévia da importação</h1><button class="btn" data-voltar>← Voltar</button></div>
    <section class="cartao-bloco">
      <p><b>${esc(cfg.arquivo)}</b> → ${esc(destino)}</p>
      <div class="resumo-linha">
        <div><small>Selecionados</small><b>${sel.length} de ${linhas.length}</b></div>
        <div><small>Despesas${futuras ? ' (c/ parcelas futuras)' : ''}</small><b class="neg">${brl(saidas)}</b></div>
        <div><small>Receitas / estornos</small><b class="pos">${brl(entradas)}</b></div>
        <div><small>${pagFat ? 'Pagamentos de fatura' : 'Total marcado'}</small><b>${brl(pagFat || totalArquivo)}</b></div>
      </div>
      ${conferencia}
      <ul class="lista-simples">
        ${dups ? `<li>🔁 ${dups} já importado(s) antes — ficam de fora.</li>` : ''}
        ${parec ? `<li>⚠️ ${parec} parecido(s) com lançamento feito à mão — desmarcados; marque se não for o mesmo.</li>` : ''}
        ${erros ? `<li>❌ ${erros} com erro (veja abaixo) — ficam de fora.</li>` : ''}
        ${futuras ? `<li>📅 ${futuras} parcela(s) futura(s) serão criadas nas próximas faturas.</li>` : ''}
        ${semCat ? `<li>🏷️ ${semCat} sem categoria (ficam como “A classificar”).</li>` : ''}
        ${lido.avisos.length ? `<li>ℹ️ ${lido.avisos.length} linha(s) do arquivo não puderam ser lidas.</li>` : ''}
      </ul>
      ${[...imp.faltando.categoria.keys()].length ? `<div class="aviso">Categorias que não existem no app: <b>${[...imp.faltando.categoria.entries()].map(([n, q]) => `${esc(n)} (${q})`).join(', ')}</b>. Crie em Cadastros e leia o arquivo de novo.</div>` : ''}
      <div class="acoes">
        <button class="btn" data-marcar="1">Marcar todos</button><button class="btn" data-marcar="0">Desmarcar todos</button>
        <span class="espaco"></span>
        <button class="btn btn-primario" data-importar ${sel.length ? '' : 'disabled'}>Importar ${sel.length} lançamento(s)</button>
      </div>
    </section>

    <div class="tabela-imp">
      ${linhas.map((l, i) => `
        <div class="imp-linha ${l.incluir ? '' : 'fora'} ${l.futura ? 'futura' : ''}" data-i="${i}">
          <input type="checkbox" data-inc ${l.incluir ? 'checked' : ''} ${l.erro || l.dup ? 'disabled' : ''} aria-label="Incluir">
          <div class="imp-data">${fmtData(l.data_movimento)}${l.data_pagamento !== l.data_movimento ? `<small>paga ${fmtData(l.data_pagamento)}</small>` : ''}</div>
          <div class="imp-desc">
            <div>${esc(l.descricao || '(sem descrição)')} ${l.parcela_total ? `<span class="pill">${l.parcela_num}/${l.parcela_total}</span>` : ''}
              ${l.futura ? '<span class="pill">futura</span>' : ''}${l.dup ? '<span class="pill pill-cinza">já importado</span>' : ''}${l.parecido ? '<span class="pill pill-amarela">parecido</span>' : ''}</div>
            ${l.erro ? `<small class="neg">${esc(l.erro)}</small>` : ''}
            ${cfg.destTipo === 'app' ? `<small>${esc(rotDestinoApp(l))}</small>` : ''}
          </div>
          <div class="imp-cat">
            ${cfg.destTipo !== 'app' && !l.futura ? `<select data-tipo aria-label="Tipo">
              <option value="saida" ${l.tipo === 'saida' ? 'selected' : ''}>Despesa</option>
              <option value="entrada" ${l.tipo === 'entrada' ? 'selected' : ''}>${cfg.destTipo === 'cartao' ? 'Estorno/crédito' : 'Receita'}</option>
              ${cfg.destTipo === 'conta' ? `<option value="pagamento_fatura" ${l.tipo === 'pagamento_fatura' ? 'selected' : ''}>Pagamento de fatura</option>` : ''}
            </select>` : ''}
            ${l.tipo === 'pagamento_fatura'
              ? (cfg.destTipo === 'conta' ? `<select data-cartao aria-label="Cartão">${S.cartoes.map((c) => `<option value="${c.id}" ${c.id === l.cartao_id ? 'selected' : ''}>💳 ${esc(c.nome)}</option>`).join('')}</select>` : '<small>Pagamento de fatura</small>')
              : l.tipo === 'transferencia' ? '<small>Transferência</small>'
              : `<select data-cat class="${l.categoria_id ? (l.sugerida ? 'sugerida' : '') : 'sem-cat'}" aria-label="Categoria" ${l.futura ? 'disabled' : ''}>${opcoesCat(l.tipo, l.categoria_id)}</select>`}
          </div>
          <div class="imp-valor valor ${l.tipo === 'entrada' ? 'pos' : ''}">${l.tipo === 'entrada' ? '+' : ''}${brl(l.valor)}</div>
        </div>`).join('')}
    </div>
    ${lido.avisos.length ? `<details class="filtros mt"><summary>Linhas não lidas (${lido.avisos.length})</summary><ul class="lista-simples">${lido.avisos.slice(0, 50).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
    ${lido.textoBruto ? `<details class="filtros mt"><summary>Texto extraído do PDF (para conferência)</summary><pre class="texto-pdf">${esc(lido.textoBruto.join('\n'))}</pre></details>` : ''}`;

  const rerender = () => renderPrevia(el);
  el.querySelector('[data-voltar]').onclick = () => { imp = null; render(el); };
  const edit = (l) => { const k = l.futura ? null : l.ref; if (!k) return null; if (!imp.edits.has(k)) imp.edits.set(k, {}); return imp.edits.get(k); };

  el.querySelectorAll('.imp-linha').forEach((row) => {
    const l = linhas[+row.dataset.i];
    const inc = row.querySelector('[data-inc]');
    inc.onchange = () => {
      if (l.futura) { l.incluir = inc.checked; return rerender(); }
      edit(l).incluir = inc.checked; preparar(); rerender();
    };
    const t = row.querySelector('[data-tipo]');
    if (t) t.onchange = () => { const e = edit(l); e.tipo = t.value; delete e.categoria_id; preparar(); rerender(); };
    const cc = row.querySelector('[data-cartao]');
    if (cc) cc.onchange = () => { edit(l).cartao_id = cc.value; preparar(); rerender(); };
    const c = row.querySelector('[data-cat]');
    if (c) c.onchange = () => {
      const v = c.value || null;
      edit(l).categoria_id = v;
      // aplica a mesma categoria às outras linhas com a mesma descrição que ainda não foram escolhidas à mão
      const n = normDesc(l.descricao);
      for (const o of linhas) {
        if (o === l || o.futura || o.tipo !== l.tipo || normDesc(o.descricao) !== n) continue;
        const eo = edit(o);
        if (eo.categoria_id === undefined) eo.categoria_id = v;
      }
      preparar(); rerender();
    };
  });
  el.querySelectorAll('[data-marcar]').forEach((b) => b.onclick = () => {
    for (const l of linhas) if (!l.futura && !l.erro && !l.dup) edit(l).incluir = b.dataset.marcar === '1';
    preparar(); rerender();
  });
  el.querySelector('[data-importar]').onclick = (e) => gravar(e.currentTarget, el);
}

function rotDestinoApp(l) {
  if (l.tipo === 'transferencia') return `🏦 ${contaPorId(l.conta_id)?.nome || '?'} → ${contaPorId(l.conta_destino_id)?.nome || '?'}`;
  if (l.tipo === 'pagamento_fatura') return `🏦 ${contaPorId(l.conta_id)?.nome || '?'} → 💳 ${cartaoPorId(l.cartao_id)?.nome || '?'}`;
  return l.cartao_id ? `💳 ${cartaoPorId(l.cartao_id)?.nome || '?'}` : `🏦 ${contaPorId(l.conta_id)?.nome || '?'}`;
}

// =====================================================================
// Gravar e desfazer
// =====================================================================
async function gravar(botao, el) {
  const { cfg, linhas } = imp;
  const sel = linhas.filter((l) => l.incluir && !l.dup && !l.erro);
  if (!sel.length) return;
  const origem = cfg.destTipo === 'app' ? 'planilha' : cfg.ext === 'pdf' ? 'fatura_pdf' : cfg.ext === 'ofx' ? 'ofx' : 'csv';
  const destinoTxt = cfg.destTipo === 'cartao' ? `${cartaoPorId(cfg.destId).nome} venc. ${fmtData(cfg.venc)}` : cfg.destTipo === 'conta' ? contaPorId(cfg.destId).nome : 'vários destinos';
  const total = arred(sel.reduce((s, l) => s + (l.tipo === 'entrada' ? -1 : 1) * Number(l.valor), 0));
  const grupos = new Map(); // agrupa a parcela lida com as futuras criadas
  await comCarregando(botao, async () => {
    const [lote] = await db.inserir('lotes_importacao', [{ origem, descricao: `${ORIGEM_ROT[origem]} · ${destinoTxt} · ${cfg.arquivo}`, quantidade: sel.length, total }]);
    const registros = sel.map((l) => {
      let grupo = null;
      if (l.parcela_total && cfg.destTipo === 'cartao') {
        const base = String(l.ref).split('-f')[0];
        if (!grupos.has(base)) grupos.set(base, crypto.randomUUID());
        grupo = grupos.get(base);
      }
      return {
        data_movimento: l.data_movimento, data_pagamento: l.data_pagamento, tipo: l.tipo, categoria_id: l.categoria_id || null,
        descricao: l.descricao, valor: l.valor, conta_id: l.conta_id || null, conta_destino_id: l.conta_destino_id || null,
        cartao_id: l.cartao_id || null, metodo: l.metodo || '', parcela_num: l.parcela_num || null, parcela_total: l.parcela_total || null,
        grupo_parcela: grupo, situacao: l.situacao, origem, lote_id: lote.id, chave_dedup: l.chave,
      };
    });
    try {
      await db.inserir('lancamentos', registros);
    } catch (e) {
      await db.excluirOnde('lancamentos', 'lote_id', lote.id).catch(() => {});
      await db.excluir('lotes_importacao', lote.id).catch(() => {});
      throw e;
    }
    await Promise.all([recarregarLancamentos(), recarregarLotes()]);
  });
  toast(`${sel.length} lançamento(s) importado(s).`);
  imp = null;
  render(el);
}

async function desfazer(lote, botao, aoFim) {
  const ok = await confirmar('Desfazer importação', `Apagar os <b>${lote.quantidade}</b> lançamento(s) desta importação?<br><small>${esc(lote.descricao)}</small>`,
    [{ valor: 'sim', rotulo: 'Desfazer importação', classe: 'btn-perigo' }]);
  if (!ok) return;
  await comCarregando(botao, async () => {
    await db.excluirOnde('lancamentos', 'lote_id', lote.id);
    await db.excluir('lotes_importacao', lote.id);
    await Promise.all([recarregarLancamentos(), recarregarLotes()]);
  });
  toast('Importação desfeita.');
  aoFim();
}
