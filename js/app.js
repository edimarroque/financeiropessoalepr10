// Inicialização, login e navegação
import * as db from './db.js';
import { S, recarregarTudo } from './state.js';
import { esc, toast, comCarregando } from './ui.js';
import * as painel from './views/painel.js';
import * as lancamentos from './views/lancamentos.js';
import * as cartoes from './views/cartoes.js';
import * as cadastros from './views/cadastros.js';
import * as mais from './views/mais.js';
import { abrirFormLancamento } from './views/form-lancamento.js';

const ROTAS = {
  painel: { titulo: 'Painel', icone: '📊', view: painel },
  lancamentos: { titulo: 'Lançamentos', icone: '📋', view: lancamentos },
  cartoes: { titulo: 'Cartões', icone: '💳', view: cartoes },
  cadastros: { titulo: 'Cadastros', icone: '⚙️', view: cadastros },
  mais: { titulo: 'Mais', icone: '☰', view: mais },
};

const raiz = document.getElementById('app');

function rotaAtual() {
  const r = (location.hash.replace(/^#\/?/, '') || 'painel').split('?')[0];
  return ROTAS[r] ? r : 'painel';
}

function montarCasca() {
  raiz.innerHTML = `
    <aside class="lateral">
      <div class="marca"><span class="logo">R$</span><div><b>Financeiro</b><small>Pessoal</small></div></div>
      <nav>${Object.entries(ROTAS).map(([k, r]) => `<a href="#/${k}" data-rota="${k}"><span>${r.icone}</span>${r.titulo}</a>`).join('')}</nav>
    </aside>
    <main id="tela" tabindex="-1"></main>
    <nav class="inferior">${Object.entries(ROTAS).map(([k, r]) => `<a href="#/${k}" data-rota="${k}"><span>${r.icone}</span><small>${r.titulo}</small></a>`).join('')}</nav>
    <button class="fab" aria-label="Novo lançamento" title="Novo lançamento">+</button>`;
  raiz.querySelector('.fab').onclick = () => abrirFormLancamento(null, desenhar);
}

function desenhar() {
  const r = rotaAtual();
  document.querySelectorAll('[data-rota]').forEach((a) => a.classList.toggle('ativa', a.dataset.rota === r));
  document.title = `${ROTAS[r].titulo} · Financeiro Pessoal`;
  const tela = document.getElementById('tela');
  try { ROTAS[r].view.render(tela); }
  catch (e) { console.error(e); tela.innerHTML = `<div class="aviso erro">Erro ao montar a tela: ${esc(e.message)}</div>`; }
}

function telaLogin(msg = '') {
  raiz.innerHTML = `
    <div class="login">
      <form class="login-caixa" id="f-login">
        <div class="marca grande"><span class="logo">R$</span><div><b>Financeiro Pessoal</b><small>Entre para continuar</small></div></div>
        ${msg ? `<div class="aviso">${msg}</div>` : ''}
        <label>E-mail <input type="email" name="email" autocomplete="email" required></label>
        <label>Senha <input type="password" name="senha" autocomplete="current-password" required minlength="6"></label>
        <button class="btn btn-primario largo" type="submit" data-acao="entrar">Entrar</button>
        <button class="btn largo" type="button" data-acao="cadastrar">Criar meu acesso (primeira vez)</button>
      </form>
    </div>`;
  const f = document.getElementById('f-login');
  f.onsubmit = async (e) => {
    e.preventDefault();
    await comCarregando(f.querySelector('[data-acao=entrar]'), () => db.entrar(f.email.value.trim(), f.senha.value));
  };
  f.querySelector('[data-acao=cadastrar]').onclick = async (e) => {
    if (!f.reportValidity()) return;
    const r = await comCarregando(e.currentTarget, () => db.cadastrar(f.email.value.trim(), f.senha.value));
    if (r && !r.session) telaLogin('Acesso criado! Abra o e-mail de confirmação que o Supabase enviou, clique no link e depois entre aqui.');
  };
}

function telaCarregando(txt = 'Carregando…') {
  raiz.innerHTML = `<div class="login"><div class="carregando"><span class="giro"></span> ${txt}</div></div>`;
}

let iniciado = false;
async function aoLogar(session) {
  if (!session) { iniciado = false; S.user = null; telaLogin(); return; }
  if (iniciado && S.user?.id === session.user.id) return;
  iniciado = true;
  S.user = session.user;
  telaCarregando('Carregando seus dados…');
  try {
    await recarregarTudo();
    montarCasca();
    desenhar();
  } catch (e) {
    iniciado = false;
    raiz.innerHTML = `<div class="login"><div class="login-caixa"><div class="aviso erro">${esc(e.message)}</div>
      <p class="dica">Se for o primeiro acesso, confira se o arquivo <b>supabase/schema.sql</b> foi executado no Supabase.</p>
      <button class="btn" data-recarregar>Tentar de novo</button></div></div>`;
    raiz.querySelector('[data-recarregar]').onclick = () => location.reload();
  }
}

async function iniciar() {
  if (!db.configurado) {
    raiz.innerHTML = `<div class="login"><div class="login-caixa"><div class="aviso erro">Configure o arquivo <b>js/config.js</b> com a URL e a chave anon do Supabase.</div></div></div>`;
    return;
  }
  window.addEventListener('hashchange', () => { if (S.user) desenhar(); });
  db.aoMudarLogin((s) => aoLogar(s));
  aoLogar(await db.sessaoAtual());

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
iniciar().catch((e) => toast(e.message, 'erro'));
