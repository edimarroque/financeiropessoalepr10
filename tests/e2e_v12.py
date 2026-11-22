from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
FIX = 'tests/fixtures/'
MIG = 'tests/fixtures/migracao_planilha_2026.csv'
erros = []

def run(page, shots, desktop):
    page.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.goto(BASE)
    expect(page.get_by_text('Esqueci minha senha')).to_be_visible()
    page.screenshot(path=f'{shots}_login.png')
    page.fill('[name=email]', 'edimar@teste.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela .topo-tela')
    page.goto(BASE + '#/cadastros'); page.click('[data-seed]')
    expect(page.get_by_text('39 categoria(s)').last).to_be_visible()
    page.goto(BASE + '#/importar')
    page.set_input_files('[data-arquivo]', MIG); page.click('[data-ler]'); page.click('[data-importar]')
    expect(page.get_by_text('275 lançamento(s) importado(s).').last).to_be_visible()

    # ---- Painel com período separado ----
    page.goto(BASE + '#/painel')
    page.select_option('[data-per-ano]', '2026'); page.select_option('[data-per-mes]', '9')
    expect(page.locator('h1')).to_have_text('Setembro de 2026')
    kpis = page.locator('.kpi')
    expect(kpis.nth(0)).to_contain_text('6.073,71')
    expect(kpis.nth(1)).to_contain_text('5.969,59')
    expect(page.locator('.resumo-tabela')).to_contain_text('A pagar')
    expect(page.locator('.calendario .cal-topo')).to_contain_text('Setembro 2026')
    dia = page.locator('.cal-dia.tem').first
    dia.click()
    expect(page.locator('.modal')).to_contain_text('Gastos')
    page.keyboard.press('Escape')
    expect(page.locator('.modal')).to_have_count(0)
    page.click('[data-cal="-1"]')
    expect(page.locator('.calendario .cal-topo')).to_contain_text('Agosto 2026')
    expect(page.locator('[data-per-mes]')).to_have_value('9')  # calendário não muda o período
    page.screenshot(path=f'{shots}_painel.png', full_page=True)
    page.select_option('[data-per-mes]', '0')
    expect(page.locator('h1')).to_have_text('Ano de 2026')
    page.click('[data-per="-1"]')
    expect(page.locator('h1')).to_have_text('Ano de 2025')
    page.click('[data-per="1"]'); page.select_option('[data-per-mes]', '9')

    # ---- Lançamentos no período ----
    page.goto(BASE + '#/lancamentos')
    expect(page.locator('.resumo-linha')).to_contain_text('114')

    # ---- Dashboards ----
    page.goto(BASE + '#/dashboards')
    expect(page.locator('.rosca svg').first).to_be_visible()
    page.screenshot(path=f'{shots}_dash_visao.png', full_page=True)
    for aba in ['gastos', 'ganhos', 'anual']:
        page.click(f'[data-aba={aba}]')
        page.wait_for_timeout(150)
        assert page.locator('.aviso.erro').count() == 0, aba
        page.screenshot(path=f'{shots}_dash_{aba}.png', full_page=True)
    expect(page.locator('.tabela-anual tfoot')).to_contain_text('5.969,59')
    page.click('[data-tt=entrada]')
    expect(page.locator('.tabela-anual tfoot')).to_contain_text('6.073,71')

    # ---- Personalizar cartão ----
    page.goto(BASE + '#/cartoes')
    page.locator('[data-cartao]', has_text='Cartão XP').locator('[data-editar-cartao]').click()
    expect(page.locator('.modal')).to_contain_text('Editar cartão')
    page.fill('.modal [name=final]', '4417')
    page.locator('.modal [data-cor="#6d28d9"]').click()
    page.click('.modal [data-abrir-emoji]')
    page.locator('.emoji-pop [data-e="🚀"]').click()
    page.set_input_files('.modal [data-imagem]', FIX + 'logo_teste.png')
    expect(page.locator('.modal [data-cc-previa] img')).to_be_visible()
    expect(page.locator('.modal [data-cc-previa]')).to_contain_text('4417')
    page.screenshot(path=f'{shots}_form_cartao.png')
    page.click('.modal .btn-primario')
    expect(page.get_by_text('Cartão salvo.').last).to_be_visible()
    print('NOMES', page.evaluate("window.__db.cartoes.map(c=>c.nome+'|'+(c.final||'')+'|'+c.cor)"))
    xp = page.evaluate("window.__db.cartoes.find(c=>c.nome==='Cartão XP')")
    assert xp['final'] == '4417' and xp['cor'] == '#6d28d9' and xp['icone'] == '🚀' and xp['imagem'].startswith('data:image'), {k: str(v)[:40] for k, v in xp.items()}
    page.goto(BASE + '#/cartoes')
    expect(page.locator('.cc-visual', has_text='4417')).to_be_visible()
    page.screenshot(path=f'{shots}_cartoes.png', full_page=True)

    # ---- Emoji de categoria ----
    page.goto(BASE + '#/cadastros'); page.click('[data-aba=despesa]')
    page.locator('tr', has_text='Mercado').first.click()
    page.click('.modal [data-escolher-emoji]')
    page.locator('.emoji-pop [data-e="🍎"]').click()
    expect(page.locator('.modal [name=emoji]')).to_have_value('🍎')
    page.click('.modal .btn-primario')

    # ---- Perfil e foto ----
    if desktop:
        page.click('.lateral [data-perfil]')
    else:
        page.goto(BASE + '#/mais'); page.click('#tela [data-perfil]')
    page.fill('.modal [name=nome]', 'Edimar')
    page.set_input_files('.modal [data-foto]', FIX + 'foto_teste.jpg')
    expect(page.locator('.modal [data-prev] img')).to_be_visible()
    page.click('.modal .btn-primario')
    expect(page.get_by_text('Perfil salvo.').last).to_be_visible()
    if desktop:
        expect(page.locator('.lateral .usuario img')).to_be_visible()
        expect(page.locator('.lateral .usuario')).to_contain_text('Edimar')
    else:
        expect(page.locator('.perfil-cartao img')).to_be_visible()
    page.goto(BASE + '#/painel')
    expect(page.locator('.ola')).to_contain_text('Edimar')

    # ---- Novidades e Como usar ----
    page.goto(BASE + '#/novidades')
    expect(page.locator('.versao.atual .versao-tag')).to_have_text('v1.6.1')
    page.screenshot(path=f'{shots}_novidades.png', full_page=True)
    page.goto(BASE + '#/ajuda')
    expect(page.locator('.passo')).to_have_count(5)
    page.screenshot(path=f'{shots}_ajuda.png', full_page=True)

    # ---- Sair ----
    if desktop:
        page.click('.lateral [data-sair]')
    else:
        page.goto(BASE + '#/mais'); page.locator('[data-sair]:visible').first.click()
    expect(page.get_by_text('Entre para continuar')).to_be_visible()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx.new_page(), 'tests/saida_v12_desk', True)
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx2.new_page(), 'tests/saida_v12_mob', False)
    b.close()
print('ERROS DE CONSOLE:', erros if erros else 'nenhum')
print('E2E V1.2 OK')
