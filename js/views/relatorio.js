// Tela: Relatório mensal — ver, imprimir/salvar em PDF, guardar no Google Drive e enviar pelo Telegram
import { S, nomeUsuario } from '../state.js';
import { mesDe, hoje, somarMesRef, nomeMes } from '../calc.js';
import { esc, toast, comCarregando } from '../ui.js';
import { htmlRelatorio } from '../relatorio.js';
import { chamarApi } from '../servicos/api.js';
import { privado } from '../privacidade.js';

let ref = null;

const dados = () => ({ lancamentos: S.lancs, categorias: S.categorias, contas: S.contas, cartoes: S.cartoes, metas: S.metas, metas_movimentos: S.metasMov });

export function render(el) {
  if (!ref) ref = S.mes ? `${S.ano}-${String(S.mes).padStart(2, '0')}` : somarMesRef(mesDe(hoje()), -1);
  const meses = Array.from({ length: 18 }, (_, i) => somarMesRef(mesDe(hoje()), 1 - i));
  const tg = S.integracao?.telegram_chat_id, drive = S.integracao?.drive_url;
  el.innerHTML = `
    <div class="topo-tela"><div><h1>Relatório mensal</h1><p class="dica">Resumo do mês pronto para guardar ou mandar.</p></div>
      <div class="topo-acoes"><select data-mes aria-label="Mês">${meses.map((m) => `<option value="${m}" ${m === ref ? 'selected' : ''}>${esc(nomeMes(m))}</option>`).join('')}</select></div></div>
    <div class="acoes rel-acoes">
      <button class="btn btn-primario" data-imprimir>🖨️ Imprimir / Salvar PDF</button>
      <button class="btn" data-drive ${drive ? '' : 'disabled title="Conecte o Google Drive em Mais e ajustes → Integrações"'}>📁 Salvar PDF no Drive</button>
      <button class="btn" data-tg ${tg ? '' : 'disabled title="Conecte o Telegram em Mais e ajustes → Integrações"'}>✈️ Enviar no Telegram</button>
    </div>
    ${!tg || !drive ? `<p class="dica">${!drive ? 'Com o Google Drive conectado, o PDF fica guardado em 01_Arquivo_por_Mes/AAAA/AAAA-MM/Relatorios. ' : ''}${!tg ? 'Com o Telegram conectado, você recebe o relatório todo dia 1º automaticamente.' : 'Todo dia 1º o relatório do mês anterior chega no Telegram.'}</p>` : '<p class="dica">✅ Todo dia 1º o relatório do mês anterior chega no Telegram e fica salvo no Drive.</p>'}
    <iframe class="rel-quadro" title="Relatório" data-quadro></iframe>`;
  const html = htmlRelatorio(dados(), ref, { nome: nomeUsuario() });
  const q = el.querySelector('[data-quadro]');
  q.srcdoc = privado() ? htmlRelatorio(dados(), ref, { nome: nomeUsuario(), ocultar: true }) : html;
  el.querySelector('[data-mes]').onchange = (e) => { ref = e.target.value; render(el); };
  el.querySelector('[data-imprimir]').onclick = () => {
    if (!privado()) { q.contentWindow.focus(); q.contentWindow.print(); return; }
    // modo privacidade: a tela mostra ***, mas o PDF/impressão sai com os valores
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1000); };
    f.srcdoc = html; document.body.appendChild(f);
  };
  el.querySelector('[data-drive]').onclick = async (e) => {
    const r = await comCarregando(e.currentTarget, () => chamarApi('drive', { acao: 'relatorioPdf', mes: ref, html, nome: `Relatorio_${ref}.pdf` }));
    toast('📁 PDF salvo no Drive.'); if (r.url) window.open(r.url, '_blank', 'noopener');
  };
  el.querySelector('[data-tg]').onclick = async (e) => {
    await comCarregando(e.currentTarget, () => chamarApi('telegram?acao=relatorio', { mes: ref }));
    toast('✈️ Relatório enviado no Telegram.');
  };
}
