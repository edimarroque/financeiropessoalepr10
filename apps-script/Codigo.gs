/**
 * Financeiro Pessoal — ponte com o Google Drive (pasta Aplicativo_Financeiro_WEB)
 * Como instalar (uma vez só):
 *   1. Abra https://script.new (logado na conta do Drive de 2 TB)
 *   2. Apague o conteúdo e cole TODO este código (o app já preenche o TOKEN abaixo)
 *   3. Salvar → Implantar → Nova implantação → tipo "App da Web"
 *      Executar como: "Eu"   ·   Quem pode acessar: "Qualquer pessoa"
 *   4. Autorize o acesso ao Drive e copie o "URL do app da Web" (termina com /exec)
 *   5. Cole o URL no app: Mais e ajustes → Integrações → Google Drive → Conectar
 * O TOKEN protege o script: só o seu app conhece. Não compartilhe este código preenchido.
 */
const TOKEN = 'COLE_O_TOKEN_AQUI';
const PASTA_RAIZ = '1EmJ84bNWOklfiRXiVFnokuR6qnMP2RVC'; // Financeiro_Pessoal / Aplicativo_Financeiro_WEB
const MESES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SUBPASTAS = { fatura: 'Faturas_Cartao', extrato: 'Extratos_Conta', recibo: 'Recibos_Comprovantes', relatorio: 'Relatorios' };
const BASE = { entrada: ['00_', '00_Caixa_de_Entrada (ainda não usados)'], arquivo: ['01_', '01_Arquivo_por_Mes (já usados)'],
  backups: ['02_', '02_Backups'], revisar: ['03_', '03_Revisar_ou_Descartados'], docs: ['04_', '04_Documentos_do_App'] };

function doGet() { return saida({ ok: true, app: 'Financeiro Pessoal — Drive', versao: 1 }); }

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!TOKEN || TOKEN.indexOf('COLE_') === 0 || p.token !== TOKEN) return saida({ ok: false, erro: 'Token inválido.' });
    const f = ACOES[p.acao];
    if (!f) return saida({ ok: false, erro: 'Ação desconhecida: ' + p.acao });
    return saida(Object.assign({ ok: true }, f(p)));
  } catch (err) {
    return saida({ ok: false, erro: String(err && err.message || err) });
  }
}

const ACOES = {
  ping: () => ({ hora: new Date().toISOString() }),

  estrutura: () => {
    const ano = new Date().getFullYear();
    for (let m = 1; m <= 12; m++) pastaDoMes(ano + '-' + ('0' + m).slice(-2), null);
    ['entrada', 'backups', 'revisar', 'docs'].forEach(pastaBase);
    pastaFilha(pastaBase('backups'), String(ano));
    return { raiz: DriveApp.getFolderById(PASTA_RAIZ).getUrl(), ano: ano };
  },

  listarEntrada: () => {
    const it = pastaBase('entrada').getFiles(), lista = [];
    while (it.hasNext()) {
      const a = it.next();
      lista.push({ id: a.getId(), nome: a.getName(), mime: a.getMimeType(), tamanho: a.getSize(), criado: a.getDateCreated().toISOString(), url: a.getUrl() });
    }
    lista.sort(function (x, y) { return y.criado.localeCompare(x.criado); });
    return { arquivos: lista };
  },

  baixar: (p) => {
    const a = arquivoDoApp(p.id);
    if (a.getSize() > 15 * 1024 * 1024) throw new Error('Arquivo maior que 15 MB.');
    return { nome: a.getName(), mime: a.getMimeType(), base64: Utilities.base64Encode(a.getBlob().getBytes()) };
  },

  arquivar: (p) => {
    const a = arquivoDoApp(p.id);
    const destino = pastaDoMes(p.mes, p.tipo || 'fatura');
    a.moveTo(destino);
    if (p.nome) a.setName(nomeUnico(destino, limparNome(p.nome), a.getId()));
    a.setDescription('✅ Usado no app em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + (p.descricao ? ' · ' + p.descricao : ''));
    return { id: a.getId(), url: a.getUrl(), pasta: destino.getName() };
  },

  salvar: (p) => {
    const destino = pastaDoMes(p.mes, p.tipo || 'recibo');
    const blob = Utilities.newBlob(Utilities.base64Decode(p.base64), p.mime || 'application/octet-stream', limparNome(p.nome || 'arquivo'));
    const a = destino.createFile(blob);
    a.setName(nomeUnico(destino, limparNome(p.nome || 'arquivo'), a.getId()));
    if (p.descricao) a.setDescription(p.descricao);
    return { id: a.getId(), url: a.getUrl() };
  },

  salvarEntrada: (p) => {
    const destino = pastaBase('entrada');
    const a = destino.createFile(Utilities.newBlob(Utilities.base64Decode(p.base64), p.mime || 'application/pdf', limparNome(p.nome || 'arquivo.pdf')));
    a.setDescription('📥 Recebido pelo Telegram em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'));
    return { id: a.getId(), url: a.getUrl() };
  },

  salvarBackup: (p) => {
    const destino = pastaFilha(pastaBase('backups'), String(new Date().getFullYear()));
    const nome = limparNome(p.nome || ('Backup_' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd')));
    const j = destino.createFile(Utilities.newBlob(p.json || '{}', 'application/json', nome + '.json'));
    if (p.csv) destino.createFile(Utilities.newBlob(p.csv, 'text/csv', nome + '_lancamentos.csv'));
    return { id: j.getId(), url: j.getUrl() };
  },

  relatorioPdf: (p) => {
    const destino = pastaDoMes(p.mes, 'relatorio');
    const nome = limparNome(p.nome || ('Relatorio_' + p.mes + '.pdf'));
    const antigos = destino.getFilesByName(nome);
    while (antigos.hasNext()) antigos.next().setTrashed(true);
    const pdf = Utilities.newBlob(p.html, 'text/html', 'relatorio.html').getAs('application/pdf').setName(nome);
    const a = destino.createFile(pdf);
    return { id: a.getId(), url: a.getUrl(), base64: Utilities.base64Encode(pdf.getBytes()) };
  },

  descartar: (p) => {
    const a = arquivoDoApp(p.id);
    a.moveTo(pastaBase('revisar'));
    a.setDescription('⚠️ Separado para revisar em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy') + (p.motivo ? ' · ' + p.motivo : ''));
    return { id: a.getId() };
  },
};

// ---------------- pastas ----------------
function pastaBase(chave) {
  const raiz = DriveApp.getFolderById(PASTA_RAIZ);
  const [prefixo, nome] = BASE[chave];
  const it = raiz.getFolders();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf(prefixo) === 0) return f; }
  return raiz.createFolder(nome);
}

function pastaFilha(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/** 01_Arquivo_por_Mes/AAAA/AAAA-MM_Mes/{Faturas_Cartao, Extratos_Conta, Recibos_Comprovantes, Relatorios} */
function pastaDoMes(mes, tipo) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Mês inválido: ' + mes);
  const ano = mes.slice(0, 4), m = Number(mes.slice(5, 7));
  const pAno = pastaFilha(pastaBase('arquivo'), ano);
  const pMes = pastaFilha(pAno, mes + '_' + MESES[m - 1]);
  Object.keys(SUBPASTAS).forEach(function (k) { pastaFilha(pMes, SUBPASTAS[k]); });
  return tipo ? pastaFilha(pMes, SUBPASTAS[tipo] || SUBPASTAS.recibo) : pMes;
}

/** Só mexe em arquivos que estão dentro da pasta do app */
function arquivoDoApp(id) {
  const a = DriveApp.getFileById(id);
  let pais = a.getParents(), passos = 0;
  const fila = [];
  while (pais.hasNext()) fila.push(pais.next());
  while (fila.length && passos++ < 12) {
    const f = fila.shift();
    if (f.getId() === PASTA_RAIZ) return a;
    const pp = f.getParents();
    while (pp.hasNext()) fila.push(pp.next());
  }
  throw new Error('Arquivo fora da pasta do app.');
}

function limparNome(n) { return String(n).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150); }

function nomeUnico(pasta, nome, idAtual) {
  let final = nome, i = 2;
  const ponto = nome.lastIndexOf('.');
  const base = ponto > 0 ? nome.slice(0, ponto) : nome, ext = ponto > 0 ? nome.slice(ponto) : '';
  for (;;) {
    const it = pasta.getFilesByName(final);
    let conflito = false;
    while (it.hasNext()) if (it.next().getId() !== idAtual) conflito = true;
    if (!conflito) return final;
    final = base + ' (' + (i++) + ')' + ext;
  }
}

function saida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Rode uma vez pelo editor (botão Executar) para autorizar e criar as pastas do ano. */
function testar() { Logger.log(JSON.stringify(ACOES.estrutura())); }
