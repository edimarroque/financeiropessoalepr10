# v1.6.8: modo privacidade (olho no topo oculta valores como R$ ***) e lista "Perguntas que o bot aprendeu" em Integrações.
# Prints de todas as telas com a privacidade ligada em 1280, 1440 e 1920 px e zoom 125%, conferindo que nenhum valor em R$ aparece.
# Uso: python3 tests/e2e_v168.py [pasta]   (padrão /tmp/prints_v168)
import os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
PASTA = sys.argv[1] if len(sys.argv) > 1 else '/tmp/prints_v168'
os.makedirs(PASTA, exist_ok=True)
TELAS = ['painel', 'lancamentos', 'cartoes', 'dashboards', 'patrimonio', 'cadastros', 'relatorio', 'integracoes']
TAMANHOS = [(1280, 800, 1), (1440, 900, 1), (1920, 1080, 1), (1280, 800, 1.25), (1920, 1080, 1.25)]
VALOR = re.compile(r'(R|US)\$\s?-?\d')
falhas, erros = [], []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for i, (w, h, z) in enumerate(TAMANHOS):
        ctx = br.new_context(viewport={'width': round(w / z), 'height': round(h / z)}, device_scale_factor=z)
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.route('**/api/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"ok":true}'))
        page.goto(BASE)
        page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
        page.wait_for_selector('#tela .topo-tela')
        page.evaluate("location.hash='#/cadastros'"); page.wait_for_timeout(300)
        page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()
        page.evaluate("""() => { const c = window.__db.cartoes[0];
          for (let i = 0; i < 4; i++) window.__db.lancamentos.push({ id: crypto.randomUUID(), user_id: 'user-1', tipo: 'saida', descricao: 'COMPRA TESTE ' + i,
            valor: 1234.56, data_movimento: '2026-11-0' + (i + 1), data_pagamento: '2026-11-0' + (i + 1), cartao_id: c && c.id, situacao: 'pago', metodo: 'Crédito', tags: [] });
          window.__db.perguntas_aprendidas = [{ id: 'pa1', user_id: 'user-1', chave: 'qto saiu de uber', pergunta: 'qto saiu de uber em outubro?', tipo: 'gastos', termo: 'uber', usos: 3, created_at: '2026-11-28T10:00:00Z' }];
          window.__db.integracoes = [{ user_id: 'user-1', telegram_chat_id: 99, telegram_bot: 'meubot', telegram_token: 'x' }]; }""")
        page.evaluate("document.querySelector('[data-atualizar-dados]').click()"); page.wait_for_timeout(400)
        page.evaluate("location.hash='#/painel'"); page.wait_for_timeout(400)
        olho = page.locator('#tela [data-privacidade]')
        if i == 0:
            assert VALOR.search(page.locator('#tela').inner_text()), 'antes de ligar, os valores aparecem'
            expect(olho).to_have_attribute('aria-pressed', 'false')
        olho.click(); page.wait_for_timeout(300)
        expect(page.locator('#tela [data-privacidade]')).to_have_attribute('aria-pressed', 'true')
        for t in TELAS:
            page.evaluate(f"location.hash='#/{t}'"); page.wait_for_timeout(450)
            tag = f'{w}px' + ('_zoom125' if z != 1 else '')
            page.screenshot(path=f'{PASTA}/{tag}_{t}.png')
            txt = page.locator('#tela').inner_text()
            if t == 'relatorio':
                txt += page.frame_locator('[data-quadro]').locator('body').inner_text()
            m = VALOR.search(txt)
            if m: falhas.append(f'{tag} {t}: valor visível "{txt[max(0, m.start() - 20):m.end() + 10]}"')
            if '***' not in txt and t in ('painel', 'cartoes', 'lancamentos'): falhas.append(f'{tag} {t}: sem ***')
            b = page.locator('#tela [data-privacidade]').bounding_box()
            if not b or b['x'] + b['width'] > page.viewport_size['width'] + 1: falhas.append(f'{tag} {t}: botão do olho fora da tela')
        if i == 0:
            # guardado no aparelho: recarregar mantém oculto; desligar volta os valores
            page.reload(); page.wait_for_selector('#tela .topo-tela'); page.evaluate("location.hash='#/painel'"); page.wait_for_timeout(500)
            assert '***' in page.locator('#tela').inner_text(), 'continua oculto depois de recarregar'
            expect(page.locator('#tela [data-privacidade]')).to_have_attribute('aria-pressed', 'true')
            page.locator('#tela [data-privacidade]').click(); page.wait_for_timeout(300)
            tx = page.locator('#tela').inner_text(); assert VALOR.search(tx), 'desligar mostra de novo: ' + tx[:300]
            # perguntas aprendidas
            page.evaluate("location.hash='#/cadastros'"); page.wait_for_timeout(300); page.click('[data-seed]'); page.wait_for_timeout(300)
            page.evaluate("""() => { window.__db.perguntas_aprendidas = [{ id: 'pa1', user_id: 'user-1', chave: 'qto saiu de uber', pergunta: 'qto saiu de uber em outubro?', tipo: 'gastos', termo: 'uber', usos: 3, created_at: '2026-11-28T10:00:00Z' }];
              window.__db.integracoes = [{ user_id: 'user-1', telegram_chat_id: 99, telegram_bot: 'meubot', telegram_token: 'x' }]; }""")
            page.evaluate("document.querySelector('[data-atualizar-dados]').click()"); page.wait_for_timeout(400)
            page.evaluate("location.hash='#/integracoes'"); page.wait_for_timeout(400)
            caixa = page.locator('[data-aprendidas]')
            if caixa.count():
                caixa.locator('summary').click()
                expect(caixa).to_contain_text('qto saiu de uber em outubro?'); expect(caixa).to_contain_text('usada 3x sem IA')
                page.screenshot(path=f'{PASTA}/integracoes_aprendidas.png')
                caixa.locator('[data-apagar-aprend]').click()
                expect(caixa).to_contain_text('Nenhuma ainda')
            else:
                falhas.append('lista de perguntas aprendidas não apareceu')
        ctx.close()
    br.close()
for f in falhas: print('FALHA', f)
assert not erros, erros
assert not falhas, f'{len(falhas)} problema(s)'
print('E2E V1.6.8 OK:', len(TAMANHOS) * len(TELAS), 'prints em', PASTA)
