// Tela: Assistente IA (Gemini) — análise financeira sob demanda e bate-papo sobre os seus dados.
// A IA só é chamada quando você toca nos botões (para não gastar cota à toa).
import * as db from '../db.js';
import { S } from '../state.js';
import { esc, brl, toast, comCarregando } from '../ui.js';
import { contextoIA } from '../contexto-ia.js';
import { cotacaoUSD } from '../servicos/cotacao.js';
import { chamarApi } from '../servicos/api.js';

let aba = 'analise';
let analises = null;          // histórico de análises salvas
let conversa = [];            // [{ papel: 'usuario'|'ia', texto }]
try { conversa = JSON.parse(localStorage.getItem('chatIA') || '[]').slice(-30); } catch { /* */ }
const salvarConversa = () => { try { localStorage.setItem('chatIA', JSON.stringify(conversa.slice(-30))); } catch { /* */ } };

const SUGESTOES = [
  'Onde estou gastando mais este mês?',
  'Quanto paguei de juros, IOF e tarifas nos últimos meses?',
  'Que assinaturas eu poderia cortar?',
  'Consigo guardar R$ 1.000 por mês? Onde cortar?',
  'Minhas parcelas futuras estão pesadas?',
  'Tem algum gasto estranho ou duplicado?',
];

const dados = () => ({ lancamentos: S.lancs, categorias: S.categorias, contas: S.contas, cartoes: S.cartoes, metas: S.metas,
  metas_movimentos: S.metasMov, dividas: S.dividas, investimentos: S.investimentos });

/** Texto simples com **negrito** e listas "- " → HTML seguro */
function formatar(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map((l) => (/^\s*[-•*]\s+/.test(l) ? `<li>${l.replace(/^\s*[-•*]\s+/, '')}</li>` : `<p>${l}</p>`)).join('')
    .replace(/(<li>.*?<\/li>)+/g, (m) => `<ul>${m}</ul>`).replace(/<p><\/p>/g, '');
}

export function render(el) {
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Assistente IA</h1><p class="dica">Gemini analisa os seus números — só quando você pedir.</p></div></div>
    <div class="abas" role="tablist">
      ${[['analise', '🔎 Análise financeira'], ['chat', '💬 Perguntar']].map(([v, t]) => `<button class="aba ${aba === v ? 'ativa' : ''}" data-aba="${v}" role="tab">${t}</button>`).join('')}
    </div>
    <div data-conteudo></div>`;
  const c = el.querySelector('[data-conteudo]');
  if (aba === 'analise') renderAnalise(c, () => render(el)); else renderChat(c, () => render(el));
  el.querySelectorAll('[data-aba]').forEach((b) => b.onclick = () => { aba = b.dataset.aba; render(el); });
}

// ---------------- Análise ----------------
async function carregarAnalises() {
  try { analises = (await db.listar('ia_analises', 'created_at', false)).filter((a) => a.tipo === 'analise').slice(0, 10); }
  catch { analises = []; }
}

function cartaoAnalise(a) {
  const x = a.conteudo || {};
  const ic = { alerta: '🚨', oportunidade: '💡', positivo: '✅' };
  const economia = (x.destaques || []).reduce((s, d) => s + (Number(d.economia_mensal) || 0), 0);
  return `<section class="cartao-bloco ia-analise">
    <div class="cab-lista"><h2>Saúde financeira: <span class="ia-nota nota-${Math.max(0, Math.min(10, x.nota || 0)) >= 7 ? 'boa' : (x.nota || 0) >= 4 ? 'media' : 'ruim'}">${esc(x.nota ?? '—')}/10</span></h2>
      <small class="dica">${new Date(a.created_at).toLocaleString('pt-BR')} · ${esc(a.periodo)}</small></div>
    <div class="ia-texto">${formatar(x.resumo || '')}</div>
    ${economia ? `<div class="aviso ok">💰 Economia possível estimada: <b>${brl(economia)}/mês</b> (${brl(economia * 12)}/ano).</div>` : ''}
    <div class="ia-destaques">${(x.destaques || []).map((d) => `<div class="ia-dest ia-${esc(d.tipo)}"><b>${ic[d.tipo] || '•'} ${esc(d.titulo)}</b><p>${formatar(d.texto)}</p>${d.economia_mensal ? `<small>economia ~${brl(d.economia_mensal)}/mês</small>` : ''}</div>`).join('')}</div>
    ${(x.acoes || []).length ? `<h3>Ações para o próximo mês</h3><ol class="lista-simples">${x.acoes.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
  </section>`;
}

function renderAnalise(el, rerender) {
  if (analises === null) carregarAnalises().then(() => { if (el.isConnected) rerender(); });
  const ultima = analises?.[0];
  el.innerHTML = `
    <section class="cartao-bloco">
      <h2>🤖 Analisar meu cenário</h2>
      <p class="dica">A IA recebe um resumo dos seus números (totais por mês e categoria, maiores gastos, juros/IOF/tarifas, assinaturas, orçamento, parcelas futuras, metas e dívidas) e aponta onde estão os maiores gastos, desperdícios e o que fazer.</p>
      <div class="acoes"><label class="form-linha">Período <select data-meses><option value="3">Últimos 3 meses</option><option value="6" selected>Últimos 6 meses</option><option value="12">Últimos 12 meses</option></select></label>
        <span class="espaco"></span><button class="btn btn-primario" data-analisar>✨ Gerar análise</button></div>
      ${ultima ? `<p class="dica">Última análise: ${new Date(ultima.created_at).toLocaleString('pt-BR')}. Gere outra só quando houver lançamentos novos.</p>` : ''}
    </section>
    ${analises === null ? '<p class="dica">Carregando…</p>' : (analises.length ? cartaoAnalise(ultima) : '')}
    ${analises && analises.length > 1 ? `<details><summary class="dica">Análises anteriores (${analises.length - 1})</summary>${analises.slice(1).map(cartaoAnalise).join('')}</details>` : ''}`;
  el.querySelector('[data-analisar]').onclick = async (e) => {
    const meses = Number(el.querySelector('[data-meses]').value);
    const contexto = contextoIA(dados(), { meses, cotacao: cotacaoUSD() });
    const r = await comCarregando(e.currentTarget, () => chamarApi('ia', { acao: 'analise', contexto }));
    const conteudo = { resumo: r.resumo, nota: r.nota, destaques: r.destaques, acoes: r.acoes, modelo: r.modelo };
    try { const [salva] = await db.inserir('ia_analises', [{ tipo: 'analise', periodo: `últimos ${meses} meses`, conteudo }]); analises = [salva, ...(analises || [])]; }
    catch { analises = [{ created_at: new Date().toISOString(), periodo: `últimos ${meses} meses`, conteudo }, ...(analises || [])]; }
    toast('Análise pronta.'); rerender();
  };
}

// ---------------- Chat ----------------
function renderChat(el, rerender) {
  el.innerHTML = `
    <section class="cartao-bloco chat-ia">
      <div class="chat-msgs" data-msgs>${conversa.length ? conversa.map((m) => `<div class="msg msg-${m.papel}">${m.papel === 'ia' ? formatar(m.texto) : esc(m.texto)}</div>`).join('')
        : `<div class="msg msg-ia"><p>Oi! Pergunte qualquer coisa sobre suas finanças. Eu vejo os totais dos últimos 6 meses e os lançamentos dos últimos 90 dias.</p></div>`}</div>
      <div class="chat-sugestoes">${SUGESTOES.map((s) => `<button class="chip" data-sug>${esc(s)}</button>`).join('')}</div>
      <form class="chat-form" data-form><input name="p" maxlength="1000" placeholder="Pergunte sobre seus gastos…" autocomplete="off" aria-label="Pergunta"><button class="btn btn-primario">Enviar</button></form>
      ${conversa.length ? '<button class="btn-link" data-limpar>Limpar conversa</button>' : ''}
      <p class="dica">Também dá para perguntar pelo Telegram (termine a mensagem com “?”).</p>
    </section>`;
  const msgs = el.querySelector('[data-msgs]');
  msgs.scrollTop = msgs.scrollHeight;
  const f = el.querySelector('[data-form]');
  const enviar = async (texto) => {
    texto = texto.trim();
    if (!texto) return;
    conversa.push({ papel: 'usuario', texto }); salvarConversa();
    msgs.insertAdjacentHTML('beforeend', `<div class="msg msg-usuario">${esc(texto)}</div><div class="msg msg-ia digitando"><span class="giro"></span> pensando…</div>`);
    msgs.scrollTop = msgs.scrollHeight;
    f.p.value = ''; f.querySelector('button').disabled = true;
    try {
      const contexto = contextoIA(dados(), { meses: 6, lancamentosDias: 90, cotacao: cotacaoUSD() });
      const r = await chamarApi('ia', { acao: 'chat', contexto, mensagens: conversa.slice(-10) });
      conversa.push({ papel: 'ia', texto: r.texto }); salvarConversa();
    } catch (e) { conversa.pop(); salvarConversa(); toast(e.message, 'erro'); }
    rerender();
    document.querySelector('.chat-form input')?.focus();
  };
  f.onsubmit = (e) => { e.preventDefault(); enviar(f.p.value); };
  el.querySelectorAll('[data-sug]').forEach((b) => b.onclick = () => enviar(b.textContent));
  el.querySelector('[data-limpar]')?.addEventListener('click', () => { conversa = []; salvarConversa(); rerender(); });
}
