// Personalização: ícones (emojis), cores, imagens enviadas pelo usuário e "cartão" visual
import { esc, toast } from '../ui.js';

export const EMOJIS = {
  'Bancos e dinheiro': ['🏦', '💳', '💵', '💰', '🪙', '💸', '🏧', '📈', '📉', '💹', '🧾', '💼', '🐷', '🔐', '🏛️', '💎'],
  'Casa e contas': ['🏠', '🔌', '💡', '🚿', '📶', '📺', '📱', '🧹', '🛋️', '🔧', '🏺', '🧺'],
  'Alimentação': ['🛒', '🍽️', '🍔', '🍕', '☕', '🥧', '🍎', '🥩', '🍺', '🧃'],
  'Transporte': ['🚗', '🚙', '⛽', '🛃', '🚌', '🚕', '🛵', '✈️', '🅿️', '🔩'],
  'Saúde e pessoal': ['🩺', '💊', '🦷', '💅', '💇', '🏋️', '🧘', '👚', '👟', '🎁'],
  'Família e pets': ['👩‍👦', '👨‍👩‍👦', '👶', '🎓', '📕', '🐈', '🐕', '⛪', '🤝', '❤️'],
  'Lazer e trabalho': ['🏖️', '🎮', '🎬', '🎵', '📚', '💻', '🖥️', '🛠️', '🎯', '🏅', '🎄', '🌴'],
  'Outros': ['🤔', '⭐', '🔁', '↩️', '📌', '🏷️', '🧩', '🚀', '🌱', '⚙️'],
};

export const CORES = ['#2563eb', '#0ea5e9', '#14b8a6', '#16a34a', '#84cc16', '#f59e0b', '#ec7000', '#ef4444', '#e11d48', '#db2777', '#8b5cf6', '#6d28d9', '#0f172a', '#334155', '#64748b', '#7c2d12'];

// Atalhos de bancos: só cor e ícone (o logo oficial você mesmo envia como imagem, se quiser)
export const BANCOS = [
  { nome: 'Itaú', cor: '#ec7000', sigla: 'itaú' }, { nome: 'XP', cor: '#111827', sigla: 'XP' },
  { nome: 'Nubank', cor: '#820ad1', sigla: 'nu' }, { nome: 'Inter', cor: '#ff7a00', sigla: 'inter' },
  { nome: 'Banco do Brasil', cor: '#f8d117', sigla: 'BB', escuro: true }, { nome: 'Caixa', cor: '#005ca9', sigla: 'CX' },
  { nome: 'Bradesco', cor: '#cc092f', sigla: 'BRA' }, { nome: 'Santander', cor: '#ec0000', sigla: 'SAN' },
  { nome: 'C6', cor: '#242424', sigla: 'C6' }, { nome: 'Sicoob', cor: '#00a091', sigla: 'SIC' },
  { nome: 'Mercado Pago', cor: '#00b1ea', sigla: 'MP' }, { nome: 'PicPay', cor: '#21c25e', sigla: 'PP' },
  { nome: 'Ticket', cor: '#e11d48', sigla: 'TKT' }, { nome: 'Alelo', cor: '#00843d', sigla: 'ALE' },
];

/** Bolinha com imagem, ou emoji sobre a cor */
export function selo(item, tam = 34) {
  if (!item) return '';
  if (item.imagem) return `<span class="selo-item" style="width:${tam}px;height:${tam}px"><img src="${esc(item.imagem)}" alt=""></span>`;
  return `<span class="selo-item" style="width:${tam}px;height:${tam}px;background:${esc(item.cor || '#2563eb')};font-size:${Math.round(tam * 0.5)}px">${esc(item.icone || '🏦')}</span>`;
}

/** Cartão de crédito visual */
export function cartaoVisual(c, { pequeno = false } = {}) {
  return `<div class="cc-visual ${pequeno ? 'pequeno' : ''}" style="--cc:${esc(c.cor || '#0f172a')}">
    <div class="cc-v-topo">${c.imagem ? `<img src="${esc(c.imagem)}" alt="" class="cc-v-logo">` : `<span class="cc-v-icone">${esc(c.icone || '💳')}</span>`}<span class="cc-v-chip"></span></div>
    <div class="cc-v-num">•••• •••• •••• ${esc(c.final || '••••')}</div>
    <div class="cc-v-rodape"><b>${esc(c.nome)}</b><small>fecha ${c.dia_fechamento} · vence ${c.dia_vencimento}</small></div>
  </div>`;
}

/** Campos de personalização para formulários (ícone, cor, imagem, atalho de banco) */
export function camposVisual(item, { comBancos = true, iconePadrao = '🏦' } = {}) {
  const cor = item?.cor || CORES[0];
  const icone = item?.icone || iconePadrao;
  return `
    <fieldset class="visual-campos">
      <legend>Aparência</legend>
      ${comBancos ? `<label>Atalho de banco (aplica a cor)
        <select data-banco><option value="">—</option>${BANCOS.map((b) => `<option value="${esc(b.nome)}">${esc(b.nome)}</option>`).join('')}</select>
      </label>` : ''}
      <div class="vc-linha">
        <div class="vc-previa" data-previa>${selo({ cor, icone, imagem: item?.imagem }, 52)}</div>
        <div class="vc-controles">
          <div class="vc-cores">${CORES.map((c) => `<button type="button" class="vc-cor ${c === cor ? 'sel' : ''}" style="background:${c}" data-cor="${c}" aria-label="Cor ${c}"></button>`).join('')}
            <label class="vc-cor vc-cor-livre" title="Outra cor"><input type="color" value="${esc(cor)}" data-cor-livre>🎨</label></div>
          <div class="vc-acoes">
            <button type="button" class="btn btn-peq" data-abrir-emoji>😀 Ícone</button>
            <label class="btn btn-peq vc-upload">🖼️ Imagem/logo<input type="file" accept="image/*" data-imagem></label>
            <button type="button" class="btn btn-peq" data-tirar-imagem ${item?.imagem ? '' : 'hidden'}>Remover imagem</button>
          </div>
        </div>
      </div>
      <input type="hidden" name="cor" value="${esc(cor)}"><input type="hidden" name="icone" value="${esc(icone)}"><input type="hidden" name="imagem" value="${esc(item?.imagem || '')}">
    </fieldset>`;
}

export function ligarCamposVisual(form, aoMudar) {
  const prev = form.querySelector('[data-previa]');
  const valores = () => ({ cor: form.cor.value, icone: form.icone.value, imagem: form.imagem.value || null });
  const atualizar = () => { prev.innerHTML = selo(valores(), 52); form.querySelector('[data-tirar-imagem]').hidden = !form.imagem.value; aoMudar && aoMudar(valores()); };
  const marcarCor = (c) => { form.cor.value = c; form.querySelectorAll('.vc-cor[data-cor]').forEach((b) => b.classList.toggle('sel', b.dataset.cor === c)); atualizar(); };
  form.querySelectorAll('[data-cor]').forEach((b) => b.onclick = () => marcarCor(b.dataset.cor));
  const livre = form.querySelector('[data-cor-livre]');
  if (livre) livre.oninput = () => marcarCor(livre.value);
  const banco = form.querySelector('[data-banco]');
  if (banco) banco.onchange = () => { const b = BANCOS.find((x) => x.nome === banco.value); if (b) marcarCor(b.cor); };
  form.querySelector('[data-abrir-emoji]').onclick = (e) => abrirEmojis(e.currentTarget, (em) => { form.icone.value = em; atualizar(); });
  form.querySelector('[data-imagem]').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { form.imagem.value = await reduzirImagem(f, 160, 'image/png'); atualizar(); }
    catch (err) { toast(err.message, 'erro'); }
  };
  form.querySelector('[data-tirar-imagem]').onclick = () => { form.imagem.value = ''; atualizar(); };
  return valores;
}

/** Painel flutuante de emojis. aoEscolher(emoji) */
export function abrirEmojis(ancora, aoEscolher) {
  document.querySelector('.emoji-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'emoji-pop';
  pop.innerHTML = `<div class="emoji-busca"><input placeholder="Ou digite/cole um emoji" maxlength="8" data-livre><button type="button" class="btn btn-peq" data-ok>OK</button></div>` +
    Object.entries(EMOJIS).map(([g, l]) => `<div class="emoji-grupo"><small>${esc(g)}</small><div>${l.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div></div>`).join('');
  document.body.appendChild(pop);
  const r = ancora.getBoundingClientRect();
  pop.style.top = `${Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6)}px`;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left))}px`;
  const fechar = () => { pop.remove(); document.removeEventListener('mousedown', fora, true); };
  const fora = (e) => { if (!pop.contains(e.target)) fechar(); };
  setTimeout(() => document.addEventListener('mousedown', fora, true));
  pop.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => { aoEscolher(b.dataset.e); fechar(); });
  pop.querySelector('[data-ok]').onclick = () => { const v = pop.querySelector('[data-livre]').value.trim(); if (v) aoEscolher(v); fechar(); };
}

/** Lê uma imagem e devolve data URL reduzida (quadrada se quadrado=true) */
export function reduzirImagem(arquivo, lado = 160, tipo = 'image/png', quadrado = false) {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem.'));
    if (arquivo.size > 8 * 1024 * 1024) return reject(new Error('Imagem muito grande (máx. 8 MB).'));
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (quadrado) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
      const esc_ = Math.min(1, lado / Math.max(sw, sh));
      const cv = document.createElement('canvas');
      cv.width = Math.round(sw * esc_); cv.height = Math.round(sh * esc_);
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      let out = cv.toDataURL(tipo, 0.86);
      if (out.length > 190000) out = cv.toDataURL('image/jpeg', 0.8);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui ler essa imagem.')); };
    img.src = url;
  });
}

/** Foto de comprovante: versão reduzida (lado maior 1600 px, WebP ~0,8 ou JPEG) + miniatura 320 px em data URL */
export function comprimirFoto(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) return reject(new Error('Escolha uma imagem ou PDF.'));
    if (arquivo.size > 25 * 1024 * 1024) return reject(new Error('Imagem muito grande (máx. 25 MB).'));
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const desenhar = (lado) => {
        const e = Math.min(1, lado / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e);
        const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, cv.width, cv.height);
        return cv;
      };
      const grande = desenhar(1600);
      let mini = desenhar(320).toDataURL('image/webp', 0.7);
      if (!mini.startsWith('data:image/webp')) mini = desenhar(320).toDataURL('image/jpeg', 0.7);
      grande.toBlob((b) => {
        if (b && b.type === 'image/webp') return resolve({ blob: b, mini, ext: 'webp' });
        grande.toBlob((j) => (j ? resolve({ blob: j, mini, ext: 'jpg' }) : reject(new Error('Não consegui reduzir a imagem.'))), 'image/jpeg', 0.82);
      }, 'image/webp', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem (formato HEIC? tire um print ou exporte como JPG).')); };
    img.src = url;
  });
}
