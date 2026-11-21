import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
erros = []

def run(page, shots):
    page.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.goto(BASE)
    expect(page.get_by_text('Entre para continuar')).to_be_visible()
    page.fill('[name=email]', 'edimar@teste.com'); page.fill('[name=senha]', 'errada1')
    page.click('[data-acao=entrar]')
    expect(page.get_by_text('E-mail ou senha incorretos.')).to_be_visible()
    page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    expect(page.locator('.aviso', has_text='Seu app está vazio')).to_be_visible()

    # cadastros
    page.goto(BASE + '#/cadastros')
    page.click('[data-seed]')
    expect(page.get_by_text('Carregado: 4 conta(s), 3 cartão(ões), 39 categoria(s).')).to_be_visible()
    page.click('[data-seed]')
    expect(page.get_by_text('Tudo já estava cadastrado.')).to_be_visible()
    # editar saldo da conta salário
    page.locator('tr', has_text='conta itau salario').click()
    page.fill('[name=saldo]', '1.000,00'); page.fill('[name=data]', '2026-11-01')
    page.click('.modal .btn-primario')
    expect(page.locator('tr', has_text='conta itau salario')).to_contain_text('1.000,00')
    page.click('[data-aba=cartoes]')
    expect(page.locator('tr', has_text='Cartão XP')).to_contain_text('dia 7')
    page.click('[data-aba=despesa]')
    expect(page.get_by_text('Delivery / Restaurantes')).to_be_visible()
    page.screenshot(path=f'{shots}_cadastros.png', full_page=True)

    def novo():
        page.click('.fab'); expect(page.locator('.modal')).to_be_visible()

    def escolher(nome, texto):
        sel = page.locator(f'.modal [name={nome}]')
        val = sel.locator('option', has_text=texto).first.get_attribute('value')
        sel.select_option(val)

    # despesa pix
    novo()
    page.fill('.modal [name=valor]', '120,50'); page.fill('.modal [name=data_movimento]', '2026-11-18')
    page.fill('.modal [name=descricao]', 'Supermercado BH')
    escolher('categoria_id', 'Mercado'); escolher('origem', 'conta itau salario')
    page.locator('.modal [name=metodo]').select_option('Pix')
    page.click('.modal [type=submit]')
    expect(page.get_by_text('Lançamento salvo.')).to_be_visible()

    # compra parcelada no cartão XP
    novo()
    page.fill('.modal [name=valor]', '1000'); page.fill('.modal [name=data_movimento]', '2026-11-20')
    page.fill('.modal [name=descricao]', 'Notebook')
    escolher('categoria_id', 'Eletrônicos'); escolher('origem', 'Cartão XP')
    page.fill('.modal [name=parcelas]', '10')
    expect(page.locator('.modal [data-info]')).to_contain_text('vence em 15/12/2026 · 10x de R$')
    page.screenshot(path=f'{shots}_form.png')
    page.click('.modal [type=submit]')
    expect(page.get_by_text('10 parcelas lançadas.')).to_be_visible()

    # compra à vista XP antes do fechamento (vence 15/12 também? 05/11 < 7 -> fecha 07/11, vence 15/11)
    novo()
    page.fill('.modal [name=valor]', '80'); page.fill('.modal [name=data_movimento]', '2026-11-05')
    page.fill('.modal [name=descricao]', 'Restaurante')
    escolher('categoria_id', 'Delivery'); escolher('origem', 'Cartão XP')
    expect(page.locator('.modal [data-info]')).to_contain_text('15/11/2026')
    page.click('.modal [type=submit]')

    # receita
    page.locator('.modal').wait_for(state='detached')
    novo()
    page.click('.modal .seg label:nth-child(2)')
    page.fill('.modal [name=valor]', '5.000,00'); page.fill('.modal [name=data_movimento]', '2026-11-05')
    escolher('categoria_id', 'Salário'); escolher('origem', 'conta itau salario')
    page.click('.modal [type=submit]')
    page.locator('.modal').wait_for(state='detached')

    # transferência
    novo()
    page.click('.modal .seg label:nth-child(3)')
    page.fill('.modal [name=valor]', '200'); page.fill('.modal [name=data_movimento]', '2026-11-10')
    escolher('conta_origem', 'conta itau salario'); escolher('conta_destino', 'conta itau pessoal')
    page.click('.modal [type=submit]')
    page.locator('.modal').wait_for(state='detached')

    # erro de validação
    novo()
    page.click('.modal [type=submit]')
    expect(page.get_by_text('Informe um valor maior que zero.')).to_be_visible()
    page.click('.modal [data-fechar]')

    # painel
    page.goto(BASE + '#/painel')
    kpis = page.locator('.kpi')
    expect(kpis.nth(0)).to_contain_text('5.000,00')
    expect(kpis.nth(1)).to_contain_text('200,50')   # 120,50 + 80 (fatura de nov)
    expect(kpis.nth(2)).to_contain_text('4.799,50')
    # saldo salário: 1000 + 5000 - 120,50 - 200 = 5679,50; pessoal 0+200
    expect(kpis.nth(3)).to_contain_text('5.679,50')
    page.screenshot(path=f'{shots}_painel.png', full_page=True)
    page.click('[data-per="1"]')
    expect(kpis.nth(1)).to_contain_text('100,00')

    # cartões: fatura atual XP = venc 15/12 (hoje 20/11) total 100
    page.goto(BASE + '#/cartoes')
    xp = page.locator('[data-cartao]', has_text='Cartão XP')
    expect(xp.locator('.fatura-resumo')).to_contain_text('100,00')
    expect(xp.locator('.cc-limite')).to_contain_text('1.080,00')  # usado: 1000 parcelas + 80
    # seleciona fatura de 15/11 (vencida) e paga
    sel = xp.locator('select[data-venc]')
    sel.select_option('2026-11-15')
    xp = page.locator('[data-cartao]', has_text='Cartão XP')
    expect(xp.locator('.fatura-resumo')).to_contain_text('80,00')
    xp.locator('[data-pagar]').click()
    page.click('.modal [type=submit]')
    expect(page.get_by_text('Fatura paga.')).to_be_visible()
    xp = page.locator('[data-cartao]', has_text='Cartão XP')
    expect(xp.locator('.fatura-resumo')).to_contain_text('Fatura paga')
    expect(xp.locator('.cc-limite')).to_contain_text('1.000,00')
    page.screenshot(path=f'{shots}_cartoes.png', full_page=True)

    # saldo após pagamento: 5679,50 - 80
    page.goto(BASE + '#/cadastros'); page.click('[data-aba=contas]')
    expect(page.locator('tr', has_text='conta itau salario')).to_contain_text('5.599,50')

    # lançamentos: lista, alternar situação, excluir parcelas
    page.goto(BASE + '#/lancamentos')
    expect(page.locator('[data-per-mes]')).to_have_value('12')
    page.click('[data-per="-1"]')
    expect(page.locator('.item')).to_have_count(5)  # pix, restaurante, salário, transferência, pagamento
    page.locator('.item', has_text='Supermercado BH').locator('[data-sit]').click()
    expect(page.locator('.item', has_text='Supermercado BH').locator('[data-sit]')).to_have_text('pendente')
    page.screenshot(path=f'{shots}_lancamentos.png', full_page=True)
    page.click('[data-per="1"]')
    expect(page.locator('.item', has_text='Notebook')).to_contain_text('1/10')
    page.locator('.item', has_text='Notebook').click()
    page.click('.modal [data-excluir]')
    page.locator('.modal [data-v=todas]').click()
    expect(page.get_by_text('10 parcelas excluídas.')).to_be_visible()
    n = page.evaluate("window.__db.lancamentos.filter(l=>l.descricao==='Notebook').length")
    assert n == 0, n

    # filtro e busca
    page.click('[data-per="-1"]')
    page.locator('.filtros summary').click()
    page.fill('[data-f=texto]', 'super')
    page.wait_for_timeout(400)
    expect(page.locator('.item')).to_have_count(1)
    page.click('[data-limpar]')

    # exportar CSV
    page.goto(BASE + '#/mais')
    with page.expect_download() as d:
        page.click('[data-csv]')
    caminho = d.value.path()
    txt = open(caminho, encoding='utf-8-sig').read()
    assert 'Supermercado BH' in txt and '120,5' in txt, txt[:300]
    # sair
    page.locator('[data-sair]:visible').first.click()
    expect(page.get_by_text('Entre para continuar')).to_be_visible()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx.new_page(), 'tests/saida_desk')
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, accept_downloads=True, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx2.new_page(), 'tests/saida_mob')
    b.close()

print('ERROS DE CONSOLE:', erros if erros else 'nenhum')
print('E2E OK')
