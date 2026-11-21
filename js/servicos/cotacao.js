// Cotação do dólar (USD → BRL) para contas e investimentos em dólar.
// Busca a cotação do dia (AwesomeAPI, grátis) no máximo a cada 1 h; se falhar, usa a última salva ou a informada à mão.
let cache = null;
try { cache = JSON.parse(localStorage.getItem('cotacaoUSD') || 'null'); } catch { /* */ }

export const cotacaoUSD = () => (cache && Number(cache.valor)) || 5.5;
export const infoCotacao = () => cache;

export async function atualizarCotacao(forcar = false) {
  if (!forcar && cache && Date.now() - cache.em < 3600000) return cotacaoUSD();
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { cache: 'no-store' });
    const j = await r.json();
    const v = Number(j?.USDBRL?.bid);
    if (v > 0) { cache = { valor: Math.round(v * 10000) / 10000, em: Date.now(), fonte: 'AwesomeAPI' }; salvar(); }
  } catch { /* sem internet: segue com a última */ }
  return cotacaoUSD();
}

export function definirCotacaoManual(v) {
  cache = { valor: Number(v), em: Date.now(), fonte: 'manual' }; salvar();
}

function salvar() { try { localStorage.setItem('cotacaoUSD', JSON.stringify(cache)); } catch { /* */ } }

/** Converte para reais um valor na moeda indicada */
export const emReais = (valor, moeda = 'BRL') => (moeda === 'USD' ? Math.round(Number(valor) * cotacaoUSD() * 100) / 100 : Number(valor));

const fmtUSD = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
export const usd = (v) => fmtUSD.format(Number(v) || 0);
export const moedaFmt = (v, moeda) => (moeda === 'USD' ? usd(v) : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0));
