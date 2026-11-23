// Função da Vercel: lê fatura de cartão ou extrato bancário (PDF ou imagens das páginas) com o Gemini
// e devolve os lançamentos em JSON. A chave do Gemini fica SÓ aqui, na variável GEMINI_API_KEY da Vercel.
//
// POST /api/ler-pdf   Authorization: Bearer <token do login Supabase>
// corpo: { tipo: 'cartao' | 'extrato', arquivos: [{ mimeType, data(base64) }], bloco?: { de, ate, total } }
//   bloco (v1.6.3): o app divide PDFs grandes em partes de poucas páginas (imagens) e manda uma por vez;
//   cada lançamento volta com "pagina" (1 = primeira imagem enviada) para o app emendar as partes.
// resposta: { modelo, vencimento, totalFatura, periodoInicio, periodoFim, saldoInicial, saldoFinal, lancamentos: [...] }
//
// Substitui os Apps Scripts de conversão (Itaú salário, Itaú pessoal, XP OFX e XP CSV).

const SUPABASE_URL = 'https://sqkvmpuhtsjeabmjdvgc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxa3ZtcHVodHNqZWFibWpkdmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMjI1NDAsImV4cCI6MjExMDc5ODU0MH0.8ASaYhS-lFDWVrvcAnqndClmiJV45tvCeW1S4YvyHCQ';
const MODELOS_PADRAO = 'gemini-3.6-flash,gemini-2.5-flash,gemini-flash-latest';
const TIPOS_ACEITOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const REGRAS_COMUNS =
  'Datas sempre no formato AAAA-MM-DD, com o ano completo e correto. Valores como número com ponto decimal (ex.: -129.2), sem R$. ' +
  'Copie a descrição como está no documento, sem o indicador de parcela. ' +
  'Não invente lançamentos; se um campo não existir no documento, use null.';

const PROMPT_CARTAO =
  'Você recebe uma FATURA DE CARTÃO DE CRÉDITO. Leia TODAS as páginas, incluindo cartões titulares e adicionais. ' +
  'Extraia cada lançamento: compras à vista e parceladas, anuidade, tarifas, IOF (inclusive de compras internacionais e IOF rotativo), ' +
  'juros (mora, rotativo, refinanciamento/parcelamento de fatura), multas contratuais e demais encargos, inclusive os que aparecem no final do documento. ' +
  'IGNORE: subtotais, totais por cartão, pagamento(s) da fatura anterior, saldo anterior, limites, resumos e simulações de parcelamento. ' +
  'Compras e encargos com valor NEGATIVO; estornos e créditos lançados nesta fatura com valor POSITIVO. ' +
  "Parcelas: se houver 'X/Y' ou 'X de Y', preencha parcelaAtual=X e parcelaTotal=Y; senão null. " +
  'Use o ano correto de cada data considerando o vencimento (compra de dezembro numa fatura que vence em janeiro é do ano anterior). ' +
  'portador = nome impresso do cartão (titular ou adicional) de cada bloco. ' +
  'Informe vencimento e totalFatura (valor total a pagar desta fatura, positivo). ' +
  'Confira: a soma dos lançamentos com sinal invertido deve bater com totalFatura. ' + REGRAS_COMUNS;

const PROMPT_EXTRATO =
  'Você recebe um EXTRATO DE CONTA BANCÁRIA (conta corrente ou conta salário). Leia TODAS as páginas. ' +
  'Extraia cada movimentação: ENTRADAS (salário, PIX/TED/DOC recebidos, depósitos, rendimentos, estornos, resgates) com valor POSITIVO e ' +
  'SAÍDAS (PIX/TED enviados, pagamentos, boletos, pagamento de fatura de cartão, débitos automáticos, tarifas, saques, compras no débito, aplicações) com valor NEGATIVO. ' +
  'IGNORE linhas de saldo (SALDO DO DIA, SALDO ANTERIOR, SALDO FINAL, saldo disponível), limites e resumos. ' +
  'Informe periodoInicio, periodoFim, saldoInicial (saldo antes da primeira movimentação) e saldoFinal (saldo depois da última) quando aparecerem. portador = null. ' +
  REGRAS_COMUNS;

const nul = (type) => ({ type, nullable: true });
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    vencimento: nul('STRING'), periodoInicio: nul('STRING'), periodoFim: nul('STRING'),
    totalFatura: nul('NUMBER'), saldoInicial: nul('NUMBER'), saldoFinal: nul('NUMBER'),
    lancamentos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          data: { type: 'STRING' }, descricao: { type: 'STRING' }, valor: { type: 'NUMBER' },
          portador: nul('STRING'), parcelaAtual: nul('INTEGER'), parcelaTotal: nul('INTEGER'), pagina: nul('INTEGER'),
        },
        required: ['data', 'descricao', 'valor'],
      },
    },
  },
  required: ['lancamentos'],
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// a Vercel corta em 60 s (erro 504); paramos antes e devolvemos um erro claro (LER_PDF_TEMPO_MAX só para testes)
const tempoMax = () => Number(process.env.LER_PDF_TEMPO_MAX) || 50_000;

function textoBloco(bloco) {
  if (!bloco) return '';
  const de = Number(bloco.de), ate = Number(bloco.ate), total = Number(bloco.total);
  if (!(de >= 1 && ate >= de && total >= ate)) return '';
  return ` ATENÇÃO: as imagens são SÓ as páginas ${de} a ${ate} de um documento de ${total} páginas (cada imagem é uma página, na ordem). ` +
    'Extraia todos os lançamentos visíveis nessas páginas, inclusive os da primeira e da última imagem, mesmo que pareçam continuação. ' +
    'Em cada lançamento informe pagina = número da imagem onde ele aparece (1 = primeira imagem enviada). ' +
    'Campos de cabeçalho (vencimento, totalFatura, período, saldos) só se aparecerem nestas páginas; senão null.';
}

async function usuarioLogado(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok;
}

async function chamarGemini(prompt, arquivos, apiKey) {
  const inicio = Date.now();
  const TEMPO_MAX = tempoMax();
  const modelos = (process.env.GEMINI_MODELS || MODELOS_PADRAO).split(',').map((m) => m.trim()).filter(Boolean);
  const body = JSON.stringify({
    contents: [{ parts: [...arquivos.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } })), { text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  });
  let ultimoErro = '';
  for (const modelo of modelos) {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const resta = TEMPO_MAX - (Date.now() - inicio);
      if (resta < 5000) { const e = new Error('A leitura demorou demais. O app vai tentar esta parte de novo.'); e.status = 503; e.tempo = true; throw e; }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), resta);
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body, signal: ctl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') { const e = new Error('A leitura demorou demais. O app vai tentar esta parte de novo.'); e.status = 503; e.tempo = true; throw e; }
        ultimoErro = `${modelo}: ${err?.message || err}`;
        continue;
      }
      clearTimeout(timer);
      if (r.ok) {
        const j = await r.json();
        const texto = (j?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').replace(/```[a-z]*\n?/gi, '').trim();
        if (texto) {
          try { return { json: JSON.parse(texto), modelo }; } catch { ultimoErro = `${modelo}: resposta em formato inválido`; continue; }
        }
        ultimoErro = `${modelo}: resposta vazia (${j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || 'sem motivo'})`;
        continue;
      }
      const txt = (await r.text()).slice(0, 300);
      ultimoErro = `${modelo} HTTP ${r.status}: ${txt}`;
      if (r.status === 401 || r.status === 403) { const e = new Error('A chave do Gemini foi recusada. Confira GEMINI_API_KEY na Vercel.'); e.status = 502; throw e; }
      if (r.status === 404 || r.status === 400) break; // modelo indisponível: próximo da lista
      await esperar(Math.min(r.status === 429 || r.status === 503 ? 4000 * tentativa : 1500, Math.max(0, TEMPO_MAX - (Date.now() - inicio) - 5000)));
    }
  }
  const e = new Error('O Gemini não conseguiu ler o arquivo agora. Tente de novo em alguns minutos. Detalhe: ' + ultimoErro);
  e.status = 502;
  throw e;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    if (!(await usuarioLogado(req))) return res.status(401).json({ erro: 'Faça login novamente.' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ erro: 'Leitura por IA ainda não configurada: falta a variável GEMINI_API_KEY na Vercel.' });

    const { tipo, arquivos, bloco } = req.body || {};
    if (tipo !== 'cartao' && tipo !== 'extrato') return res.status(400).json({ erro: 'Tipo inválido.' });
    if (!Array.isArray(arquivos) || !arquivos.length || arquivos.length > 30 ||
        arquivos.some((a) => !TIPOS_ACEITOS.has(a?.mimeType) || typeof a?.data !== 'string' || !a.data)) {
      return res.status(400).json({ erro: 'Arquivo inválido.' });
    }

    const prompt = (tipo === 'cartao' ? PROMPT_CARTAO : PROMPT_EXTRATO) + textoBloco(bloco);
    const { json, modelo } = await chamarGemini(prompt, arquivos, apiKey);
    return res.status(200).json({ ...json, modelo });
  } catch (e) {
    return res.status(e.status || 500).json({ erro: e.message || String(e), tempo: !!e.tempo });
  }
}
