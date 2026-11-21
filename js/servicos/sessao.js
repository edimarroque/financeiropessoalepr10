// Encerra a sessão depois de X minutos sem mexer no app (padrão 15). Enquanto estiver usando, nunca encerra.
import { prefs } from '../prefs.js';

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'pointermove'];
let timer = null, aviso = null, ultimoToque = 0, ligado = false, aoExpirar = null;

const minutos = () => Math.max(1, Number(prefs().sessaoMin) || 15);
export const marcarAtividade = () => { try { localStorage.setItem('ultimaAtividade', String(Date.now())); } catch { /* */ } };

export function sessaoExpirada() {
  try {
    const t = Number(localStorage.getItem('ultimaAtividade') || 0);
    return t > 0 && Date.now() - t > minutos() * 60000;
  } catch { return false; }
}

function fecharAviso() { aviso?.remove(); aviso = null; }

function agendar() {
  clearTimeout(timer);
  timer = setTimeout(mostrarAviso, Math.max(5000, minutos() * 60000 - 60000));
}

function mostrarAviso() {
  if (aviso) return;
  let resta = 60;
  aviso = document.createElement('div');
  aviso.className = 'sessao-aviso';
  aviso.innerHTML = `<div><b>Sessão parada</b><span>Por segurança, vou sair em <b data-s>${resta}</b> s.</span></div><button class="btn btn-primario" data-continuar>Continuar usando</button>`;
  document.body.appendChild(aviso);
  aviso.querySelector('[data-continuar]').onclick = () => atividade(true);
  const t = setInterval(() => {
    if (!aviso) return clearInterval(t);
    resta--;
    const s = aviso.querySelector('[data-s]'); if (s) s.textContent = resta;
    if (resta <= 0) { clearInterval(t); fecharAviso(); desligarSessao(); aoExpirar && aoExpirar(); }
  }, 1000);
}

function atividade(forcar = false) {
  const agora = Date.now();
  if (aviso && !forcar) return; // com o aviso aberto, só o botão continua
  if (!forcar && agora - ultimoToque < 15000) return;
  ultimoToque = agora;
  fecharAviso(); marcarAtividade(); agendar();
}
const ouvinte = () => atividade();

export function ligarSessao(sair) {
  aoExpirar = sair;
  if (ligado) return atividade(true);
  ligado = true;
  EVENTOS.forEach((e) => window.addEventListener(e, ouvinte, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ligado && sessaoExpirada()) { desligarSessao(); aoExpirar && aoExpirar(); }
  });
  atividade(true);
}

export function desligarSessao() {
  ligado = false; clearTimeout(timer); fecharAviso();
  EVENTOS.forEach((e) => window.removeEventListener(e, ouvinte, { capture: true }));
}

export function reiniciarSessao() { if (ligado) atividade(true); }
