from playwright.sync_api import sync_playwright, expect
erros=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for vp in [{'width':1366,'height':900},{'width':390,'height':844}]:
        page=b.new_page(viewport=vp)
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.goto('http://localhost:8765/'); page.fill('[name=email]','a@b.com'); page.fill('[name=senha]','senha123'); page.click('[data-acao=entrar]')
        page.wait_for_selector('#tela .topo-tela'); page.goto('http://localhost:8765/#/novidades')
        expect(page.locator('#sugestoes h2')).to_be_visible()
        inp=page.locator('[data-sug-form] input')
        inp.fill('Ajustar PDF do XP'); inp.press('Enter')
        expect(page.locator('.sug', has_text='Ajustar PDF do XP')).to_be_visible()
        page.locator('[data-sug-form] input').fill('Metas financeiras'); page.click('[data-sug-form] button')
        expect(page.locator('.sug-lista').first.locator('.sug')).to_have_count(2)
        page.locator('.sug', has_text='Ajustar PDF do XP').locator('input').check()
        expect(page.get_by_text('Feitas (1)')).to_be_visible()
        page.locator('.sug', has_text='Metas financeiras').locator('[data-sug-apagar]').click()
        page.click('.modal [data-v=sim]')
        expect(page.get_by_text('Nenhuma sugestão pendente.')).to_be_visible()
        assert page.evaluate("window.__db.sugestoes.length")==1
        expect(page.locator('.versao.atual .versao-tag')).to_have_text('v1.6.1')
        page.locator('[data-sug-form] input').fill('Teste visual'); page.locator('[data-sug-form] input').press('Enter')
        page.wait_for_timeout(200); page.screenshot(path=f"tests/saida_sug_{vp['width']}.png")
    b.close()
print('ERROS', erros or 'nenhum'); print('E2E SUG OK')
