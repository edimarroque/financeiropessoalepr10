# v1.6.4: descrição original + reconhecer já importados escritos de outro jeito (base: teste v1.6.3) em partes (504 + emenda), duplicados na conta, telas compactas, atualizar, celular
import json, os
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

BASE = 'http://localhost:8765/'
PDF = '/tmp/extrato_1pag_teste.pdf'  # gerado aqui, sem dados reais
c = canvas.Canvas(PDF)
for i in range(1): c.drawString(72, 720, f'Extrato de teste - pagina {i + 1}'); c.showPage()
c.save()

erros = []
estado = {'fase': 1}
L = lambda d, desc, v, p: {'data': d, 'descricao': desc, 'valor': v, 'pagina': p}

def api(route):
    req = route.request
    if '/api/ler-pdf' not in req.url:
        return route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    corpo = json.loads(req.post_data)
    b = corpo.get('bloco') or {'de': 1}
    if b['de'] != 1: j = {'lancamentos': []}
    elif estado['fase'] == 1:
        j = {'lancamentos': [L('2026-11-19', 'REMUNERACAO/SALARIO', 2069.92, 1), L('2026-11-19', 'PIX TRANSF EDIMAR', -120, 1),
                             L('2026-11-19', 'PIX TRANSF Larissa', -40, 1), L('2026-11-23', 'RSHOP PADARIA CENT', -25.83, 1)]}
    else:
        j = {'lancamentos': [L('2026-11-19', 'SALÁRIO STEFANINI DATA E ANALYTICS S.A', 2069.92, 1), L('2026-11-19', 'PIX ENVIADO EDIMAR PEREIRA ROQUE', -120, 1),
                             L('2026-11-19', 'PIX ENVIADO LARISSA MARA VAZ RIBEIRO', -40, 1), L('2026-11-23', 'COMPRA DÉBITO OFICINA DO PAO', -25.83, 1),
                             L('2026-11-22', 'PIX ENVIADO GAS JOAO XXIII', -130, 1), L('2026-11-20', 'COMPRA DÉBITO MP *ELIZAHAIR', -40, 1)]}
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

    # ---- 1ª importação: formato antigo do Itaú ----
    estado['fase'] = 1
    importar_pdf(page)
    page.click('[data-importar]')
    expect(page.get_by_text('4 lançamento(s) importado(s).').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.every(l=>l.descricao_original===l.descricao)")
    # usuário muda a descrição de um deles (a conferência deve continuar pela original)
    page.evaluate("const l=window.__db.lancamentos.find(l=>l.descricao==='PIX TRANSF Larissa'); l.descricao='Presente Larissa'")

    # ---- 2ª importação: formato novo do Itaú, 3 já existem escritos de outro jeito + 2 novos + 1 só parecido ----
    estado['fase'] = 2
    importar_pdf(page)
    page.screenshot(path='tests/saida_v164_previa.png', full_page=True)
    expect(page.locator('.resumo-linha')).to_contain_text('2 de 6')
    expect(page.locator('#tela')).to_contain_text('6 no arquivo: 2 novo(s) · 3 já importado(s) · 1 parecido(s)')
    expect(page.locator('.imp-linha', has_text='SALÁRIO STEFANINI')).to_contain_text('Já está no app como “REMUNERACAO/SALARIO”')
    expect(page.locator('.imp-linha', has_text='LARISSA MARA')).to_contain_text('Já está no app como “PIX TRANSF Larissa”')
    expect(page.locator('.imp-linha', has_text='OFICINA DO PAO')).to_contain_text('parecido')
    assert page.locator('.imp-linha', has_text='SALÁRIO STEFANINI').locator('[data-inc]').is_enabled()
    page.click('[data-importar]')
    expect(page.get_by_text('2 lançamento(s) importado(s).').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.length") == 6

    # ---- editar: mostra a descrição original ----
    ir(page, 'lancamentos')
    page.locator('.item', has_text='Presente Larissa').first.click()
    expect(page.locator('[data-desc-original]')).to_contain_text('PIX TRANSF Larissa')

    br.close()
os.remove(PDF)
assert not erros, erros
print('E2E V1.6.4 OK')
