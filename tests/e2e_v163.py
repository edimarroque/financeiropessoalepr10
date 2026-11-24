# v1.6.3: PDF grande em partes (504 + emenda), duplicados na conta, telas compactas, atualizar, celular
import json, os
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

BASE = 'http://localhost:8765/'
PDF = '/tmp/extrato_6pag_teste.pdf'  # gerado aqui, sem dados reais
c = canvas.Canvas(PDF)
for i in range(6): c.drawString(72, 720, f'Extrato de teste - pagina {i + 1}'); c.showPage()
c.save()

erros, chamadas = [], []
estado = {'falhou504': False, 'variante': False}
L = lambda d, desc, v, p: {'data': d, 'descricao': desc, 'valor': v, 'pagina': p}

def api(route):
    req = route.request
    if '/api/ler-pdf' not in req.url:
        return route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    corpo = json.loads(req.post_data)
    b = corpo.get('bloco')
    chamadas.append((b, len(corpo['arquivos']), corpo['arquivos'][0]['mimeType']))
    if b and b['de'] == 1 and not estado['falhou504']:
        estado['falhou504'] = True
        return route.fulfill(status=504, content_type='text/plain', body='An error occurred with your deployment')
    merc = 'SUPERMERCADO MERCADO' if estado['variante'] else 'MERCADO'
    if b['de'] == 1:
        j = {'saldoInicial': 1000, 'periodoInicio': '2026-11-01', 'lancamentos': [
            L('2026-11-02', 'SALARIO', 5000, 1), L('2026-11-03', merc, -100, 2),
            L('2026-11-10', 'PIX QRS ICM 60', -60, 4), L('2026-11-10', 'PIX QRS ICM 60', -60, 4)]}
    else:
        j = {'saldoFinal': 5490, 'periodoFim': '2026-11-20', 'lancamentos': [
            L('2026-11-10', 'PIX QRS ICM 60', -60, 1), L('2026-11-10', 'PIX QRS ICM60', -60, 1),
            L('2026-11-12', 'LUZ', -90, 2), L('2026-11-15', 'PIX TRANSF EDIMAR', -200, 3)]}
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

    # ---- PDF de 6 páginas: 2 partes ([1-4] e [4-6]), 504 na 1ª tentativa, emenda sem repetir ----
    importar_pdf(page)
    assert [c[0] for c in chamadas] == [{'de': 1, 'ate': 4, 'total': 6}, {'de': 1, 'ate': 4, 'total': 6}, {'de': 4, 'ate': 6, 'total': 6}], chamadas
    assert chamadas[0][1] == 4 and chamadas[2][1] == 3 and chamadas[0][2] == 'image/jpeg'
    expect(page.locator('.resumo-linha')).to_contain_text('6 de 6')
    expect(page.locator('#tela')).to_contain_text('PDF lido em 2 partes')
    expect(page.locator('.aviso.ok')).to_contain_text('4.490,00')  # saldo final - inicial bate
    assert page.locator('.imp-linha, .item', has_text='PIX QRS ICM').count() >= 2
    page.screenshot(path='tests/saida_v163_previa.png', full_page=True)
    page.click('[data-importar]')
    expect(page.get_by_text('6 lançamento(s) importado(s).').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.filter(l=>l.descricao.startsWith('PIX QRS')).length") == 2

    # ---- reimportar: tudo já importado; com descrição diferente vira "parecido" na conta ----
    estado['variante'] = True; estado['falhou504'] = True
    importar_pdf(page)
    expect(page.locator('.resumo-linha')).to_contain_text('0 de 6')
    expect(page.locator('#tela')).to_contain_text('0 novo(s) · 6 já importado(s)')  # v1.6.4: MERCADO × SUPERMERCADO MERCADO = mesmo
    expect(page.locator('#tela')).to_contain_text('Esta conta já tem 6 lançamento(s) importado(s)')
    page.click('[data-voltar]')

    # ---- largura do celular e campos com 16 px ----
    for rota in ['painel', 'lancamentos', 'cartoes', 'dashboards', 'importar', 'cadastros', 'novidades', 'mais', 'patrimonio']:
        ir(page, rota)
        sw = page.evaluate('document.documentElement.scrollWidth')
        assert sw <= 390, (rota, sw)
        assert page.locator('[data-atualizar-dados]').count() == 1, rota
    ir(page, 'importar'); fs = page.evaluate("getComputedStyle(document.querySelector('#tela select')).fontSize")
    assert fs == '16px', fs

    # ---- atualizar: botão e puxar para baixo ----
    ir(page, 'painel')
    page.evaluate("window.__db.lancamentos.push({...window.__db.lancamentos[0], id:'novo-tg', descricao:'VEIO DO TELEGRAM', chave_dedup:null, lote_id:null})")
    page.click('[data-atualizar-dados]')
    expect(page.get_by_text('Dados atualizados.').last).to_be_visible()
    ir(page, 'lancamentos'); expect(page.locator('#tela')).to_contain_text('VEIO DO TELEGRAM')
    page.wait_for_timeout(3500)
    page.evaluate("""() => { const t = (y) => new Touch({identifier: 1, target: document.body, clientY: y, clientX: 100});
      document.body.dispatchEvent(new TouchEvent('touchstart', {touches: [t(100)], bubbles: true}));
      document.body.dispatchEvent(new TouchEvent('touchmove', {touches: [t(300)], bubbles: true}));
      document.body.dispatchEvent(new TouchEvent('touchend', {touches: [], bubbles: true})); }""")
    expect(page.get_by_text('Dados atualizados.').last).to_be_visible()

    # ---- cartões: gastos recolhidos, seta expande ----
    cc = page.evaluate("window.__db.cartoes[0].id")
    page.evaluate(f"""async () => {{ window.__db.lancamentos.push({{id:'cc1', user_id: window.__db.lancamentos[0].user_id, tipo:'saida', descricao:'COMPRA CARTAO TESTE', valor: 50,
      data_movimento:'2026-11-05', data_pagamento:'2026-12-10', cartao_id:'{cc}', situacao:'pendente', metodo:'Crédito'}});
      await (await import('/js/state.js')).recarregarTudo(); }}""")
    ir(page, 'cartoes')
    sec = page.locator(f'[data-cartao="{cc}"]')
    sel = sec.locator('select[data-venc]')
    sel.select_option(value='2026-12-10') if sel.locator('option[value="2026-12-10"]').count() else None
    det = page.locator(f'[data-gastos="{cc}"]')
    expect(det).to_be_visible(); expect(det.locator('.item').first).to_be_hidden()
    det.locator('summary').click(); expect(det.locator('.item', has_text='COMPRA CARTAO TESTE')).to_be_visible()
    page.screenshot(path='tests/saida_v163_cartoes.png', full_page=True)

    # ---- "Sem categoria" em cinza ----
    ir(page, 'dashboards')
    cor = page.evaluate("""() => { const r = [...document.querySelectorAll('.bh-linha, .bh-item, li, div')].find(e => e.querySelector('.bh-barra') && e.textContent.includes('Sem categoria') && e.querySelectorAll('.bh-barra').length === 1);
      return r ? getComputedStyle(r.querySelector('.bh-barra')).backgroundColor : null; }""")
    assert cor == 'rgb(148, 163, 184)', cor

    # ---- Novidades compacto ----
    ir(page, 'novidades')
    v = page.locator('details.versao.atual')
    expect(v.locator('.versao-tag')).to_have_text('v1.6.4')
    expect(page.locator('details.versao:not(.atual)').first.locator('h3').first).to_be_hidden()
    page.locator('details.versao').nth(1).locator('summary').click()
    expect(page.locator('details.versao').nth(1).locator('h3').first).to_be_visible()
    page.fill('[data-sug-form] input', '[v1.9] Teste de grupo'); page.press('[data-sug-form] input', 'Enter')
    g = page.locator('.sug-grupo[data-grupo="v1.9"]')
    expect(g).to_have_attribute('open', '')
    expect(g.locator('.sug-detalhe').first).to_be_hidden()
    g.locator('[data-sug-abrir]').first.click(); expect(g.locator('.sug-detalhe').first).to_be_visible()
    page.screenshot(path='tests/saida_v163_novidades.png', full_page=True)

    for w in (360, 1366):
        page.set_viewport_size({'width': w, 'height': 900})
        for rota in ['painel', 'cartoes', 'novidades', 'importar']:
            ir(page, rota); sw = page.evaluate('document.documentElement.scrollWidth'); assert sw <= w, (w, rota, sw)
    br.close()
os.remove(PDF)
assert not erros, erros
print('E2E V1.6.3 OK')
