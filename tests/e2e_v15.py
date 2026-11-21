# v1.5: conta em dólar, comprovante, IR, metas, investimentos, dívidas, projeção, patrimônio e 2 etapas
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
FIX = 'tests/fixtures/'
erros = []


def ir(page, rota):
    page.evaluate(f"location.hash='#/{rota}'"); page.wait_for_timeout(250)


def opcao(page, sel, texto):
    s = page.locator(sel)
    s.select_option(s.locator('option', has_text=texto).first.get_attribute('value'))


def run(page, shots):
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.route('https://economia.awesomeapi.com.br/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"USDBRL":{"bid":"5.4321"}}'))
    page.goto(BASE)
    page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela .topo-tela')
    ir(page, 'cadastros'); page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # ---- conta em dólar ----
    page.locator('#tela [data-novo]').click()
    page.fill('.modal [name=nome]', 'Nomad'); page.select_option('.modal [name=moeda]', 'USD')
    page.fill('.modal [name=saldo]', '100,00'); page.fill('.modal [name=data]', '2026-11-01')
    page.click('.modal .btn-primario'); expect(page.locator('tr', has_text='Nomad')).to_contain_text('US$')
    # categoria Saúde dedutível
    page.click('[data-aba=despesa]'); page.locator('tr', has_text='Saúde').first.click()
    page.check('.modal [name=dedutivel]'); page.click('.modal .btn-primario'); page.wait_for_timeout(200)

    # lançamento em US$ com comprovante
    ir(page, 'lancamentos'); page.locator('#tela [data-novo]').first.click()
    page.fill('.modal [name=data_movimento]', '2026-11-10'); page.fill('.modal [name=descricao]', 'Consulta medica')
    opcao(page, '.modal [name=origem]', 'Nomad')
    expect(page.locator('.modal [data-bloco=usd]')).to_be_visible()
    page.fill('.modal [name=cotacao]', '5,00'); page.fill('.modal [name=valor_usd]', '20')
    expect(page.locator('.modal [name=valor]')).to_have_value('100')
    opcao(page, '.modal [name=categoria_id]', 'Saúde')
    expect(page.locator('.modal [name=dedutivel]')).to_be_checked()
    page.set_input_files('.modal [name=comprovante]', FIX + 'foto_teste.jpg')
    page.click('.modal [type=submit]'); expect(page.get_by_text('Lançamento salvo.').last).to_be_visible()
    l = page.evaluate("window.__db.lancamentos.find(l=>l.descricao==='Consulta medica')")
    assert l['moeda'] == 'USD' and l['valor_moeda'] == 20 and l['valor'] == 100 and l['dedutivel'] and l['comprovante'], l
    assert l['comprovante_mini'].startswith('data:image/'), l['comprovante_mini'][:30]
    assert page.evaluate("Object.keys(window.__arquivos).length") == 1
    expect(page.locator('.item', has_text='Consulta medica')).to_contain_text('US$ 20')
    ir(page, 'cadastros'); page.click('[data-aba=contas]')
    expect(page.locator('tr', has_text='Nomad')).to_contain_text('US$')  # 100 - 20 = 80
    t = page.locator('tr', has_text='Nomad').inner_text(); assert '80,00' in t, (t, page.evaluate("JSON.stringify(window.__db.contas.find(c=>c.nome==='Nomad'))"))

    # ---- IR ----
    ir(page, 'dashboards'); page.locator('[data-per-ano]').select_option('2026'); page.click('[data-aba=ir]')
    expect(page.locator('.imprimir-area')).to_contain_text('R$ 100,00')

    # ---- metas ----
    ir(page, 'patrimonio'); page.click('[data-aba=metas]')
    page.click('[data-nova]')
    page.fill('.modal [name=nome]', 'Reserva de emergência'); page.fill('.modal [name=alvo]', '12.000'); page.fill('.modal [name=inicial]', '2.000')
    page.fill('.modal [name=prazo]', '2027-11-21'); page.click('.modal .btn-primario')
    expect(page.locator('.meta')).to_contain_text('Reserva de emergência')
    page.click('[data-aportar]'); page.fill('.modal [name=valor]', '1000'); page.click('.modal .btn-primario')
    expect(page.locator('.meta')).to_contain_text('3.000,00')
    assert page.evaluate("window.__db.lancamentos.some(l=>l.origem==='meta' && l.valor===1000)")

    # ---- investimentos ----
    page.click('[data-aba=investimentos]'); page.click('[data-novo]')
    page.fill('.modal [name=nome]', 'CDB XP 110% CDI'); page.fill('.modal [name=aplicado]', '5000'); page.click('.modal .btn-primario')
    expect(page.locator('tr', has_text='CDB XP')).to_be_visible()
    page.click('[data-atualizar]'); page.fill('.modal [name=v]', '5250'); page.click('.modal .btn-primario')
    expect(page.locator('tr', has_text='CDB XP')).to_contain_text('5,0%')
    assert page.evaluate("window.__db.investimentos_historico.length") == 2

    # ---- dívidas ----
    page.click('[data-aba=dividas]'); page.click('[data-novo]')
    page.fill('.modal [name=nome]', 'Empréstimo banco'); page.fill('.modal [name=original]', '10000'); page.fill('.modal [name=parcela]', '500'); page.fill('.modal [name=taxa]', '2')
    page.click('.modal .btn-primario')
    expect(page.locator('.divida')).to_contain_text('quita em 26')
    page.click('[data-pagar]'); page.click('.modal .btn-primario')
    expect(page.locator('.divida')).to_contain_text('9.700,00')  # 500 - 200 juros

    # ---- projeção e visão ----
    page.click('[data-aba=projecao]'); expect(page.locator('.tabela')).to_contain_text('Termina')
    page.click('[data-aba=visao]'); expect(page.locator('.kpi-saldo')).to_contain_text('Patrimônio líquido')
    assert page.evaluate("window.__db.patrimonio_mensal.length") >= 1
    page.screenshot(path=f'{shots}_patrimonio.png', full_page=True)

    # ---- 2 etapas ----
    ir(page, 'mais'); page.click('[data-mfa-on]')
    page.fill('.modal [name=codigo]', '000000'); page.click('.modal .btn-primario')
    expect(page.get_by_text('Código inválido').last).to_be_visible()
    page.fill('.modal [name=codigo]', '123456'); page.click('.modal .btn-primario')
    expect(page.get_by_text('ativada!').last).to_be_visible()
    page.locator('[data-sair]:visible').first.click()
    page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    expect(page.get_by_text('Verificação em 2 etapas')).to_be_visible()
    page.fill('[name=codigo]', '123456'); page.click('#f-mfa .btn-primario')
    page.wait_for_selector('#tela .topo-tela')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    run(b.new_context(viewport={'width': 1280, 'height': 860}, locale='pt-BR').new_page(), 'tests/saida_v15_desk')
    run(b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='pt-BR').new_page(), 'tests/saida_v15_mob')
    b.close()
print('ERROS', erros or 'nenhum')
assert not erros
print('E2E V1.5 OK')
