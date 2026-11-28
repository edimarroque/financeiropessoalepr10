// Modo privacidade (v1.6.8): botão de olho no topo das telas oculta os valores (aparecem como R$ ***).
// A escolha fica guardada só neste aparelho. Os formatadores de dinheiro (brl, moedaFmt, eixos dos gráficos, relatório) consultam aqui.
const CHAVE = 'privacidade';
let ligado = false;
try { ligado = localStorage.getItem(CHAVE) === '1'; } catch { /* sem armazenamento: começa mostrando */ }
globalThis.__privacidade = ligado;
if (typeof document !== 'undefined') document.body?.classList.toggle('modo-privado', ligado);

export const OCULTO = 'R$ ***';
export const privado = () => ligado;
export function alternarPrivacidade() {
  ligado = !ligado; globalThis.__privacidade = ligado;
  try { localStorage.setItem(CHAVE, ligado ? '1' : '0'); } catch { /* ignora */ }
  document.body?.classList.toggle('modo-privado', ligado);
  return ligado;
}
