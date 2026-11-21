# v1.4: tema, recorrentes, regras, tags, orçamento, conferir saldo, remover importação, dica do gráfico, sessão, FAB
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
erros = []


def entrar(page):
    page.goto(BASE)
    page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela .topo-tela')


def ir(page, rota):
    page.evaluate(f"location.hash='#/{rota}'"); page.wait_for_timeout(250)


def run(page, shots, mobile):
    page.on('pageerror', lambda e: erros.append(str(e)))
    entrar(page)
    ir(page, 'cadastros'); page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # ---- FAB só no Painel/Lançamentos/Cartões (celular) ----
    ir(page, 'dashboards')
    assert not page.locator('.fab').is_visible()
    ir(page, 'painel')
    assert page.locator('.fab').is_visible() == mobile

    # ---- tema ----
    ir(page, 'mais')
    page.locator('[name=tema][value=escuro]').evaluate('e => e.click()')
    page.wait_for_timeout(200)
    assert page.evaluate("document.documentElement.dataset.tema") == 'escuro'
    page.click('[data-cor-tema=verde]'); page.wait_for_timeout(200)
    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acento').trim()") == '#34d399'
    assert page.evaluate("window.__db.perfis[0].preferencias.cor") == 'verde'
    page.screenshot(path=f'{shots}_tema_escuro.png', full_page=True)
    page.locator('[name=tema][value=claro]').evaluate('e => e.click()'); page.wait_for_timeout(150)
    assert page.evaluate("document.documentElement.dataset.tema") == 'claro'
    page.select_option('[data-sessao]', '30')
    assert page.evaluate("window.__db.perfis[0].preferencias.sessaoMin") == 30

    # ---- regra de categoria + sugestão no formulário ----
    ir(page, 'cadastros'); page.click('[data-aba=regras]')
    page.locator('#tela [data-novo]').click()
    page.fill('.modal [name=contem]', 'pedagio')
    sel = page.locator('.modal [name=categoria_id]')
    sel.select_option(sel.locator('option', has_text='Pedagio').first.get_attribute('value'))
    page.click('.modal .btn-primario')
    expect(page.locator('tr', has_text='PEDAGIO')).to_be_visible()

    ir(page, 'lancamentos'); page.locator('#tela [data-novo]').first.click()
    page.fill('.modal [name=valor]', '12,40'); page.fill('.modal [name=data_movimento]', '2026-11-10')
    page.fill('.modal [name=descricao]', 'PEDAGIO VIA 040')
    expect(page.locator('.modal [name=categoria_id] option:checked')).to_contain_text('Pedagio')
    o = page.locator('.modal [name=origem]'); o.select_option(o.locator('option', has_text='conta itau salario').first.get_attribute('value'))
    page.fill('.modal [name=tags]', '#viagem praia')
    page.click('.modal [type=submit]')
    expect(page.get_by_text('Lançamento salvo.').last).to_be_visible()
    l = page.evaluate("window.__db.lancamentos.find(l=>l.descricao==='PEDAGIO VIA 040')")
    assert l['tags'] == ['viagem', 'praia'], l['tags']
    page.evaluate("[window.S_mes]")  # noop
    expect(page.locator('.tag', has_text='#viagem').first).to_be_visible()

    # ---- recorrente pelo formulário ----
    page.locator('#tela [data-novo]').first.click()
    page.fill('.modal [name=valor]', '1500'); page.fill('.modal [name=data_movimento]', '2026-11-05')
    page.fill('.modal [name=descricao]', 'Aluguel casa')
    c = page.locator('.modal [name=categoria_id]'); c.select_option(c.locator('option', has_text='Moradia').first.get_attribute('value'))
    o = page.locator('.modal [name=origem]'); o.select_option(o.locator('option', has_text='conta itau salario').first.get_attribute('value'))
    page.check('.modal [name=recorrente]')
    page.click('.modal [type=submit]')
    expect(page.get_by_text('Lançamento salvo.').last).to_be_visible()
    recs = page.evaluate("window.__db.lancamentos.filter(l=>l.descricao==='Aluguel casa').map(l=>l.data_movimento+'|'+l.situacao).sort()")
    assert len(recs) >= 2 and recs[0].startswith('2026-11-05'), recs
    assert page.evaluate("window.__db.recorrentes.length") == 1
    ir(page, 'cadastros'); page.click('[data-aba=recorrentes]')
    expect(page.locator('tr', has_text='Aluguel casa')).to_contain_text('1.500,00')

    # ---- orçamento: limite na categoria Pedágio = 10 → estourou ----
    page.click('[data-aba=despesa]')
    page.locator('tr', has_text='Pedagio').first.click()
    page.fill('.modal [name=valor]', '10'); page.click('.modal .btn-primario')
    page.evaluate("location.hash='#/painel'"); page.wait_for_timeout(300)
    page.locator('[data-per-mes]').select_option('11'); page.locator('[data-per-ano]').select_option('2026')
    expect(page.locator('.alerta-orc')).to_contain_text('Pedagio')
    expect(page.locator('.orc-estourou')).to_contain_text('Pedagio')

    # ---- dica do gráfico ----
    g = page.locator('.g-grupo').last
    g.scroll_into_view_if_needed(); g.click()
    expect(page.locator('.dica-flutuante.vis')).to_be_visible()

    # ---- conferir saldo ----
    page.locator('[data-conferir]').first.click()
    page.fill('.modal [name=real]', '100,00')
    expect(page.locator('.modal [data-dif]')).to_contain_text('Diferença')
    page.click('.modal [data-ajustar]')
    expect(page.get_by_text('Ajuste lançado').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.some(l=>l.origem==='ajuste')")
    page.screenshot(path=f'{shots}_painel.png', full_page=True)

    # ---- assinaturas (dashboards) ----
    ir(page, 'dashboards'); page.click('[data-aba=gastos]')
    expect(page.get_by_text('Assinaturas e gastos repetidos')).to_be_visible()

    # ---- ajuda: instalar ----
    ir(page, 'ajuda')
    expect(page.locator('#instalar')).to_contain_text('iPhone')

    # ---- sessão expirada ao reabrir ----
    page.evaluate("localStorage.setItem('ultimaAtividade', String(Date.now() - 3*3600*1000))")
    page.reload()
    expect(page.get_by_text('encerrada por inatividade')).to_be_visible()


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    run(b.new_context(viewport={'width': 1280, 'height': 860}, locale='pt-BR').new_page(), 'tests/saida_v14_desk', False)
    run(b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='pt-BR').new_page(), 'tests/saida_v14_mob', True)
    b.close()
print('ERROS', erros or 'nenhum')
assert not erros
print('E2E V1.4 OK')
