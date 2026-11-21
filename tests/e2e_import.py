import sys
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
FIX = 'tests/fixtures/'
MIG = 'tests/fixtures/migracao_planilha_2026.csv'
erros = []

def db(page, js):
    return page.evaluate(js)

def run(page, shots):
    page.on('console', lambda m: erros.append(m.text) if m.type == 'error' and 'senha' not in m.text else None)
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.goto(BASE)
    page.fill('[name=email]', 'edimar@teste.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela')
    page.goto(BASE + '#/cadastros'); page.click('[data-seed]')
    expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # ---------- migração da planilha ----------
    page.goto(BASE + '#/importar')
    page.set_input_files('[data-arquivo]', MIG)
    expect(page.locator('[data-bloco=app]')).to_be_visible()
    page.click('[data-ler]')
    expect(page.get_by_role('heading', name='Prévia da importação')).to_be_visible()
    expect(page.locator('.resumo-linha')).to_contain_text('275 de 275')
    page.screenshot(path=f'{shots}_previa_migracao.png')
    page.click('[data-importar]')
    expect(page.get_by_text('275 lançamento(s) importado(s).').last).to_be_visible()
    assert db(page, 'window.__db.lancamentos.length') == 275
    sem_cat = db(page, "window.__db.lancamentos.filter(l=>(l.tipo==='saida'||l.tipo==='entrada')&&!l.categoria_id).length")
    assert sem_cat == 0, sem_cat
    assert db(page, "window.__db.lancamentos.filter(l=>l.tipo==='pagamento_fatura').length") == 3
    # data corrigida: PAY THERM 02 08 deve ficar em 03/08
    assert db(page, "window.__db.lancamentos.find(l=>l.descricao==='PAY THERM 02 08').data_movimento") == '2026-08-03'
    # reimportar o mesmo arquivo: tudo duplicado
    page.set_input_files('[data-arquivo]', MIG); page.click('[data-ler]')
    expect(page.locator('.resumo-linha')).to_contain_text('0 de 275')
    expect(page.locator('[data-importar]')).to_be_disabled()
    page.click('[data-voltar]')
    # desfazer e refazer
    page.click('[data-desfazer]'); page.click('.modal [data-v=sim]')
    expect(page.get_by_text('Importação desfeita.').last).to_be_visible()
    assert db(page, 'window.__db.lancamentos.length') == 0
    page.set_input_files('[data-arquivo]', MIG); page.click('[data-ler]'); page.click('[data-importar]')
    expect(page.get_by_text('275 lançamento(s) importado(s).').last).to_be_visible()

    # ---------- fatura PDF ----------
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    sel = page.locator('[name=destino]')
    sel.select_option(sel.locator('option', has_text='Cartão XP').get_attribute('value'))
    page.select_option('[name=leitor]', 'simples')
    expect(page.locator('[name=venc]')).to_have_value('2026-11-15')
    expect(page.locator('[name=paga]')).to_be_checked()
    page.click('[data-ler]')
    expect(page.get_by_role('heading', name='Prévia da importação')).to_be_visible()
    expect(page.locator('.aviso.ok')).to_contain_text('2.235,90')
    linhas = page.locator('.imp-linha')
    expect(linhas).to_have_count(6 + 7)
    pag = page.locator('.imp-linha', has_text='PAGAMENTO EFETUADO')
    expect(pag.locator('[data-inc]')).not_to_be_checked()
    # categoria sugerida pelo histórico
    fin = page.locator('.imp-linha:not(.futura)', has_text='FINPET')
    expect(fin.locator('select[data-cat] option:checked')).not_to_have_text('A classificar')
    # escolher categoria para restaurante
    rest = page.locator('.imp-linha', has_text='RESTAURANTE BOM SABOR')
    v = rest.locator('[data-cat] option', has_text='Delivery').get_attribute('value')
    rest.locator('[data-cat]').select_option(v)
    page.screenshot(path=f'{shots}_previa_pdf.png', full_page=True)
    page.click('[data-importar]')
    expect(page.get_by_text('12 lançamento(s) importado(s).').last).to_be_visible()
    fut = db(page, "window.__db.lancamentos.filter(l=>l.descricao==='FINPET' && l.origem==='fatura_pdf').map(l=>l.parcela_num+'|'+l.data_pagamento+'|'+l.situacao).sort()")
    assert fut[0] == '10|2027-06-15|pendente' and '3|2026-11-15|pago' in fut and len(fut) == 8, fut
    assert db(page, "window.__db.lancamentos.find(l=>l.descricao==='ESTORNO LOJA XYZ').tipo") == 'entrada'
    # reimportar o mesmo PDF
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    sel.select_option(sel.locator('option', has_text='Cartão XP').get_attribute('value'))
    page.select_option('[name=leitor]', 'simples')
    page.click('[data-ler]')
    expect(page.locator('[data-importar]')).to_be_disabled()
    page.click('[data-voltar]')

    # ---------- OFX ----------
    page.set_input_files('[data-arquivo]', FIX + 'extrato_teste.ofx')
    sel.select_option(sel.locator('option', has_text='conta itau salario').get_attribute('value'))
    page.click('[data-ler]')
    expect(page.locator('.imp-linha')).to_have_count(4)
    expect(page.locator('.imp-linha', has_text='PAG BOLETO BANCO XP').locator('[data-tipo]')).to_have_value('pagamento_fatura')
    expect(page.locator('.imp-linha', has_text='REMUNERACAO').locator('[data-cat] option:checked')).to_contain_text('Salário')
    page.screenshot(path=f'{shots}_previa_ofx.png', full_page=True)
    page.click('[data-importar]')
    expect(page.get_by_text('4 lançamento(s) importado(s).').last).to_be_visible()
    pf = db(page, "(()=>{const l=window.__db.lancamentos.find(l=>l.descricao==='PAG BOLETO BANCO XP S A' && l.origem==='ofx'); const c=window.__db.cartoes.find(c=>c.id===l.cartao_id); return l.tipo+'|'+c.nome})()")
    assert pf == 'pagamento_fatura|Cartão XP', pf
    expect(page.locator('[data-desfazer]')).to_have_count(3)
    page.screenshot(path=f'{shots}_importar.png', full_page=True)

    # telas continuam funcionando com os dados importados
    for r in ['painel', 'lancamentos', 'cartoes', 'cadastros', 'mais']:
        page.goto(BASE + '#/' + r)
        page.wait_for_timeout(150)
        assert page.locator('.aviso.erro').count() == 0, r
    page.goto(BASE + '#/painel')
    page.screenshot(path=f'{shots}_painel_import.png', full_page=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 860}, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx.new_page(), 'tests/saida_imp_desk')
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx2.new_page(), 'tests/saida_imp_mob')
    b.close()
print('ERROS DE CONSOLE:', erros if erros else 'nenhum')
print('E2E IMPORT OK')
