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
import * as patrimonio from './views/patrimonio.js';
import * as assistente from './views/assistente.js';
import * as integracoes from './views/integracoes.js';
import * as relatorio from './views/relatorio.js';
import { registrarPatrimonio } from './servicos/patrimonio.js';
import { atualizarCotacao } from './servicos/cotacao.js';
import { abrirFormLancamento } from './views/form-lancamento.js';
import { avatarHTML, abrirPerfil } from './views/mais.js';
import { nomeUsuario } from './state.js';
import { VERSAO } from './config.js';
import { carregarDoPerfil } from './prefs.js';
import { sincronizarRecorrentes } from './servicos/recorrentes.js';
import { ligarSessao, desligarSessao, sessaoExpirada, marcarAtividade } from './servicos/sessao.js';
import { instalar, podeInstalar } from './servicos/instalar.js';

// grupo: 'principal' (lateral e barra do celular), 'gestao' (lateral), 'ajuda' (lateral, rodapé), 'oculta'
const ROTAS = {
  painel: { titulo: 'Painel', icone: '🏠', view: painel, grupo: 'principal' },
  lancamentos: { titulo: 'Lançamentos', icone: '📋', view: lancamentos, grupo: 'principal' },
  cartoes: { titulo: 'Cartões', icone: '💳', view: cartoes, grupo: 'principal' },
  dashboards: { titulo: 'Dashboards', icone: '📊', view: dashboards, grupo: 'principal' },
  patrimonio: { titulo: 'Patrimônio', icone: '💎', view: patrimonio, grupo: 'principal' },
  assistente: { titulo: 'Assistente IA', icone: '🤖', view: assistente, grupo: 'principal' },
  importar: { titulo: 'Importar', icone: '📥', view: importar, grupo: 'gestao' },
  cadastros: { titulo: 'Cadastros', icone: '⚙️', view: cadastros, grupo: 'gestao' },
  relatorio: { titulo: 'Relatório mensal', icone: '📄', view: relatorio, grupo: 'gestao' },
  integracoes: { titulo: 'Integrações', icone: '🔌', view: integracoes, grupo: 'gestao' },
  ajuda: { titulo: 'Como usar', icone: '❓', view: ajuda, grupo: 'ajuda' },
  novidades: { titulo: 'Novidades', icone: '✨', view: novidades, grupo: 'ajuda' },
  mais: { titulo: 'Mais e ajustes', icone: '🎛️', view: mais, grupo: 'gestao' },
};
const MOBILE = ['painel', 'lancamentos', 'cartoes', 'dashboards', 'mais'];
// telas em que o botão flutuante "+" (novo lançamento) aparece — só no celular
const COM_FAB = ['painel', 'lancamentos', 'cartoes'];

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
        ${podeInstalar() ? '<button class="btn-instalar" data-instalar>📲 Instalar app</button>' : ''}
        <div class="lateral-acoes"><a href="#/novidades" class="versao-mini" title="Novidades desta versão">v${VERSAO}</a><button class="btn-sair" data-sair title="Sair">🚪 Sair</button></div>
      </div>
    </aside>
    <main id="tela" tabindex="-1"></main>
    <nav class="inferior">${MOBILE.map((k) => `<a href="#/${k}" data-rota="${k}"><span>${ROTAS[k].icone}</span><small>${k === 'mais' ? 'Mais' : ROTAS[k].titulo}</small></a>`).join('')}</nav>
    <button class="fab" aria-label="Novo lançamento" title="Novo lançamento">+</button>
    <div class="ptr" aria-hidden="true"><span>⟳</span></div>`;
  ligarAtualizar();
  raiz.querySelector('.fab').onclick = () => abrirFormLancamento(null, desenhar);
  raiz.querySelector('[data-sair]').onclick = () => sairAgora();
  raiz.querySelector('[data-instalar]')?.addEventListener('click', instalar);
  raiz.querySelector('[data-perfil]').onclick = () => abrirPerfil(() => { montarCasca(); desenhar(); });
}

// ---------- v1.6.3: atualizar sem recarregar o navegador (botão ⟳ e puxar a tela para baixo no celular) ----------
let atualizando = false;
async function atualizarDados() {
  if (atualizando || !S.user) return;
  atualizando = true;
  document.body.classList.add('atualizando');
  try {
    await recarregarTudo();
    desenhar();
    toast('Dados atualizados.');
  } catch (e) { toast('Não consegui atualizar: ' + e.message, 'erro'); }
  finally { atualizando = false; document.body.classList.remove('atualizando'); }
}

let observador = null;
function ligarAtualizar() {
  const tela = document.getElementById('tela');
  // o botão entra no topo de cada tela (as telas se redesenham sozinhas, então ele é recolocado quando some)
  const colocar = () => {
    const topo = tela.querySelector(':scope > .topo-tela');
    if (topo && !topo.querySelector('[data-atualizar-dados]')) {
      const b = document.createElement('button');
      b.className = 'btn-icone btn-atualizar'; b.dataset.atualizarDados = ''; b.type = 'button';
      b.title = 'Atualizar dados'; b.setAttribute('aria-label', 'Atualizar dados'); b.textContent = '⟳';
      b.onclick = atualizarDados;
      topo.appendChild(b);
    }
  };
  observador?.disconnect();
  observador = new MutationObserver(colocar);
  observador.observe(tela, { childList: true });
  colocar();

  const ptr = raiz.querySelector('.ptr');
  let y0 = null, dy = 0;
  const LIMIAR = 70;
  const podeComecar = (e) => window.scrollY <= 0 && !document.querySelector('.modal-fundo') && !e.target?.closest?.('input, textarea, select, .abas, .tabela-rolagem');
  window.ontouchstart = (e) => { y0 = e.touches.length === 1 && podeComecar(e) ? e.touches[0].clientY : null; dy = 0; };
  window.ontouchmove = (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { ptr.style.transform = ''; ptr.classList.remove('pronto', 'puxando'); return; }
    ptr.classList.add('puxando');
    const d = Math.min(dy * 0.5, LIMIAR + 20);
    ptr.style.transform = `translate(-50%, ${d}px) rotate(${d * 4}deg)`;
    ptr.classList.toggle('pronto', dy * 0.5 >= LIMIAR);
  };
  window.ontouchend = () => {
    if (y0 != null && dy * 0.5 >= LIMIAR) atualizarDados();
    y0 = null; dy = 0; ptr.style.transform = ''; ptr.classList.remove('pronto', 'puxando');
  };
}

window.addEventListener('perfil-mudou', () => { if (S.user) { montarCasca(); desenhar(); } });

function desenhar() {
  const r = rotaAtual();
  document.querySelectorAll('[data-rota]').forEach((a) => a.classList.toggle('ativa', a.dataset.rota === r ||
    (a.dataset.rota === 'mais' && a.closest('.inferior') && ['importar', 'cadastros', 'ajuda', 'novidades', 'mais', 'patrimonio', 'assistente', 'integracoes', 'relatorio'].includes(r))));
  if (r === 'novidades') document.querySelector('.ponto-novo')?.remove();
  const fab = document.querySelector('.fab');
  if (fab) fab.hidden = !COM_FAB.includes(r);
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
    marcarAtividade();
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

function telaCodigoMFA() {
  return new Promise((resolve) => {
    raiz.innerHTML = `
      <div class="login">
        <form class="login-caixa" id="f-mfa">
          <div class="marca grande"><span class="logo">R$</span><div><b>Verificação em 2 etapas</b><small>Digite o código de 6 dígitos do app autenticador</small></div></div>
          <label>Código <input name="codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus placeholder="000000"></label>
          <button class="btn btn-primario largo" type="submit">Confirmar</button>
          <button class="btn-link" type="button" data-sair>Sair</button>
        </form>
      </div>`;
    const f = document.getElementById('f-mfa');
    f.codigo.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const [fator] = await db.fatoresMFA();
        if (!fator) return resolve(true);
        await comCarregando(f.querySelector('.btn-primario'), () => db.verificarMFA(fator.id, f.codigo.value));
        resolve(true);
      } catch { f.codigo.select(); }
    };
    f.querySelector('[data-sair]').onclick = async () => { resolve(false); await sairAgora(); };
  });
}

function telaCarregando(txt = 'Carregando…') {
  raiz.innerHTML = `<div class="login"><div class="carregando"><span class="giro"></span> ${txt}</div></div>`;
}

let iniciado = false;
async function sairAgora(msg) {
  desligarSessao(); iniciado = false;
  await db.sair().catch(() => {});
  if (msg) telaLogin(msg);
}

async function aoLogar(session, inicial = false) {
  if (!session) { iniciado = false; S.user = null; desligarSessao(); telaLogin(); return; }
  // app reaberto depois de muito tempo parado: pede login de novo
  if (inicial && sessaoExpirada()) { await sairAgora('Sua sessão foi encerrada por inatividade. Entre novamente.'); return; }
  if (iniciado && S.user?.id === session.user.id) return;
  iniciado = true;
  S.user = session.user;
  telaCarregando('Carregando seus dados…');
  try {
    // verificação em 2 etapas: se ativada, pede o código do app autenticador antes de abrir os dados
    const nivel = await db.nivelMFA().catch(() => null);
    if (nivel && nivel.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') {
      const passou = await telaCodigoMFA();
      if (!passou) return;
      telaCarregando('Carregando seus dados…');
    }
    await recarregarTudo();
    carregarDoPerfil();
    await sincronizarRecorrentes().catch((e) => console.warn(e));
    if (S.contas.some((c) => c.moeda === 'USD') || S.investimentos.some((i) => i.moeda === 'USD')) await atualizarCotacao().catch(() => {});
    registrarPatrimonio().catch((e) => console.warn(e));
    if (!iniciado || S.user?.id !== session.user.id) return; // saiu enquanto carregava
    montarCasca();
    desenhar();
    ligarSessao(() => sairAgora('Sua sessão foi encerrada após um tempo sem uso. Entre novamente.'));
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
  db.aoMudarLogin((s, evento) => { if (evento === 'INITIAL_SESSION') return; if (evento === 'PASSWORD_RECOVERY') novaSenha(); aoLogar(s); });
  aoLogar(await db.sessaoAtual(), true);
  window.addEventListener('instalar-mudou', () => { if (S.user) { montarCasca(); desenhar(); } });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
iniciar().catch((e) => toast(e.message, 'erro'));
