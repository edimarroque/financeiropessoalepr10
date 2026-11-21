// Inicialização, login e navegação
import * as db from './db.js';
import { S, recarregarTudo } from './state.js';
import { esc, toast, comCarregando, modal } from './ui.js';
import * as painel from './views/painel.js';
import * as lancamentos from './views/lancamentos.js';
import * as cartoes from './views/cartoes.js';
import * as cadastros from './views/cadastros.js';
import * as mais from './views/mais.js';
import * as importar from './views/importar.js';
import * as dashboards from './views/dashboards.js';
import * as novidades from './views/novidades.js';
import * as ajuda from './views/ajuda.js';
import { abrirFormLancamento } from './views/form-lancamento.js';
import { avatarHTML, abrirPerfil } from './views/mais.js';
import { nomeUsuario } from './state.js';
import { VERSAO } from './config.js';

// grupo: 'principal' (lateral e barra do celular), 'gestao' (lateral), 'ajuda' (lateral, rodapé), 'oculta'
const ROTAS = {
  painel: { titulo: 'Painel', icone: '🏠', view: painel, grupo: 'principal' },
  lancamentos: { titulo: 'Lançamentos', icone: '📋', view: lancamentos, grupo: 'principal' },
  cartoes: { titulo: 'Cartões', icone: '💳', view: cartoes, grupo: 'principal' },
  dashboards: { titulo: 'Dashboards', icone: '📊', view: dashboards, grupo: 'principal' },
  importar: { titulo: 'Importar', icone: '📥', view: importar, grupo: 'gestao' },
  cadastros: { titulo: 'Cadastros', icone: '⚙️', view: cadastros, grupo: 'gestao' },
  ajuda: { titulo: 'Como usar', icone: '❓', view: ajuda, grupo: 'ajuda' },
  novidades: { titulo: 'Novidades', icone: '✨', view: novidades, grupo: 'ajuda' },
  mais: { titulo: 'Mais', icone: '☰', view: mais, grupo: 'oculta' },
};
const MOBILE = ['painel', 'lancamentos', 'cartoes', 'dashboards', 'mais'];

const raiz = document.getElementById('app');

function rotaAtual() {
  const r = (location.hash.replace(/^#\/?/, '') || 'painel').split('?')[0];
  return ROTAS[r] ? r : 'painel';
}

function linkRota(k) { const r = ROTAS[k]; return `<a href="#/${k}" data-rota="${k}"><span class="nav-ic">${r.icone}</span>${r.titulo}</a>`; }

function montarCasca() {
  let novo = false;
  try { novo = localStorage.getItem('versaoVista') !== VERSAO; } catch { /* sem armazenamento */ }
  const por = (g) => Object.keys(ROTAS).filter((k) => ROTAS[k].grupo === g).map(linkRota).join('');
  raiz.innerHTML = `
    <aside class="lateral">
      <div class="marca"><span class="logo">R$</span><div><b>Financeiro</b><small>Pessoal</small></div></div>
      <nav>${por('principal')}<div class="nav-sep">Gestão</div>${por('gestao')}<div class="nav-sep">Ajuda</div>${por('ajuda').replace('Novidades</a>', `Novidades ${novo ? '<i class="ponto-novo" title="Há novidades"></i>' : ''}</a>`)}</nav>
      <div class="lateral-rodape">
        <button class="usuario" data-perfil title="Editar perfil">${avatarHTML(36)}<span><b>${esc(nomeUsuario())}</b><small>${esc(S.user?.email || '')}</small></span></button>
        <div class="lateral-acoes"><a href="#/novidades" class="versao-mini" title="Novidades desta versão">v${VERSAO}</a><button class="btn-sair" data-sair title="Sair">🚪 Sair</button></div>
      </div>
    </aside>
    <main id="tela" tabindex="-1"></main>
    <nav class="inferior">${MOBILE.map((k) => `<a href="#/${k}" data-rota="${k}"><span>${ROTAS[k].icone}</span><small>${ROTAS[k].titulo}</small></a>`).join('')}</nav>
    <button class="fab" aria-label="Novo lançamento" title="Novo lançamento">+</button>`;
  raiz.querySelector('.fab').onclick = () => abrirFormLancamento(null, desenhar);
  raiz.querySelector('[data-sair]').onclick = () => db.sair();
  raiz.querySelector('[data-perfil]').onclick = () => abrirPerfil(() => { montarCasca(); desenhar(); });
}

window.addEventListener('perfil-mudou', () => { if (S.user) { montarCasca(); desenhar(); } });

function desenhar() {
  const r = rotaAtual();
  document.querySelectorAll('[data-rota]').forEach((a) => a.classList.toggle('ativa', a.dataset.rota === r ||
    (a.dataset.rota === 'mais' && ['importar', 'cadastros', 'ajuda', 'novidades', 'mais'].includes(r))));
  if (r === 'novidades') document.querySelector('.ponto-novo')?.remove();
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
        <button class="btn-link" type="button" data-acao="esqueci">Esqueci minha senha</button>
      </form>
    </div>`;
  const f = document.getElementById('f-login');
  f.onsubmit = async (e) => {
    e.preventDefault();
    await comCarregando(f.querySelector('[data-acao=entrar]'), () => db.entrar(f.email.value.trim(), f.senha.value));
  };
  f.querySelector('[data-acao=esqueci]').onclick = async (e) => {
    if (!f.email.value.trim() || !f.email.checkValidity()) { toast('Digite seu e-mail primeiro.', 'erro'); f.email.focus(); return; }
    await comCarregando(e.currentTarget, () => db.recuperarSenha(f.email.value.trim()));
    telaLogin('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
  };
}

function novaSenha() {
  modal('Criar nova senha', `
    <form class="form"><label>Nova senha <input type="password" name="s1" minlength="6" required autocomplete="new-password"></label>
      <label>Repita a senha <input type="password" name="s2" minlength="6" required autocomplete="new-password"></label>
      <div class="acoes"><span class="espaco"></span><button class="btn btn-primario">Salvar senha</button></div></form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (f.s1.value !== f.s2.value) return toast('As senhas não são iguais.', 'erro');
      await comCarregando(f.querySelector('.btn-primario'), () => db.trocarSenha(f.s1.value));
      toast('Senha alterada.'); fechar();
    };
  });
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
  window.addEventListener('hashchange', () => { if (S.user) { desenhar(); window.scrollTo(0, 0); } });
  db.aoMudarLogin((s, evento) => { if (evento === 'PASSWORD_RECOVERY') novaSenha(); aoLogar(s); });
  aoLogar(await db.sessaoAtual());

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
iniciar().catch((e) => toast(e.message, 'erro'));
