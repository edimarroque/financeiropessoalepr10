// Tela: Importar (fatura PDF, extrato OFX, CSV de banco e migração da planilha)
import * as db from '../db.js';
import { S, recarregarLancamentos, recarregarLotes, recarregarCadastros, cartaoPorId, contaPorId } from '../state.js';
import { prefs, salvarPrefs } from '../prefs.js';
import { hoje, fmtData, somarMeses, somarDias, faturaDoPagamento, faturasParaPagamento, saldoConta, fatura, vencimentosDoCartao, vencimentoAtual, fechamentoDoVencimento, arred } from '../calc.js';
import { esc, brl, toast, confirmar, comCarregando } from '../ui.js';
import { sugerir } from '../categorizar.js';
import { chamarApi, paraBase64 } from '../servicos/api.js';
import { lerCSV, lerOFX, textoDoPDF, itensDaFatura, lerPdfComIA, decodificar, normDesc, chavesDesc, mesmaDescricao } from '../import/parsers.js';

// estado da importação em andamento
let imp = null;
// de onde veio o arquivo escolhido (Caixa de entrada do Drive/Telegram) e o próprio arquivo (para guardar o original no Drive)
let origemArquivo = null, arquivoAtual = null;
let caixa = null; // itens da Caixa de entrada (carregados sob demanda)

const ORIGEM_ROT = { fatura_pdf: '📄 Fatura PDF', extrato_pdf: '📄 Extrato PDF', ofx: '🏦 Extrato OFX', csv: '📑 CSV', planilha: '📊 Planilha/CSV do app' };

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
    <section class="cartao-bloco" data-caixa>${caixaHTML()}</section>
    <section class="cartao-bloco">
      <h2>1. Escolha o arquivo</h2>
      <p class="dica">PDF da fatura do cartão ou do extrato da conta, extrato OFX ou CSV. Nada é gravado antes de você conferir a prévia.</p>
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
        <label data-bloco="leitor">Como ler o PDF
          <select name="leitor">
            <option value="ia">🤖 Ler com IA (Gemini) — fatura ou extrato, mais preciso</option>
            <option value="simples">📄 Leitor simples (sem IA, só fatura de cartão)</option>
          </select>
        </label>
        <div class="linha2">
          <label data-bloco="fatura">Vencimento desta fatura <select name="venc"></select></label>
          <label data-bloco="senha">Senha do PDF (se tiver) <input name="senha" type="password" autocomplete="off" placeholder="opcional"></label>
        </div>
        <label class="check" data-bloco="fatura"><input type="checkbox" name="futuras" checked> Criar as parcelas futuras das compras parceladas (ex.: 6/10 cria 7/10 até 10/10)</label>
        <label class="check" data-bloco="fatura"><input type="checkbox" name="paga"> Esta fatura já foi paga</label>
        <p class="dica" data-bloco="app">Arquivo no formato do app (exportação ou migração da planilha): cada linha já traz conta, cartão e categoria.</p>
        <p class="dica" data-progresso hidden></p>
        <div class="acoes"><span class="espaco"></span><button class="btn btn-primario" data-ler>Ler arquivo e ver prévia</button></div>
      </div>
    </section>

    <section class="cartao-bloco">
      <h2>Importações feitas</h2>
      <p class="dica">Se uma importação deu errado, toque em <b>Remover</b>: todos os lançamentos dela são apagados e você pode importar de novo.</p>
      ${S.lotes.length ? `<div class="lista">${S.lotes.map((l) => `
        <div class="item item-estatico">
          <div class="item-icone">${ORIGEM_ROT[l.origem]?.slice(0, 2) || '📥'}</div>
          <div class="item-meio"><div class="item-titulo">${esc(l.descricao || ORIGEM_ROT[l.origem] || l.origem)}</div>
            <div class="item-sub">${new Date(l.created_at).toLocaleString('pt-BR')} · ${l.quantidade} lançamento(s) · ${totalLoteTxt(l)}</div></div>
          <div class="item-fim acoes-linha"><a class="btn btn-peq" href="#/lancamentos" data-ver-lote="${l.id}">Ver</a><button class="btn btn-peq btn-perigo" data-desfazer="${l.id}">🗑️ Remover</button></div>
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
    el.querySelector('[data-bloco=senha]').hidden = ext !== 'pdf';
    el.querySelector('[data-bloco=leitor]').hidden = ext !== 'pdf';
  }

  async function escolher(f, origem = null) {
    arquivo = f; arquivoAtual = f; origemArquivo = origem;
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
    if (origem) dest.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  arq.onchange = () => escolher(arq.files[0], null);
  ligarCaixa(el, escolher);
  selDest.onchange = () => { opcoesVenc(); visibilidade(); };
  selVenc.onchange = atualizarPaga;

  el.querySelector('[data-ler]').onclick = async (e) => {
    if (!arquivo) return toast('Escolha um arquivo.', 'erro');
    const [q, id] = selDest.value.split(':');
    const cfg = {
      arquivo: arquivo.name, ext, destTipo: ext === 'csv-app' ? 'app' : q, destId: id,
      venc: selVenc.value, futuras: el.querySelector('[name=futuras]').checked, paga: el.querySelector('[name=paga]').checked,
      ia: ext === 'pdf' && el.querySelector('[name=leitor]').value === 'ia',
      origemArquivo, arquivoObj: arquivoAtual,
    };
    if (cfg.destTipo !== 'app' && !id) return toast('Escolha o destino.', 'erro');
    const botaoLer = e.currentTarget;
    await comCarregando(botaoLer, async () => {
      const buf = await arquivo.arrayBuffer();
      let lido;
      const senha = el.querySelector('[name=senha]').value;
      if (ext === 'pdf' && cfg.ia) {
        const sessao = await db.sessaoAtual();
        if (!sessao) throw new Error('Sua sessão expirou. Entre de novo.');
        const aviso = el.querySelector('[data-progresso]');
        try {
          lido = await lerPdfComIA(buf, {
            tipo: q === 'cartao' ? 'cartao' : 'extrato', senha, token: sessao.access_token,
            aoProgredir: (k, n) => { if (aviso && n > 1) { aviso.hidden = false; aviso.textContent = `🤖 PDF grande: lendo a parte ${k} de ${n}… (pode levar alguns minutos, não feche a tela)`; } },
          });
        } finally { if (aviso) aviso.hidden = true; }
        lido.alertas = [];
        if (q === 'cartao' && lido.vencimentoLido && lido.vencimentoLido !== cfg.venc) {
          lido.alertas.push(`O PDF diz que o vencimento é ${fmtData(lido.vencimentoLido)}, mas você escolheu ${fmtData(cfg.venc)}. Se estiver errado, volte e troque o vencimento.`);
        }
      } else if (ext === 'pdf') {
        if (q !== 'cartao') throw new Error('O leitor simples só lê fatura de cartão. Para extrato em PDF, escolha “Ler com IA”.');
        const linhas = await textoDoPDF(buf, senha);
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

  el.querySelectorAll('[data-ver-lote]').forEach((a) => a.onclick = () => window.dispatchEvent(new CustomEvent('filtro-lote', { detail: a.dataset.verLote })));
  el.querySelectorAll('[data-desfazer]').forEach((b) => b.onclick = () => desfazer(S.lotes.find((l) => l.id === b.dataset.desfazer), b, () => render(el)));
}

// =====================================================================
// Preparação: transforma o que foi lido em lançamentos, sugere categoria e marca duplicados
// =====================================================================
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

// v1.6.7: o total do lote é gravado como saídas − entradas. Num extrato de conta o que interessa é o contrário
// (entradas − saídas, ex.: +R$ 2.555,77). Só a exibição muda; os dados gravados ficam como estão.
function loteDeConta(lote) {
  if (lote.origem === 'extrato_pdf') return true;
  if (lote.origem === 'planilha' || lote.origem === 'fatura_pdf') return false;
  return S.lancs.some((x) => x.lote_id === lote.id && x.conta_id && (!x.cartao_id || x.tipo === 'pagamento_fatura'));
}
function totalLoteTxt(lote) {
  if (!loteDeConta(lote)) return brl(lote.total);
  const v = arred(-Number(lote.total));
  return `<span class="${v >= 0 ? 'pos' : 'neg'}" title="Entradas menos saídas no período">${v > 0 ? '+' : ''}${brl(v)} no período</span>`;
}

// v1.6.7: PIX/TED entre as suas próprias contas (ex.: "PIX TRANSF EDIMAR") = transferência, não é gasto nem receita
export function meusNomes() {
  const p = prefs().nomesProprios;
  if (p) return String(p).split(/[,;]/).map((x) => normDesc(x)).filter((x) => x.length >= 3);
  const n = normDesc(S.perfil?.nome || '').split(' ').filter((w) => w.length >= 3);
  if (n.length) return [n[0]];
  const email = normDesc((S.user?.email || '').split('@')[0].replace(/[^a-zA-Z]+/g, ' ')).split(' ')[0] || '';
  return email.length >= 4 ? [email] : [];
}
export function pareceTransfPropria(desc, nomes = meusNomes()) {
  const d = normDesc(desc);
  if (!nomes.length || !/\b(PIX|TED|DOC|TEF|TRANSF|TRANSFERENCIA)\b/.test(d)) return false;
  // o nome pode vir inteiro ("EDIMAR PEREIRA ROQUE") ou só o primeiro nome ("EDIMAR"); o e-mail pode juntar nome e sobrenome
  const palavras = d.split(' ').filter((w) => w.length >= 4);
  return nomes.some((n) => { const ps = n.split(' '); return palavras.some((w) => ps.includes(w) || (ps.length === 1 && n.length > w.length && n.startsWith(w))); });
}
/** A outra conta da transferência: a escolhida à mão, ou a que tem mais palavras em comum no nome (ex.: "itau salario" ↔ "itau pessoal") */
function outraConta(conta, escolhida) {
  if (escolhida) return contaPorId(escolhida);
  const ps = new Set(normDesc(conta.nome).split(' ').filter((w) => w.length >= 3 && w !== 'CONTA'));
  const outras = S.contas.filter((c) => c.id !== conta.id && c.ativo !== false && (c.moeda || 'BRL') === (conta.moeda || 'BRL'));
  const pontos = (c) => normDesc(c.nome).split(' ').filter((w) => ps.has(w)).length;
  return outras.sort((a, b) => pontos(b) - pontos(a))[0] || null;
}

function pareceFatura(d) {
  return /FATURA|BOLETO BANCO XP|PAG.*CARTAO|CARTAO.*PAG/.test(normDesc(d));
}

function preparar() {
  const { cfg, lido, edits } = imp;
  const existentes = new Set(S.lancs.map((l) => l.chave_dedup).filter(Boolean));
  const usados = new Set(); // lançamentos já gravados que já casaram com uma linha do arquivo
  const existentesArquivo = new Set(); // chaves do próprio arquivo que já existem (não servem de "parecido" para outra linha)
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
      // v1.6.7: pagamento de fatura vindo da planilha/CSV do app também fica ligado à fatura que ele paga
      if (L.tipo === 'pagamento_fatura' && cartao) L.fatura_venc = e.fatura_venc !== undefined ? e.fatura_venc : faturaDoPagamento(cartao, S.lancs, L.valor, L.data_movimento);
    } else if (cfg.destTipo === 'cartao') {
      const cartao = cartaoPorId(cfg.destId);
      // a fatura já foi paga (pagamento importado do extrato ou feito na tela Cartões): os itens já entram como pagos
      const pagSolto = pagamentoSemFatura(cartao, cfg.venc, lido.totalDeclarado);
      const jaPaga = !!pagSolto || S.lancs.some((x) => x.tipo === 'pagamento_fatura' && x.cartao_id === cartao.id && x.fatura_venc === cfg.venc);
      const sinal = r.sinal !== undefined ? r.sinal : -(r.sinalBruto || 1); // CSV de fatura: positivo = compra
      const tipo = e.tipo || (sinal > 0 ? 'entrada' : 'saida');
      L = {
        ref: r.ref, data_movimento: r.data, data_pagamento: cfg.venc, tipo, descricao: r.descricao, valor: arred(r.valor),
        categoria_id: null, conta_id: null, conta_destino_id: null, cartao_id: cartao.id, metodo: 'Crédito',
        parcela_num: r.parcela_num, parcela_total: r.parcela_total, situacao: cfg.paga || jaPaga ? 'pago' : 'pendente', erro: null,
      };
      L.chave = r.parcela_total
        ? `parc:${cartao.id}:${normDesc(r.descricao)}:${centavos(r.valor)}:${r.parcela_num}/${r.parcela_total}`
        : comSeq(`cc:${cartao.id}:${cfg.venc}:${r.data}:${centavos(r.valor)}:${normDesc(r.descricao)}`);
      if (r.ignorarSugerido && e.incluir === undefined) e.incluirPadrao = false;
    } else {
      const conta = contaPorId(cfg.destId);
      const sinal = r.sinal !== undefined ? r.sinal : (r.sinalBruto || -1);
      // PIX com o seu nome só vira transferência se o mesmo valor aparecer, em sentido contrário, noutra conta cadastrada
      // (até 3 dias de diferença). Sem esse par, o dinheiro foi para uma conta fora do app (ex.: Sicoob, Caixa) = gasto/receita.
      const par = pareceTransfPropria(r.descricao) ? parTransferencia(conta, r, sinal) : null;
      if (par) e.conta_outra = e.conta_outra || par;
      const tipoPadrao = par ? 'transferencia' : sinal > 0 ? 'entrada' : (pareceFatura(r.descricao) ? 'pagamento_fatura' : 'saida');
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
      if (tipo === 'transferencia') {
        // saiu desta conta → vai para a outra; entrou nesta conta → veio da outra
        const outra = outraConta(conta, e.conta_outra);
        L.sentido = sinal > 0 ? 'entrou' : 'saiu';
        if (sinal > 0) { L.conta_id = outra?.id || null; L.conta_destino_id = conta.id; } else L.conta_destino_id = outra?.id || null;
        L.outra_id = outra?.id || null;
        if (!outra) L.erro = 'Escolha a outra conta da transferência';
      }
      // pagamento de fatura: acha a fatura que ele quita (mesmo cartão, total = valor pago) ou usa a escolhida à mão
      if (tipo === 'pagamento_fatura' && cartaoPag) L.fatura_venc = e.fatura_venc !== undefined ? e.fatura_venc : faturaDoPagamento(cartaoPorId(cartaoPag), S.lancs, L.valor, r.data);
      L.chave = r.fitid ? `ofx:${conta.id}:${r.fitid}:${r.data}:${centavos(r.valor)}` : comSeq(`ct:${conta.id}:${r.data}:${centavos(r.valor)}:${normDesc(r.descricao)}`);
    }

    // categoria sugerida pelo histórico
    if (L.tipo === 'entrada' || L.tipo === 'saida') {
      if (e.categoria_id !== undefined) L.categoria_id = e.categoria_id;
      else if (!L.categoria_id) { const sg = sugerir(L.descricao, L.tipo); L.categoria_id = sg?.categoria_id || null; L.sugerida = sg?.origem || false; }
    } else L.categoria_id = null;

    // duplicados: mesma chave já gravada, ou lançamento parecido que já existe (feito à mão, pelo Telegram
    // ou de outra importação com a descrição escrita diferente). Cada lançamento existente só "casa" com um do arquivo.
    L.dup = existentes.has(L.chave);
    if (L.dup) existentesArquivo.add(L.chave);
    else {
      // a conferência usa SEMPRE a descrição original (como veio do banco), nunca a descrição editada
      const orig = (x) => x.descricao_original || x.descricao;
      const sinal = (x) => (cfg.destTipo === 'conta' ? sinalNaConta(x, cfg.destId) : (x.tipo === 'entrada' ? 1 : -1));
      const candidatos = S.lancs.filter((x) => !usados.has(x.id) && x.chave_dedup !== L.chave && !(x.chave_dedup && existentesArquivo.has(x.chave_dedup)) &&
        (cfg.destTipo === 'app' ? x.tipo === L.tipo : sinal(x) === sinal(L)) &&
        centavos(x.valor) === centavos(L.valor) && x.data_movimento === L.data_movimento &&
        (!L.parcela_total || !x.parcela_total || x.parcela_num === L.parcela_num) &&
        (cfg.destTipo === 'conta' ? (x.conta_id === cfg.destId || (x.tipo === 'transferencia' && x.conta_destino_id === cfg.destId)) && (L.tipo !== 'pagamento_fatura' || !x.cartao_id || x.tipo === 'pagamento_fatura')
          : (x.cartao_id || null) === (L.cartao_id || null) && (L.cartao_id || x.conta_id === L.conta_id)));
      const ks = chavesDesc(L.descricao);
      const sim = (x) => { const kx = chavesDesc(orig(x)); return !ks.length || !kx.length || kx[0] === ks[0] || (ks[2] && kx[2] === ks[2]) || kx[0].includes(ks[0]) || ks[0].includes(kx[0]); };
      // mesma data + valor + nome reconhecido = já importado (com o texto escrito de outro jeito)
      const forte = candidatos.find((x) => mesmaDescricao(orig(x), L.descricao));
      // extrato/fatura: mesma data e valor na mesma conta/cartão, mesmo com nome diferente = parecido (confira)
      const achado = forte || (cfg.destTipo === 'app' ? candidatos.find(sim) : candidatos[0]);
      L.jaImportado = !!forte;
      L.parecido = !!achado && !forte;
      if (achado) { usados.add(achado.id); L.existente = orig(achado); L.parecidoCom = achado.origem || (achado.lote_id ? 'importacao' : 'manual'); }
    }
    const incluirPadrao = e.incluirPadrao !== undefined ? e.incluirPadrao : !(L.dup || L.jaImportado || L.parecido || L.erro);
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

/** Conta cadastrada onde o mesmo PIX aparece do outro lado (valor igual, sentido contrário, até 3 dias); null se não houver */
function parTransferencia(conta, r, sinal) {
  const v = Math.abs(arred(r.valor)), entrou = sinal > 0;
  const ini = somarDias(r.data, -3), fim = somarDias(r.data, 3);
  const x = S.lancs.find((l) => !l.cartao_id && l.data_movimento >= ini && l.data_movimento <= fim && Math.abs(Number(l.valor) - v) < 0.005 &&
    ((l.conta_id && l.conta_id !== conta.id && l.tipo === (entrou ? 'saida' : 'entrada')) ||
     (l.tipo === 'transferencia' && (entrou ? l.conta_destino_id === conta.id : l.conta_id === conta.id))));
  if (!x) return null;
  if (x.tipo === 'transferencia') return entrou ? x.conta_id : x.conta_destino_id;
  return x.conta_id;
}

/** +1 se o lançamento aumenta o saldo desta conta, −1 se diminui */
function sinalNaConta(l, contaId) {
  if (l.tipo === 'entrada') return 1;
  if (l.tipo === 'transferencia') return l.conta_destino_id === contaId ? 1 : -1;
  return -1;
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
  const sinalL = (l) => (cfg.destTipo === 'conta' ? sinalNaConta(l, cfg.destId) : (l.tipo === 'entrada' ? 1 : -1));
  // saídas − entradas (fatura); no extrato a tela mostra o contrário: entradas − saídas
  const totalArquivo = arred(principais.filter((l) => l.incluir || l.dup).reduce((s, l) => s - sinalL(l) * l.valor, 0));
  const saidas = tot(sel, (l) => l.tipo === 'saida'), entradas = tot(sel, (l) => l.tipo === 'entrada'), pagFat = tot(sel, (l) => l.tipo === 'pagamento_fatura');
  const semCat = sel.filter((l) => (l.tipo === 'entrada' || l.tipo === 'saida') && !l.categoria_id).length;
  const dups = linhas.filter((l) => l.dup || l.jaImportado).length, parec = linhas.filter((l) => l.parecido).length, erros = linhas.filter((l) => l.erro).length;
  const futuras = sel.filter((l) => l.futura).length;
  let sobrepoe = '';
  if (cfg.destTipo === 'conta' && principais.length) {
    const datas = principais.map((l) => l.data_movimento).sort();
    const ja = S.lancs.filter((x) => x.conta_id === cfg.destId && x.lote_id && x.data_movimento >= datas[0] && x.data_movimento <= datas[datas.length - 1]).length;
    if (ja) sobrepoe = `Esta conta já tem ${ja} lançamento(s) importado(s) entre ${fmtData(datas[0])} e ${fmtData(datas[datas.length - 1])}. Os que já existem vêm desmarcados; confira os marcados como “parecido”.`;
  }
  const destino = cfg.destTipo === 'cartao' ? `💳 ${cartaoPorId(cfg.destId).nome} · fatura de ${fmtData(cfg.venc)}`
    : cfg.destTipo === 'conta' ? `🏦 ${contaPorId(cfg.destId).nome}` : 'Contas e cartões indicados no arquivo';

  let conferencia = '';
  if (lido.totalDeclarado != null) {
    const ok = Math.abs(lido.totalDeclarado - totalArquivo) < 0.02;
    conferencia = `<div class="aviso ${ok ? 'ok' : ''}">${ok ? '✅' : '⚠️'} Total da fatura no PDF: <b>${brl(lido.totalDeclarado)}</b> · total marcado: <b>${brl(totalArquivo)}</b>${ok ? '' : ' — confira se faltou alguma linha (pagamentos e encargos podem explicar a diferença).'}</div>`;
  } else if (lido.variacaoDeclarada != null) {
    const variacao = arred(-totalArquivo);
    const ok = Math.abs(lido.variacaoDeclarada - variacao) < 0.02;
    conferencia = `<div class="aviso ${ok ? 'ok' : ''}">${ok ? '✅' : '⚠️'} Saldo final menos saldo inicial no PDF: <b>${brl(lido.variacaoDeclarada)}</b> · entradas menos saídas marcadas: <b>${brl(variacao)}</b>${ok ? '' : ' — confira se faltou ou sobrou alguma linha.'}</div>`;
  }
  if (lido.formato === 'pdf-ia') {
    const em = lido.emenda;
    const txtEmenda = em && em.partes > 1 ? ` PDF lido em ${em.partes} partes; nas viradas entre as partes ${em.repetidos} lançamento(s) repetido(s) foram descartados${em.recuperados ? ` e ${em.recuperados} que só a parte seguinte encontrou foram mantidos` : ''}.` : '';
    conferencia = `<p class="dica">🤖 Lido pela IA${lido.modelo ? ` (${esc(lido.modelo)})` : ''}.${txtEmenda} Confira os valores com o PDF antes de importar.</p>` + conferencia;
  }
  for (const a of lido.alertas || []) conferencia += `<div class="aviso">⚠️ ${esc(a)}</div>`;
  // v1.6.7: saldo final do extrato vira o saldo do banco na conferência da conta (sem digitar)
  if (cfg.destTipo === 'conta' && lido.saldoFinal && lido.saldoFinal.valor != null) {
    const conta = contaPorId(cfg.destId);
    const dataSaldo = lido.saldoFinal.data || principais.map((l) => l.data_movimento).sort().pop() || hoje();
    const previsto = saldoConta(conta, [...S.lancs, ...sel.filter((l) => !l.dup)], dataSaldo);
    const d = arred(lido.saldoFinal.valor - previsto);
    const ok = Math.abs(d) < 0.01;
    conferencia += `<div class="aviso ${ok ? 'ok' : ''}">🏦 Saldo final do extrato em ${fmtData(dataSaldo)}: <b>${brl(lido.saldoFinal.valor)}</b> · no app depois de importar: <b>${brl(previsto)}</b>
      ${ok ? ' ✅ bate.' : ` — diferença de ${d > 0 ? '+' : ''}${brl(d)} (só aviso; nada é corrigido sozinho).`}
      <br><small>Ao importar, este saldo fica gravado como o saldo do banco na conferência da conta${conta.conferido_em && conta.conferido_em > dataSaldo ? ` (não substitui a conferência mais nova, de ${fmtData(conta.conferido_em)})` : ''}.</small></div>`;
  }
  const transfs = cfg.destTipo === 'conta' ? principais.filter((l) => l.tipo === 'transferencia').length : 0;
  const nomes = meusNomes();

  el.innerHTML = `
    <div class="topo-tela"><h1>Prévia da importação</h1><button class="btn" data-voltar>← Voltar</button></div>
    <section class="cartao-bloco">
      <p><b>${esc(cfg.arquivo)}</b> → ${esc(destino)}</p>
      <div class="resumo-linha">
        <div><small>Selecionados</small><b>${sel.length} de ${linhas.length}</b></div>
        <div><small>Despesas${futuras ? ' (c/ parcelas futuras)' : ''}</small><b class="neg">${brl(saidas)}</b></div>
        <div><small>Receitas / estornos</small><b class="pos">${brl(entradas)}</b></div>
        ${cfg.destTipo === 'conta'
          ? `<div><small>Entradas − saídas</small><b class="${-totalArquivo >= 0 ? 'pos' : 'neg'}">${-totalArquivo > 0 ? '+' : ''}${brl(-totalArquivo)}</b></div>`
          : `<div><small>${pagFat ? 'Pagamentos de fatura' : 'Total marcado'}</small><b>${brl(pagFat || totalArquivo)}</b></div>`}
      </div>
      ${conferencia}
      <ul class="lista-simples">
        <li>📄 ${principais.length} no arquivo: <b>${principais.filter((l) => !l.dup && !l.jaImportado && !l.parecido && !l.erro).length} novo(s)</b>${dups ? ` · ${dups} já importado(s)` : ''}${parec ? ` · ${parec} parecido(s)` : ''}. A conferência usa a descrição original do banco.</li>
        ${dups ? `<li>🔁 ${dups} já importado(s) antes — vêm desmarcados (o app reconhece pela data, valor e nome original, mesmo escrito de outro jeito).</li>` : ''}
        ${parec ? `<li>⚠️ ${parec} parecido(s) com lançamento que já existe ${cfg.destTipo === 'conta' ? 'nesta conta' : cfg.destTipo === 'cartao' ? 'neste cartão' : 'no app'} (mesma data e valor) — desmarcados; marque se não for o mesmo.</li>` : ''}
        ${sobrepoe ? `<li>📆 ${sobrepoe}</li>` : ''}
        ${erros ? `<li>❌ ${erros} com erro (veja abaixo) — ficam de fora.</li>` : ''}
        ${futuras ? `<li>📅 ${futuras} parcela(s) futura(s) serão criadas nas próximas faturas.</li>` : ''}
        ${semCat ? `<li>🏷️ ${semCat} sem categoria (ficam como “A classificar”).</li>` : ''}
        ${cfg.destTipo === 'conta' ? `<li>🔁 ${transfs ? `<b>${transfs}</b> PIX/TED entre as suas contas viram <b>transferência</b> (não contam como gasto nem receita).` : 'Nenhum PIX/TED entre as suas contas neste arquivo.'}
          Só vira transferência quando o mesmo valor aparece numa outra conta cadastrada; PIX para conta fora do app (ex.: Sicoob, Caixa) continua gasto/receita. Seu nome nos extratos: <b>${esc(nomes.join(', ') || '—')}</b> <button class="btn-link" data-nomes>mudar</button></li>` : ''}
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
              ${l.futura ? '<span class="pill">futura</span>' : ''}${l.dup || l.jaImportado ? '<span class="pill pill-cinza">já importado</span>' : ''}${l.parecido ? '<span class="pill pill-amarela">parecido</span>' : ''}</div>
            ${l.jaImportado ? `<small>Já está no app como “${esc(l.existente)}” — marque só se for outro lançamento.</small>` : ''}
            ${l.parecido ? `<small>Mesma data e valor de “${esc(l.existente)}” — marque só se for outro lançamento.</small>` : ''}
            ${l.erro ? `<small class="neg">${esc(l.erro)}</small>` : ''}
            ${l.tipo === 'pagamento_fatura' && cfg.destTipo !== 'cartao' && l.cartao_id && !l.dup && !l.jaImportado ? statusPagamento(l) : ''}
            ${cfg.destTipo === 'app' ? `<small>${esc(rotDestinoApp(l))}</small>` : ''}
          </div>
          <div class="imp-cat">
            ${cfg.destTipo !== 'app' && !l.futura ? `<select data-tipo aria-label="Tipo">
              <option value="saida" ${l.tipo === 'saida' ? 'selected' : ''}>Despesa</option>
              <option value="entrada" ${l.tipo === 'entrada' ? 'selected' : ''}>${cfg.destTipo === 'cartao' ? 'Estorno/crédito' : 'Receita'}</option>
              ${cfg.destTipo === 'conta' ? `<option value="pagamento_fatura" ${l.tipo === 'pagamento_fatura' ? 'selected' : ''}>Pagamento de fatura</option>
              <option value="transferencia" ${l.tipo === 'transferencia' ? 'selected' : ''}>Entre minhas contas</option>` : ''}
            </select>` : ''}
            ${l.tipo === 'pagamento_fatura'
              ? (cfg.destTipo === 'conta' ? `<select data-cartao aria-label="Cartão">${S.cartoes.map((c) => `<option value="${c.id}" ${c.id === l.cartao_id ? 'selected' : ''}>💳 ${esc(c.nome)}</option>`).join('')}</select>` : '<small>Pagamento de fatura</small>')
              : l.tipo === 'transferencia' && cfg.destTipo === 'conta' ? `<select data-outra aria-label="Outra conta"><option value="">${l.sentido === 'entrou' ? 'Veio de…' : 'Foi para…'}</option>${S.contas.filter((c) => c.id !== cfg.destId).map((c) => `<option value="${c.id}" ${c.id === l.outra_id ? 'selected' : ''}>${l.sentido === 'entrou' ? '← ' : '→ '}🏦 ${esc(c.nome)}</option>`).join('')}</select>`
              : l.tipo === 'transferencia' ? '<small>Transferência</small>'
              : `<select data-cat class="${l.categoria_id ? (l.sugerida ? 'sugerida' : '') : 'sem-cat'}" aria-label="Categoria" ${l.futura ? 'disabled' : ''}>${opcoesCat(l.tipo, l.categoria_id)}</select>`}
          </div>
          <div class="imp-valor valor ${sinalL(l) > 0 && l.tipo !== 'saida' ? 'pos' : ''} ${l.tipo === 'transferencia' ? 'neutro' : ''}">${sinalL(l) > 0 && l.tipo !== 'saida' ? '+' : ''}${brl(l.valor)}</div>
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
    if (cc) cc.onchange = () => { const e = edit(l); e.cartao_id = cc.value; delete e.fatura_venc; preparar(); rerender(); };
    const fv = row.querySelector('[data-fatura]');
    if (fv) fv.onchange = () => { edit(l).fatura_venc = fv.value || null; preparar(); rerender(); };
    const ou = row.querySelector('[data-outra]');
    if (ou) ou.onchange = () => { edit(l).conta_outra = ou.value || null; preparar(); rerender(); };
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
  el.querySelector('[data-nomes]')?.addEventListener('click', async () => {
    const v = window.prompt('Como o seu nome aparece nos extratos? (separe por vírgula; ex.: EDIMAR, EDIMAR PEREIRA ROQUE)', meusNomes().join(', '));
    if (v === null) return;
    try { await salvarPrefs({ nomesProprios: v.trim() }); } catch (err) { toast(err.message, 'erro'); }
    for (const k of imp.edits.keys()) delete imp.edits.get(k).tipo; // reavalia os tipos sugeridos
    preparar(); rerender();
  });
}

/** Pagamento de fatura na prévia: escolher a fatura à mão e ver se quita tudo ou só uma parte */
function statusPagamento(l) {
  const cartao = cartaoPorId(l.cartao_id);
  const fats = faturasParaPagamento(cartao, S.lancs, l.data_movimento);
  if (l.fatura_venc && !fats.some((f) => f.venc === l.fatura_venc)) fats.push(fatura(cartao, S.lancs, l.fatura_venc));
  const sel = `<select data-fatura aria-label="Fatura que este pagamento quita"><option value="">Não ligar a nenhuma fatura agora</option>
    ${fats.sort((a, b) => b.venc.localeCompare(a.venc)).map((f) => `<option value="${f.venc}" ${f.venc === l.fatura_venc ? 'selected' : ''}>Fatura venc. ${fmtData(f.venc)} — ${brl(f.total)}${f.pago ? ` (já pago ${brl(f.pago)})` : ''}${f.itens.length ? '' : ' · ainda não importada'}</option>`).join('')}</select>`;
  if (!l.fatura_venc) return `<small class="neg">Não achei a fatura deste valor — escolha abaixo (ou deixe para ligar quando a fatura for importada).</small>${sel}`;
  const f = fatura(cartao, S.lancs, l.fatura_venc);
  const resta = arred(f.total - f.pago - l.valor);
  const txt = !f.itens.length ? `🔗 Fica ligado à fatura de ${fmtData(f.venc)} (ainda não importada).`
    : Math.abs(resta) <= 0.05 ? `✅ Quita a fatura de ${fmtData(f.venc)} (${brl(f.total)}) — ela fica como paga.`
    : resta > 0 ? `◐ Paga parcialmente a fatura de ${fmtData(f.venc)} (${brl(f.total)}) — falta ${brl(resta)}.`
    : `⚠️ Paga ${brl(-resta)} a mais que a fatura de ${fmtData(f.venc)} (${brl(f.total)}).`;
  return `<small class="${resta > 0.05 || resta < -0.05 ? '' : 'pos'}">${txt}</small>${sel}`;
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
  const origem = cfg.destTipo === 'app' ? 'planilha' : cfg.ext === 'pdf' ? (cfg.destTipo === 'conta' ? 'extrato_pdf' : 'fatura_pdf') : cfg.ext === 'ofx' ? 'ofx' : 'csv';
  const destinoTxt = cfg.destTipo === 'cartao' ? `${cartaoPorId(cfg.destId).nome} venc. ${fmtData(cfg.venc)}` : cfg.destTipo === 'conta' ? contaPorId(cfg.destId).nome : 'vários destinos';
  const total = arred(sel.reduce((s, l) => s - (cfg.destTipo === 'conta' ? sinalNaConta(l, cfg.destId) : (l.tipo === 'entrada' ? 1 : -1)) * Number(l.valor), 0));
  const grupos = new Map(); // agrupa a parcela lida com as futuras criadas
  await comCarregando(botao, async () => {
    const [lote] = await db.inserir('lotes_importacao', [{ origem, descricao: `${ORIGEM_ROT[origem]}${cfg.ia ? ' (IA)' : ''} · ${destinoTxt} · ${cfg.arquivo}`, quantidade: sel.length, total }]);
    const registros = sel.map((l) => {
      let grupo = null;
      if (l.parcela_total && cfg.destTipo === 'cartao') {
        const base = String(l.ref).split('-f')[0];
        if (!grupos.has(base)) grupos.set(base, crypto.randomUUID());
        grupo = grupos.get(base);
      }
      return {
        data_movimento: l.data_movimento, data_pagamento: l.data_pagamento, tipo: l.tipo, categoria_id: l.categoria_id || null,
        descricao: l.descricao, descricao_original: l.descricao, valor: l.valor, conta_id: l.conta_id || null, conta_destino_id: l.conta_destino_id || null,
        cartao_id: l.cartao_id || null, metodo: l.metodo || '', parcela_num: l.parcela_num || null, parcela_total: l.parcela_total || null,
        grupo_parcela: grupo, situacao: l.situacao, origem, lote_id: lote.id, chave_dedup: l.chave,
        ...(l.tipo === 'pagamento_fatura' ? { fatura_venc: l.fatura_venc || null } : {}),
      };
    });
    try {
      await db.inserir('lancamentos', registros);
      await quitarFaturas(registros);
      // fatura importada depois do pagamento (que veio do extrato sem achar a fatura): liga os dois agora
      const solto = cfg.destTipo === 'cartao' ? pagamentoSemFatura(cartaoPorId(cfg.destId), cfg.venc, imp.lido.totalDeclarado) : null;
      if (solto) await db.atualizar('lancamentos', solto.id, { fatura_venc: cfg.venc });
      // v1.6.7: saldo final do extrato = saldo do banco na conferência (só se for mais novo que a última conferência)
      const sf = imp.lido.saldoFinal;
      if (cfg.destTipo === 'conta' && sf && sf.valor != null) {
        const conta = contaPorId(cfg.destId);
        const dataSaldo = sf.data || linhas.filter((l) => !l.futura).map((l) => l.data_movimento).sort().pop();
        if (dataSaldo && (!conta.conferido_em || dataSaldo >= conta.conferido_em)) {
          await db.atualizar('contas', conta.id, { conferido_em: dataSaldo, conferido_saldo: sf.valor });
          await recarregarCadastros();
        }
      }
    } catch (e) {
      await db.excluirOnde('lancamentos', 'lote_id', lote.id).catch(() => {});
      await db.excluir('lotes_importacao', lote.id).catch(() => {});
      throw e;
    }
    await Promise.all([recarregarLancamentos(), recarregarLotes()]);
  });
  toast(`${sel.length} lançamento(s) importado(s).`);
  const loteCriado = S.lotes[0];
  guardarOriginal(cfg, sel, loteCriado).catch((e) => toast('Importado, mas não consegui guardar o arquivo no Drive: ' + e.message, 'erro'));
  imp = null; origemArquivo = null; arquivoAtual = null;
  render(el);
}

// =====================================================================
// Caixa de entrada (Google Drive + Telegram) e arquivo original no Drive
// =====================================================================
const driveOk = () => !!S.integracao?.drive_url;

function caixaHTML() {
  if (!driveOk() && !(caixa && caixa.length)) {
    return `<h2>📥 Caixa de entrada</h2><p class="dica">Conecte o Google Drive ou o Telegram (Mais e ajustes → Integrações) para ver aqui as faturas e extratos que ainda não foram usados.</p>`;
  }
  if (caixa === null) return '<h2>📥 Caixa de entrada</h2><p class="dica">Carregando…</p>';
  const nomeOrig = { drive: '📁 Drive', telegram: '✈️ Telegram' };
  return `<div class="cab-lista"><h2>📥 Caixa de entrada <small class="dica">(ainda não usados)</small></h2><button class="btn btn-peq" data-caixa-recarregar>🔄</button></div>
    ${caixa.length ? `<div class="lista">${caixa.map((c, i) => `<div class="item item-estatico">
      <div class="item-icone">${/pdf/.test(c.mime) ? '📄' : /image/.test(c.mime) ? '🖼️' : '📑'}</div>
      <div class="item-meio"><div class="item-titulo">${esc(c.nome)}</div><div class="item-sub">${nomeOrig[c.origem] || c.origem} · ${new Date(c.criado).toLocaleDateString('pt-BR')} · ${(c.tamanho / 1024).toFixed(0)} KB</div></div>
      <div class="item-fim acoes-linha"><button class="btn btn-peq btn-primario" data-caixa-usar="${i}">Importar</button><button class="btn btn-peq" data-caixa-descartar="${i}" title="Mover para Revisar/Descartados">🗂️</button></div>
    </div>`).join('')}</div>` : '<p class="dica">✅ Nada pendente. Coloque PDFs na pasta “00_Caixa_de_Entrada” do Drive ou envie para o bot do Telegram.</p>'}
    ${driveOk() ? '<p class="dica mt">Depois de importar, o arquivo é movido para <b>01_Arquivo_por_Mes</b> (já usado), na pasta do mês certo.</p>' : ''}`;
}

async function carregarCaixa() {
  const itens = [];
  if (driveOk()) {
    try {
      const r = await chamarApi('drive', { acao: 'listarEntrada' });
      for (const a of r.arquivos || []) itens.push({ origem: 'drive', id: a.id, nome: a.nome, mime: a.mime, tamanho: a.tamanho, criado: a.criado });
    } catch (e) { toast('Drive: ' + e.message, 'erro'); }
  }
  try {
    const tgItens = (await db.listar('caixa_entrada', 'created_at', false)).filter((c) => c.status === 'novo' && !c.drive_file_id);
    for (const c of tgItens) itens.push({ origem: 'telegram', caixaId: c.id, fileId: c.telegram_file_id, nome: c.nome, mime: c.mime, tamanho: c.tamanho, criado: c.created_at });
  } catch { /* tabela ainda não existe */ }
  caixa = itens;
}

function ligarCaixa(el, escolher) {
  const box = el.querySelector('[data-caixa]');
  const redesenhar = () => { box.innerHTML = caixaHTML(); ligarCaixa(el, escolher); };
  if (caixa === null && (driveOk() || S.integracao?.telegram_chat_id)) { carregarCaixa().then(() => { if (box.isConnected) redesenhar(); }); return; }
  box.querySelector('[data-caixa-recarregar]')?.addEventListener('click', async (e) => { await comCarregando(e.currentTarget, carregarCaixa); redesenhar(); });
  box.querySelectorAll('[data-caixa-usar]').forEach((b) => b.onclick = async () => {
    const c = caixa[Number(b.dataset.caixaUsar)];
    await comCarregando(b, async () => {
      const r = c.origem === 'drive' ? await chamarApi('drive', { acao: 'baixar', id: c.id }) : await chamarApi('telegram?acao=arquivo', { file_id: c.fileId });
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
      await escolher(new File([bytes], c.nome, { type: c.mime || r.mime || 'application/pdf' }), c);
    });
    toast(`“${c.nome}” carregado. Escolha o destino e toque em “Ler arquivo”.`);
  });
  box.querySelectorAll('[data-caixa-descartar]').forEach((b) => b.onclick = async () => {
    const c = caixa[Number(b.dataset.caixaDescartar)];
    if (!(await confirmar('Tirar da caixa de entrada', `Mover “${esc(c.nome)}” para ${c.origem === 'drive' ? '03_Revisar_ou_Descartados' : 'descartados'}?`, [{ valor: 'sim', rotulo: 'Mover' }]))) return;
    await comCarregando(b, async () => {
      if (c.origem === 'drive') await chamarApi('drive', { acao: 'descartar', id: c.id, motivo: 'descartado no app' });
      else await db.atualizar('caixa_entrada', c.caixaId, { status: 'descartado' });
    });
    caixa = caixa.filter((x) => x !== c); redesenhar();
  });
}

const limparNomeArq = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');

/** Depois de importar: o arquivo vai para 01_Arquivo_por_Mes/AAAA/AAAA-MM_Mes/(Faturas_Cartao|Extratos_Conta) com nome padrão */
async function guardarOriginal(cfg, sel, lote) {
  const tgItem = cfg.origemArquivo?.origem === 'telegram' ? cfg.origemArquivo : null;
  if (tgItem) await db.atualizar('caixa_entrada', tgItem.caixaId, { status: 'importado', lote_id: lote?.id || null }).catch(() => {});
  if (!driveOk() || cfg.destTipo === 'app' || !lote) return;
  const ext = (cfg.arquivo.split('.').pop() || 'pdf').toLowerCase();
  const datas = sel.map((l) => l.data_pagamento).sort();
  let mes, tipo, nome;
  if (cfg.destTipo === 'cartao') {
    mes = cfg.venc.slice(0, 7); tipo = 'fatura';
    nome = `${mes}_Fatura_${limparNomeArq(cartaoPorId(cfg.destId)?.nome)}_venc-${cfg.venc}.${ext}`;
  } else {
    mes = (datas[datas.length - 1] || hoje()).slice(0, 7); tipo = 'extrato';
    nome = `${mes}_Extrato_${limparNomeArq(contaPorId(cfg.destId)?.nome)}_${datas[0]}_a_${datas[datas.length - 1]}.${ext}`;
  }
  const descricao = `${sel.length} lançamento(s) · lote ${lote.id.slice(0, 8)}`;
  let r;
  if (cfg.origemArquivo?.origem === 'drive') r = await chamarApi('drive', { acao: 'arquivar', id: cfg.origemArquivo.id, mes, tipo, nome, descricao });
  else {
    const f = cfg.arquivoObj;
    if (!f || f.size > 3 * 1024 * 1024) return;
    const base64 = await paraBase64(f);
    r = await chamarApi('drive', { acao: 'salvar', mes, tipo, nome, mime: f.type || 'application/octet-stream', base64, descricao });
  }
  if (r?.id) await db.atualizar('lotes_importacao', lote.id, { drive_file_id: r.id }).catch(() => {});
  caixa = null;
  toast(`📁 Arquivo guardado no Drive: ${mes} / ${tipo === 'fatura' ? 'Faturas_Cartao' : 'Extratos_Conta'}.`);
}

/** Pagamento do extrato que ainda não achou fatura e tem o valor do total desta fatura (pago até 20 dias antes / 45 depois do vencimento) */
function pagamentoSemFatura(cartao, venc, total) {
  if (!cartao || !venc || total == null) return null;
  const ini = somarDias(venc, -20), fim = somarDias(venc, 45);
  return S.lancs.find((x) => x.tipo === 'pagamento_fatura' && x.cartao_id === cartao.id && !x.fatura_venc &&
    x.data_movimento >= ini && x.data_movimento <= fim && Math.abs(Number(x.valor) - Number(total)) <= 0.05) || null;
}

/** Marca como pagos os itens das faturas que estes pagamentos quitam (ou volta para pendente) */
async function quitarFaturas(pagamentos, situacao = 'pago') {
  const ids = [];
  for (const p of pagamentos) {
    if (p.tipo !== 'pagamento_fatura' || !p.fatura_venc || !p.cartao_id) continue;
    ids.push(...S.lancs.filter((l) => l.cartao_id === p.cartao_id && l.data_pagamento === p.fatura_venc && (l.tipo === 'saida' || l.tipo === 'entrada') &&
      l.situacao !== situacao).map((l) => l.id));
  }
  if (ids.length) await db.atualizarVarios('lancamentos', ids, { situacao });
}

export async function desfazer(lote, botao, aoFim) {
  const ok = await confirmar('Remover importação', `Apagar os <b>${lote.quantidade}</b> lançamento(s) desta importação?<br><small>${esc(lote.descricao)}</small>`,
    [{ valor: 'sim', rotulo: 'Remover importação', classe: 'btn-perigo' }]);
  if (!ok) return;
  await comCarregando(botao, async () => {
    // pagamentos de fatura desta importação: a fatura volta a ficar pendente
    await quitarFaturas(S.lancs.filter((l) => l.lote_id === lote.id && l.tipo === 'pagamento_fatura'), 'pendente');
    await db.excluirOnde('lancamentos', 'lote_id', lote.id);
    await db.excluir('lotes_importacao', lote.id);
    await Promise.all([recarregarLancamentos(), recarregarLotes()]);
  });
  toast('Importação desfeita.');
  aoFim();
}
