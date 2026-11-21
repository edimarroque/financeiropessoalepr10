// Instalar como app (PWA): Android/Chrome/Edge usam o aviso do navegador; iPhone mostra o passo a passo.
import { modal } from '../ui.js';

let pedido = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e; window.dispatchEvent(new Event('instalar-mudou')); });
window.addEventListener('appinstalled', () => { pedido = null; window.dispatchEvent(new Event('instalar-mudou')); });

export const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const podeInstalar = () => !instalado();

export const PASSOS_ANDROID = [
  'Abra o site no Google Chrome do celular.',
  'Toque em “📲 Instalar app” aqui no app (ou no menu ⋮ do Chrome → “Instalar app” / “Adicionar à tela inicial”).',
  'Confirme em “Instalar”. O ícone “Financeiro” aparece na tela inicial e abre em tela cheia.',
];
export const PASSOS_IPHONE = [
  'Abra o site no Safari (no iPhone a instalação é feita pelo Safari).',
  'Toque no botão Compartilhar (quadrado com a seta para cima, na barra de baixo).',
  'Role e toque em “Adicionar à Tela de Início”, depois em “Adicionar”.',
  'Abra pelo ícone “Financeiro”: ele funciona como app, em tela cheia.',
];

export async function instalar() {
  if (instalado()) return modal('Instalar app', '<p>✅ O app já está instalado neste aparelho.</p>');
  if (pedido) {
    pedido.prompt();
    const r = await pedido.userChoice.catch(() => null);
    pedido = null;
    window.dispatchEvent(new Event('instalar-mudou'));
    if (r && r.outcome === 'accepted') return;
  }
  const lista = (p) => `<ol class="lista-simples">${p.map((x) => `<li>${x}</li>`).join('')}</ol>`;
  modal('Instalar o app no celular', `
    <p class="dica">Funciona no <b>Android</b> e no <b>iPhone</b>. Os dados são os mesmos do computador (ficam no seu banco online).</p>
    ${ehIOS() ? `<h3>📱 iPhone</h3>${lista(PASSOS_IPHONE)}<h3>🤖 Android</h3>${lista(PASSOS_ANDROID)}`
      : `<h3>🤖 Android</h3>${lista(PASSOS_ANDROID)}<h3>📱 iPhone</h3>${lista(PASSOS_IPHONE)}`}
    <h3>💻 Computador</h3><p>No Chrome ou Edge, clique no ícone de instalar (⊕) na barra de endereço.</p>`);
}
