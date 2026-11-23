// Tela: Novidades (o que mudou em cada versão) e perguntas frequentes
import { VERSOES, PROXIMAS } from '../versoes.js';
import { VERSAO } from '../config.js';
import { fmtData } from '../calc.js';
import { esc, toast, confirmar } from '../ui.js';
import * as db from '../db.js';

let sugestoes = null; // carregadas sob demanda

async function carregarSugestoes() {
  try { sugestoes = await db.listar('sugestoes', 'created_at'); }
  catch (e) { sugestoes = []; toast(e.message, 'erro'); }
}

// v1.6.3: modo compacto — sugestões agrupadas pela versão planejada ([v1.6.3] …), grupos fechados;
// cada sugestão mostra uma linha só e abre o texto completo ao tocar.
const gruposAbertos = new Set(['Sem versão']);
const sugAbertas = new Set();
const grupoDe = (t) => { const m = String(t).match(/^\s*\[([^\]]+)\]/); return m ? m[1] : 'Sem versão'; };
const semGrupo = (t) => String(t).replace(/^\s*\[[^\]]+\]\s*/, '');
const ordemGrupo = (g) => { const m = g.match(/^v(\d+)\.(\d+)(?:\.(\d+))?/); return m ? [0, +m[1], +m[2], +(m[3] || 0)] : [g === 'Sem versão' ? -1 : 1, 0, 0, 0]; };
const cmpGrupo = (a, b) => { const x = ordemGrupo(a), y = ordemGrupo(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.localeCompare(b); };

function sugestoesHTML() {
  if (sugestoes === null) return '<p class="dica">Carregando…</p>';
  const abertas = sugestoes.filter((x) => !x.feito), feitas = sugestoes.filter((x) => x.feito);
  const item = (x) => `
    <li class="sug ${x.feito ? 'feito' : ''} ${sugAbertas.has(x.id) ? 'aberta' : ''}" data-sug="${x.id}">
      <div class="sug-linha">
        <input type="checkbox" data-sug-feito="${x.id}" ${x.feito ? 'checked' : ''} aria-label="Marcar como feito">
        <button type="button" class="sug-texto" data-sug-abrir="${x.id}" aria-expanded="${sugAbertas.has(x.id)}">${esc(semGrupo(x.texto))}</button>
      </div>
      <div class="sug-detalhe"><small>Anotada em ${new Date(x.created_at).toLocaleDateString('pt-BR')}</small>
        <button class="btn btn-peq" data-sug-apagar="${x.id}" aria-label="Apagar">🗑️ Apagar</button></div>
    </li>`;
  const grupos = new Map();
  for (const x of abertas) { const g = grupoDe(x.texto); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(x); }
  const blocos = [...grupos.keys()].sort(cmpGrupo).map((g) => `
    <details class="sug-grupo" data-grupo="${esc(g)}" ${gruposAbertos.has(g) ? 'open' : ''}>
      <summary><b>${esc(g)}</b> <span class="pill">${grupos.get(g).length}</span></summary>
      <ul class="sug-lista">${grupos.get(g).map(item).join('')}</ul>
    </details>`).join('');
  return `
    ${blocos || '<p class="dica">Nenhuma sugestão pendente.</p>'}
    ${feitas.length ? `<details class="sug-grupo"><summary class="dica">Feitas (${feitas.length})</summary><ul class="sug-lista">${feitas.map(item).join('')}</ul></details>` : ''}`;
}

const FAQ = [
  ['Meus dados ficam seguros?', 'Sim. Eles ficam no seu banco do Supabase e só são vistos depois do login. Cada usuário só enxerga os próprios dados (regra aplicada no próprio banco) e novos cadastros estão desligados.'],
  ['Por que um gasto do cartão aparece em outro mês?', 'O mês de um lançamento é o da data de pagamento. No cartão, é o vencimento da fatura: uma compra feita no dia 20 entra na fatura que vence no mês seguinte, igual à planilha.'],
  ['Como marcar uma fatura como paga?', 'Em Cartões, escolha a fatura e toque em “Pagar fatura”. O valor sai da conta escolhida e os itens ficam pagos, sem contar a despesa duas vezes.'],
  ['Importei algo errado. E agora?', 'Em Importar, na lista “Importações feitas”, toque em 🗑️ Remover (ou abra um lançamento importado → “Remover a importação inteira”). Todos os lançamentos daquela importação são apagados e você pode importar de novo.'],
  ['Funciona no Android e no iPhone? Como instalo?', 'Sim, nos dois. Android: abra no Chrome e toque em “📲 Instalar app”. iPhone: abra no Safari → Compartilhar → “Adicionar à Tela de Início”. O passo a passo completo está em Como usar → Instalar no celular.'],
  ['Por que o app pediu login de novo?', 'Por segurança, a sessão é encerrada depois de 15 minutos sem uso (dá para mudar em Mais e ajustes → Segurança). Enquanto você estiver mexendo, ela nunca fecha.'],
  ['Como faço backup?', 'Em Mais: “Exportar para Excel (CSV)” ou “Baixar backup completo (JSON)”.'],
];

let versaoNova = null; // abre a versão mais nova só na primeira visita depois de atualizar

export function render(el) {
  if (versaoNova === null) { try { versaoNova = localStorage.getItem('versaoVista') !== VERSAO; } catch { versaoNova = false; } }
  if (sugestoes === null) carregarSugestoes().then(() => { if (el.isConnected) render(el); });
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Novidades</h1><p class="dica">Você está na versão <b>${VERSAO}</b></p></div><a class="btn" href="#/ajuda">❓ Como usar</a></div>
    <section class="cartao-bloco sugestoes" id="sugestoes">
      <h2>💡 Sugestões de melhorias</h2>
      <form class="sug-form" data-sug-form>
        <input name="texto" maxlength="1000" placeholder="Nova correção ou melhoria…" autocomplete="off" aria-label="Nova sugestão">
        <button class="btn btn-primario">Adicionar</button>
      </form>
      ${sugestoesHTML()}
    </section>
    <div class="linha-tempo">
      <p class="dica">Toque numa versão para ver o que mudou.</p>
      ${VERSOES.map((v, i) => `
        <details class="cartao-bloco versao ${i === 0 ? 'atual' : ''}" ${i === 0 && versaoNova ? 'open' : ''}>
          <summary class="versao-topo"><span class="versao-tag">v${esc(v.versao)}</span><h2>${esc(v.titulo)}</h2><small>${fmtData(v.data)}</small></summary>
          <h3>Novas funções e melhorias</h3>
          <ul class="lista-simples">${v.novidades.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
          ${v.correcoes.length ? `<h3>Correções</h3><ul class="lista-simples">${v.correcoes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        </details>`).join('')}
      <details class="cartao-bloco versao proxima">
        <summary class="versao-topo"><span class="versao-tag">em breve</span><h2>Próximas versões</h2></summary>
        <ul class="lista-simples">${PROXIMAS.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </details>
    </div>
    <section class="cartao-bloco">
      <h2>Perguntas frequentes</h2>
      ${FAQ.map(([p, r]) => `<details class="faq"><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('')}
    </section>`;
  try { localStorage.setItem('versaoVista', VERSAO); } catch { /* sem armazenamento */ }

  const f = el.querySelector('[data-sug-form]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const texto = f.texto.value.trim();
    if (!texto) return f.texto.focus();
    const b = f.querySelector('button'); b.disabled = true;
    try {
      const [novo] = await db.inserir('sugestoes', [{ texto }]);
      sugestoes.push(novo);
      gruposAbertos.add(grupoDe(texto));
      render(el);
      el.querySelector('[data-sug-form] input').focus();
    } catch (err) { toast(err.message, 'erro'); b.disabled = false; }
  };
  el.querySelectorAll('.sug-grupo[data-grupo]').forEach((d) => d.ontoggle = () => { if (d.open) gruposAbertos.add(d.dataset.grupo); else gruposAbertos.delete(d.dataset.grupo); });
  el.querySelectorAll('[data-sug-abrir]').forEach((b) => b.onclick = () => {
    const id = b.dataset.sugAbrir, li = b.closest('.sug');
    if (sugAbertas.has(id)) sugAbertas.delete(id); else sugAbertas.add(id);
    li.classList.toggle('aberta', sugAbertas.has(id)); b.setAttribute('aria-expanded', String(sugAbertas.has(id)));
  });
  el.querySelectorAll('[data-sug-feito]').forEach((c) => c.onchange = async () => {
    const x = sugestoes.find((s) => s.id === c.dataset.sugFeito);
    try { await db.atualizar('sugestoes', x.id, { feito: c.checked }); x.feito = c.checked; render(el); }
    catch (err) { toast(err.message, 'erro'); c.checked = !c.checked; }
  });
  el.querySelectorAll('[data-sug-apagar]').forEach((b) => b.onclick = async () => {
    const x = sugestoes.find((s) => s.id === b.dataset.sugApagar);
    if (!(await confirmar('Apagar sugestão', `Apagar “${esc(x.texto)}”?`, [{ valor: 'sim', rotulo: 'Apagar', classe: 'btn-perigo' }]))) return;
    try { await db.excluir('sugestoes', x.id); sugestoes = sugestoes.filter((s) => s.id !== x.id); render(el); }
    catch (err) { toast(err.message, 'erro'); }
  });
}
