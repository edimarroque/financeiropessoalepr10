// Tela: Integrações — bot do Telegram, Google Drive (Apps Script), avisos, relatório mensal e backup
import * as db from '../db.js';
import { S, recarregarIntegracao } from '../state.js';
import { hoje } from '../calc.js';
import { esc, toast, comCarregando, confirmar } from '../ui.js';
import { chamarApi } from '../servicos/api.js';
import { exportarCSVTexto, backupObjeto } from './mais.js';

const PASTA_DRIVE = 'https://drive.google.com/drive/folders/1EmJ84bNWOklfiRXiVFnokuR6qnMP2RVC';
let linkTg = null;
let tokenDrive = null;
try { tokenDrive = localStorage.getItem('tokenDrivePendente'); } catch { /* */ }

async function salvarOpcoes(patch) {
  if (S.integracao) await db.atualizarOnde('integracoes', 'user_id', S.user.id, { ...patch, updated_at: new Date().toISOString() });
  else await db.inserir('integracoes', [{ ...patch }]);
  await recarregarIntegracao();
}

function gerarToken() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function render(el) {
  const i = S.integracao || {};
  const tgOk = !!i.telegram_chat_id, tgMeio = !!i.telegram_token && !tgOk;
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Integrações</h1><p class="dica">Telegram, Google Drive, avisos e backup automático.</p></div><a class="btn" href="#/mais">← Mais e ajustes</a></div>

    <section class="cartao-bloco integ">
      <div class="cab-lista"><h2>✈️ Bot do Telegram</h2><span class="pill">${tgOk ? `✅ conectado @${esc(i.telegram_bot || '')}` : tgMeio ? '⏳ falta iniciar o bot' : 'não conectado'}</span></div>
      <p class="dica">Lance gastos escrevendo (“mercado 87,50 débito”) ou mandando a foto do cupom, envie PDFs de faturas para a Caixa de entrada e faça perguntas (“quanto gastei com mercado?”). Receba avisos de vencimento e o relatório do mês.</p>
      ${tgOk ? `<div class="acoes"><button class="btn btn-peq" data-tg-testar>📨 Enviar teste</button><a class="btn btn-peq" href="https://t.me/${esc(i.telegram_bot || '')}" target="_blank" rel="noopener">Abrir o bot</a>
          <span class="espaco"></span><button class="btn btn-peq btn-perigo" data-tg-sair>Desconectar</button></div>
        <details class="mt" data-aprendidas><summary>🧠 Perguntas que o bot aprendeu</summary>
          <p class="dica">Pergunta nova vai ao Gemini uma vez e vira um modelo de consulta. Quando você pergunta de novo (mesmo com outro mês), a resposta sai na hora, sem IA, com os dados atuais. Apague um modelo se a resposta não for a que você queria.</p>
          <div data-aprendidas-lista><p class="dica">Carregando…</p></div></details>`
      : `<ol class="lista-simples">
          <li>No Telegram, abra o <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a>, envie <b>/newbot</b>, escolha um nome (ex.: Financeiro Edimar) e um usuário terminado em <i>bot</i>.</li>
          <li>Copie o <b>token</b> que ele mandar e cole aqui:</li></ol>
        <form class="sug-form" data-tg-form><input name="token" placeholder="123456789:AA…" autocomplete="off" value="" aria-label="Token do bot"><button class="btn btn-primario">Conectar</button></form>
        ${linkTg || (tgMeio && i.telegram_bot) ? `<div class="aviso ok mt">3. Agora abra o bot e toque em <b>Iniciar</b>: <a class="btn btn-primario btn-peq" href="${esc(linkTg?.link || `https://t.me/${i.telegram_bot}`)}" target="_blank" rel="noopener">Abrir @${esc(linkTg?.bot || i.telegram_bot || '')}</a>
          ${!linkTg ? '<br><small>Se o link expirou, conecte de novo com o mesmo token.</small>' : ''}<br><button class="btn-link" data-tg-recarregar>Já iniciei — atualizar</button></div>` : ''}`}
    </section>

    <section class="cartao-bloco integ">
      <div class="cab-lista"><h2>📁 Google Drive</h2><span class="pill">${i.drive_url ? '✅ conectado' : 'não conectado'}</span></div>
      <p class="dica">Usa a pasta <a href="${PASTA_DRIVE}" target="_blank" rel="noopener">Aplicativo_Financeiro_WEB</a>: <b>00_Caixa_de_Entrada</b> (ainda não usados) → depois de importar, o arquivo vai para <b>01_Arquivo_por_Mes/AAAA/AAAA-MM_Mês</b> (Faturas, Extratos, Recibos, Relatórios). Backups em <b>02_Backups</b>.</p>
      ${i.drive_url ? `<div class="acoes"><a class="btn btn-peq" href="${PASTA_DRIVE}" target="_blank" rel="noopener">Abrir pasta</a><button class="btn btn-peq" data-drive-backup>💾 Fazer backup agora</button>
          <button class="btn btn-peq" data-drive-estrutura>🗂️ Criar pastas do ano</button><span class="espaco"></span><button class="btn btn-peq btn-perigo" data-drive-sair>Desconectar</button></div>
          ${i.ultimo_backup ? `<p class="dica">Último backup: ${new Date(i.ultimo_backup).toLocaleString('pt-BR')}</p>` : ''}`
      : `<ol class="lista-simples">
          <li>Toque em <b>Copiar script</b> (o código já vai com a sua chave secreta).</li>
          <li>Abra <a href="https://script.new" target="_blank" rel="noopener">script.new</a> (logado na conta do Drive), apague tudo, cole e salve.</li>
          <li>Clique em <b>Implantar → Nova implantação → App da Web</b>. Executar como: <b>Eu</b> · Quem pode acessar: <b>Qualquer pessoa</b>. Autorize o acesso.</li>
          <li>Copie o <b>URL do app da Web</b> (termina com /exec) e cole abaixo.</li></ol>
        <div class="acoes"><button class="btn" data-drive-copiar>📋 Copiar script</button><button class="btn btn-peq" data-drive-ver>Ver código</button></div>
        <pre class="codigo" data-codigo hidden></pre>
        <form class="sug-form mt" data-drive-form><input name="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" aria-label="URL do app da Web"><button class="btn btn-primario">Conectar</button></form>`}
    </section>

    <section class="cartao-bloco integ">
      <h2>⏰ Automático</h2>
      <p class="dica">Rodam todo dia às 8h (horário de Brasília). Precisam do Telegram e/ou do Drive conectados.</p>
      <label class="check"><input type="checkbox" data-op="avisos_ativos" ${i.avisos_ativos !== false ? 'checked' : ''}> Avisos de vencimento no Telegram (contas, boletos e faturas)</label>
      <label class="form-linha">Avisar com antecedência de
        <select data-dias>${[1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${Number(i.avisos_dias ?? 3) === d ? 'selected' : ''}>${d} dia(s)</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-op="relatorio_mensal" ${i.relatorio_mensal !== false ? 'checked' : ''}> Relatório do mês anterior em PDF todo dia 1º (Telegram + Drive)</label>
      <label class="check"><input type="checkbox" data-op="backup_semanal" ${i.backup_semanal !== false ? 'checked' : ''}> Backup completo toda semana no Google Drive (JSON + CSV)</label>
      <div class="acoes"><a class="btn btn-peq" href="#/relatorio">📄 Ver relatório mensal</a></div>
    </section>`;

  const rerender = () => render(el);
  // ----- Telegram -----
  const fTg = el.querySelector('[data-tg-form]');
  if (fTg) fTg.onsubmit = async (e) => {
    e.preventDefault();
    const r = await comCarregando(fTg.querySelector('button'), () => chamarApi('telegram?acao=configurar', { token: fTg.token.value.trim() }));
    linkTg = { link: r.link, bot: r.bot }; await recarregarIntegracao();
    toast(`Bot @${r.bot} configurado. Agora toque em “Abrir” e depois em Iniciar.`); rerender();
    window.open(r.link, '_blank', 'noopener');
  };
  el.querySelector('[data-tg-recarregar]')?.addEventListener('click', async (e) => {
    await comCarregando(e.currentTarget, recarregarIntegracao);
    if (S.integracao?.telegram_chat_id) { linkTg = null; toast('✅ Telegram conectado!'); } else toast('Ainda não recebi o “Iniciar”. Abra o bot e toque em Iniciar.', 'erro');
    rerender();
  });
  const NOME_TIPO = { gastos: 'quanto gastei', receitas: 'quanto recebi', parcelas: 'parcelas', busca: 'busca', saldo: 'saldo', faturas: 'faturas', contas: 'contas a pagar', resumo: 'resumo do mês' };
  const caixaAprend = el.querySelector('[data-aprendidas]');
  const listarAprendidas = async () => {
    const alvo = el.querySelector('[data-aprendidas-lista]');
    try {
      const itens = await db.listar('perguntas_aprendidas', 'created_at', false);
      alvo.innerHTML = itens.length ? `<ul class="lista-simples">${itens.map((q) => `<li>“${esc(q.pergunta)}” → <b>${esc(NOME_TIPO[q.tipo] || q.tipo)}</b>${q.termo ? ` de <i>${esc(q.termo)}</i>` : ''}
          <small class="suave">· usada ${q.usos}x sem IA</small> <button class="btn-icone" data-apagar-aprend="${esc(q.id)}" title="Apagar modelo" aria-label="Apagar modelo">🗑️</button></li>`).join('')}</ul>`
        : '<p class="dica">Nenhuma ainda. Faça uma pergunta nova no bot.</p>';
      alvo.querySelectorAll('[data-apagar-aprend]').forEach((b) => b.onclick = async () => { await db.excluir('perguntas_aprendidas', b.dataset.apagarAprend); toast('Modelo apagado.'); listarAprendidas(); });
    } catch (e) { alvo.innerHTML = `<p class="dica">Não consegui carregar: ${esc(e.message)}</p>`; }
  };
  caixaAprend?.addEventListener('toggle', () => { if (caixaAprend.open) listarAprendidas(); });
  el.querySelector('[data-tg-testar]')?.addEventListener('click', async (e) => { await comCarregando(e.currentTarget, () => chamarApi('telegram?acao=testar')); toast('Mensagem de teste enviada.'); });
  el.querySelector('[data-tg-sair]')?.addEventListener('click', async (e) => {
    if (!(await confirmar('Desconectar Telegram', 'O bot para de responder e de enviar avisos. Continuar?', [{ valor: 'sim', rotulo: 'Desconectar', classe: 'btn-perigo' }]))) return;
    await comCarregando(e.currentTarget, () => chamarApi('telegram?acao=desconectar'));
    await recarregarIntegracao(); rerender();
  });

  // ----- Drive -----
  const codigoScript = async () => {
    if (!tokenDrive) { tokenDrive = gerarToken(); try { localStorage.setItem('tokenDrivePendente', tokenDrive); } catch { /* */ } }
    const txt = await (await fetch('/apps-script/Codigo.gs', { cache: 'no-store' })).text();
    return txt.replace("const TOKEN = 'COLE_O_TOKEN_AQUI';", `const TOKEN = '${tokenDrive}';`);
  };
  el.querySelector('[data-drive-copiar]')?.addEventListener('click', async () => {
    const c = await codigoScript();
    try { await navigator.clipboard.writeText(c); toast('Script copiado! Cole no script.new.'); }
    catch { const pre = el.querySelector('[data-codigo]'); pre.hidden = false; pre.textContent = c; toast('Copie o código abaixo.', 'erro'); }
  });
  el.querySelector('[data-drive-ver]')?.addEventListener('click', async () => { const pre = el.querySelector('[data-codigo]'); pre.textContent = await codigoScript(); pre.hidden = !pre.hidden; });
  const fDr = el.querySelector('[data-drive-form]');
  if (fDr) fDr.onsubmit = async (e) => {
    e.preventDefault();
    if (!tokenDrive) return toast('Primeiro toque em “Copiar script” e implante no Google.', 'erro');
    await comCarregando(fDr.querySelector('button'), () => chamarApi('drive', { acao: 'configurar', url: fDr.url.value.trim(), token: tokenDrive }));
    try { localStorage.removeItem('tokenDrivePendente'); } catch { /* */ }
    tokenDrive = null; await recarregarIntegracao();
    toast('✅ Google Drive conectado e pastas do ano criadas!'); rerender();
  };
  el.querySelector('[data-drive-backup]')?.addEventListener('click', async (e) => {
    await comCarregando(e.currentTarget, () => chamarApi('drive', { acao: 'salvarBackup', nome: `Backup_${hoje()}_manual`, json: JSON.stringify(backupObjeto()), csv: exportarCSVTexto() }));
    await salvarOpcoes({ ultimo_backup: new Date().toISOString() }).catch(() => {});
    toast('💾 Backup salvo em 02_Backups.'); rerender();
  });
  el.querySelector('[data-drive-estrutura]')?.addEventListener('click', async (e) => { await comCarregando(e.currentTarget, () => chamarApi('drive', { acao: 'estrutura' })); toast('Pastas do ano conferidas.'); });
  el.querySelector('[data-drive-sair]')?.addEventListener('click', async (e) => {
    if (!(await confirmar('Desconectar Google Drive', 'O app deixa de guardar arquivos e backups no Drive (o que já está lá continua). Continuar?', [{ valor: 'sim', rotulo: 'Desconectar', classe: 'btn-perigo' }]))) return;
    await comCarregando(e.currentTarget, () => salvarOpcoes({ drive_url: null, drive_token: null })); rerender();
  });

  // ----- opções -----
  el.querySelectorAll('[data-op]').forEach((c) => c.onchange = async () => {
    try { await salvarOpcoes({ [c.dataset.op]: c.checked }); toast('Salvo.'); } catch (er) { toast(er.message, 'erro'); c.checked = !c.checked; }
  });
  el.querySelector('[data-dias]').onchange = async (e) => { await salvarOpcoes({ avisos_dias: Number(e.target.value) }).catch((er) => toast(er.message, 'erro')); toast('Salvo.'); };
}
