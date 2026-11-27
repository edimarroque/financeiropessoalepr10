# v1.6.6 — teste visual do desktop: prints de todas as telas em 1280, 1440 e 1920 px e com zoom 125%
# e conferência automática de que nada sai da tela nem do próprio quadro (menu lateral, selo da versão, caixinhas dos cartões).
# Uso: python3 tests/e2e_layout.py [pasta_dos_prints]   (padrão /tmp/prints_layout)
import os, sys
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
PASTA = sys.argv[1] if len(sys.argv) > 1 else '/tmp/prints_layout'
os.makedirs(PASTA, exist_ok=True)
TELAS = ['painel', 'lancamentos', 'cartoes', 'dashboards', 'patrimonio', 'assistente', 'importar', 'cadastros',
         'relatorio', 'integracoes', 'mais', 'ajuda', 'novidades']
# (largura, altura, zoom): zoom 125% = devicePixelRatio 1,25 com a largura útil dividida por 1,25
TAMANHOS = [(1280, 800, 1), (1440, 900, 1), (1920, 1080, 1), (1280, 800, 1.25), (1920, 1080, 1.25)]

# Procura elementos visíveis que saem da janela pela esquerda/direita, ou que vazam do quadro (.cartao) onde estão.
CHECAR = """() => {
  const W = document.documentElement.clientWidth, prob = [];
  const nome = el => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
  for (const el of document.querySelectorAll('.lateral *, #tela *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    if (el.closest('svg, .rolagem, .tabela-rolagem, [data-rolagem], .modal-fundo, .abas, .chips')) continue;
    if (r.left < -1 || r.right > W + 1) { prob.push('fora da tela: ' + nome(el)); continue; }
    const q = el.parentElement && el.parentElement.closest('.cartao, .lateral');
    if (q) { const b = q.getBoundingClientRect(); if (r.left < b.left - 1 || r.right > b.right + 1) prob.push('vaza do quadro: ' + nome(el)); }
  }
  // selo da versão inteiro dentro da tela
  const v = document.querySelector('.versao-mini');
  if (v) { const r = v.getBoundingClientRect(); if (r.bottom > innerHeight + 1 || r.left < 0) prob.push('selo da versão cortado'); }
  // primeiro título do menu (Gestão) começa dentro do menu
  const sep = document.querySelector('.nav-sep'), lat = document.querySelector('.lateral');
  if (sep && lat && sep.getBoundingClientRect().left < lat.getBoundingClientRect().left) prob.push('título do menu cortado');
  return [...new Set(prob)].slice(0, 8);
}"""

falhas, erros = [], []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for (w, h, z) in TAMANHOS:
        ctx = br.new_context(viewport={'width': round(w / z), 'height': round(h / z)}, device_scale_factor=z)
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.route('**/api/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"ok":true}'))
        page.goto(BASE)
        page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
        page.wait_for_selector('#tela .topo-tela')
        page.evaluate("location.hash='#/cadastros'"); page.wait_for_timeout(300)
        page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()
        # valores grandes para forçar as caixinhas dos cartões
        page.evaluate("""() => { const c = window.__db.cartoes[0]; if (c) c.limite = 123456.78;
          for (let i = 0; i < 6; i++) window.__db.lancamentos.push({ id: crypto.randomUUID(), user_id: 'user-1', tipo: 'saida', descricao: 'COMPRA TESTE ' + i,
            valor: 9876.54, data_movimento: '2026-11-0' + (i + 1), data_pagamento: '2026-12-15', cartao_id: c && c.id, situacao: 'pendente', metodo: 'Crédito', tags: [] }); }""")
        page.evaluate("document.querySelector('#tela [data-atualizar-dados], [data-atualizar-dados]').click()"); page.wait_for_timeout(400)
        for t in TELAS:
            page.evaluate(f"location.hash='#/{t}'"); page.wait_for_timeout(450)
            tag = f'{w}px' + ('_zoom125' if z != 1 else '')
            page.screenshot(path=f'{PASTA}/{tag}_{t}.png')
            for pr in page.evaluate(CHECAR):
                falhas.append(f'{tag} {t}: {pr}')
        ctx.close()
    br.close()

for f in falhas: print('FALHA', f)
assert not erros, erros
assert not falhas, f'{len(falhas)} problema(s) de layout'
print('OK layout desktop:', len(TAMANHOS) * len(TELAS), 'prints em', PASTA)
