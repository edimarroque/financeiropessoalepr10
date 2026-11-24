# v1.6.5: pagamento de fatura do extrato quita a fatura do cartão + reconhecer já importados escritos de outro jeito (base: teste v1.6.3) em partes (504 + emenda), duplicados na conta, telas compactas, atualizar, celular
import json, os
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

BASE = 'http://localhost:8765/'
PDF = '/tmp/extrato_1pag_teste.pdf'  # gerado aqui, sem dados reais
c = canvas.Canvas(PDF)
for i in range(1): c.drawString(72, 720, f'Extrato de teste - pagina {i + 1}'); c.showPage()
c.save()

erros = []
L = lambda d, desc, v, p: {'data': d, 'descricao': desc, 'valor': v, 'pagina': p}

def api(route):
    req = route.request
    if '/api/ler-pdf' not in req.url:
        return route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    corpo = json.loads(req.post_data)
    b = corpo.get('bloco') or {'de': 1}
    j = {'lancamentos': [L('2026-11-22', 'PAGAMENTO DE FATURA FATURA PAGA ITAU UNICLAS', -203.91, 1)]}
    j['modelo'] = 'gemini-teste'
    route.fulfill(status=200, content_type='application/json', body=json.dumps(j))

def ir(page, rota):
    page.evaluate(f"location.hash='#/{rota}'"); page.wait_for_timeout(300)

def importar_pdf(page):
    ir(page, 'importar')
    page.set_input_files('[data-arquivo]', PDF)
    page.select_option('[name=destino]', label='🏦 conta itau salario')
    page.click('[data-ler]')
    expect(page.get_by_role('heading', name='Prévia da importação')).to_be_visible(timeout=30000)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = br.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.route('**/api/**', api)
    page.goto(BASE)
    page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela .topo-tela')
    ir(page, 'cadastros'); page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # ---- fatura do Cartão Itau com venc. 15/11 pendente (e uma de 15/12 que não deve ser tocada) ----
    page.evaluate("""() => { const c = window.__db.cartoes.find(c => c.nome === 'Cartão Itau');
      const add = (d, pag, v, desc) => window.__db.lancamentos.push({ id: crypto.randomUUID(), user_id: 'user-1', tipo: 'saida', descricao: desc, valor: v,
        data_movimento: d, data_pagamento: pag, cartao_id: c.id, situacao: 'pendente', metodo: 'Crédito', tags: [] });
      add('2026-10-20', '2026-11-15', 203.91, 'COMPRA ITAU OUT'); add('2026-11-10', '2026-12-15', 203.90, 'COMPRA ITAU NOV'); }""")
    page.locator('[data-atualizar-dados]').first.click(); page.wait_for_timeout(500)

    # ---- extrato com o pagamento da fatura ----
    importar_pdf(page)
    linha = page.locator('.imp-linha', has_text='FATURA PAGA ITAU')
    expect(linha.locator('[data-tipo]')).to_have_value('pagamento_fatura')
    expect(linha).to_contain_text('Quita a fatura de 15/11/2026')
    page.click('[data-importar]')
    expect(page.get_by_text('1 lançamento(s) importado(s).').last).to_be_visible()
    st = page.evaluate("Object.fromEntries(window.__db.lancamentos.filter(l=>l.cartao_id && l.tipo==='saida').map(l=>[l.descricao,l.situacao]))")
    assert st == {'COMPRA ITAU OUT': 'pago', 'COMPRA ITAU NOV': 'pendente'}, st
    assert page.evaluate("window.__db.lancamentos.find(l=>l.tipo==='pagamento_fatura').fatura_venc") == '2026-11-15'
    ir(page, 'cartoes')
    expect(page.locator('#tela')).to_contain_text('R$ 203,91 ✓ paga')

    # ---- desfazer a importação: a fatura volta a ficar pendente ----
    ir(page, 'importar')
    page.on('dialog', lambda d: d.accept())
    page.locator('[data-desfazer]').first.click()
    page.get_by_role('button', name='Remover importação').click()
    expect(page.get_by_text('Importação desfeita.').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.find(l=>l.descricao==='COMPRA ITAU OUT').situacao") == 'pendente'

    br.close()
os.remove(PDF)
assert not erros, erros
print('E2E V1.6.5 OK')
