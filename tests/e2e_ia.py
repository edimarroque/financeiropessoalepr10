# Leitura de PDF por IA: a rota /api/ler-pdf é simulada (não chama o Gemini).
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
FIX = 'tests/fixtures/'
erros = []
pedidos = []

FATURA = {
  'modelo': 'gemini-teste', 'vencimento': '2026-11-15', 'totalFatura': 389.70,
  'lancamentos': [
    {'data': '2026-11-02', 'descricao': 'MERCADO BOM PRECO', 'valor': -129.20, 'portador': 'EDIMAR P ROQUE'},
    {'data': '2026-09-15', 'descricao': 'MAGALU', 'valor': -200.00, 'parcelaAtual': 3, 'parcelaTotal': 5},
    {'data': '2026-11-05', 'descricao': 'CAFE & CIA', 'valor': -15.50},
    {'data': '2026-11-05', 'descricao': 'CAFE & CIA', 'valor': -15.50},
    {'data': '2026-11-10', 'descricao': 'IOF ROTATIVO', 'valor': -40.50},
    {'data': '2026-11-11', 'descricao': 'ESTORNO LOJA X', 'valor': 11.00},
    {'data': 'lixo', 'descricao': 'item ruim', 'valor': -1},
  ]}
EXTRATO = {
  'modelo': 'gemini-teste', 'periodoInicio': '2026-11-01', 'periodoFim': '2026-11-30', 'saldoInicial': 100.0, 'saldoFinal': 3550.0,
  'lancamentos': [
    {'data': '2026-11-05', 'descricao': 'SALÁRIO EMPRESA', 'valor': 5000.0},
    {'data': '2026-11-06', 'descricao': 'PIX ENVIADO JOAO', 'valor': -1000.0},
    {'data': '2026-11-10', 'descricao': 'PAG BOLETO BANCO XP S A', 'valor': -550.0},
  ]}

def rota(route):
    req = route.request
    corpo = json.loads(req.post_data)
    pedidos.append({'auth': req.headers.get('authorization'), 'tipo': corpo['tipo'], 'mime': corpo['arquivos'][0]['mimeType']})
    route.fulfill(status=200, content_type='application/json', body=json.dumps(FATURA if corpo['tipo'] == 'cartao' else EXTRATO))

def run(page, shots):
    page.on('console', lambda m: erros.append(m.text) if m.type == 'error' and 'senha' not in m.text else None)
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.route('**/api/ler-pdf', rota)
    page.goto(BASE)
    page.fill('[name=email]', 'edimar@teste.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela')
    page.goto(BASE + '#/cadastros'); page.click('[data-seed]')
    expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # ---------- fatura XP com IA ----------
    page.goto(BASE + '#/importar')
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    expect(page.locator('[name=leitor]')).to_have_value('ia')
    sel = page.locator('[name=destino]')
    sel.select_option(sel.locator('option', has_text='Cartão XP').get_attribute('value'))
    page.select_option('[name=venc]', '2026-11-15')
    page.click('[data-ler]')
    expect(page.get_by_role('heading', name='Prévia da importação')).to_be_visible()
    assert pedidos[-1] == {'auth': 'Bearer tok-teste', 'tipo': 'cartao', 'mime': 'application/pdf'}, pedidos[-1]
    expect(page.get_by_text('Lido pela IA (gemini-teste)')).to_be_visible()
    expect(page.locator('.aviso.ok')).to_contain_text('389,70')
    expect(page.locator('.imp-linha')).to_have_count(6 + 2)  # 6 lidos + parcelas 4/5 e 5/5
    expect(page.locator('.imp-linha', has_text='ESTORNO LOJA X').locator('[data-tipo]')).to_have_value('entrada')
    page.screenshot(path=f'{shots}_previa_ia_fatura.png', full_page=True)
    page.click('[data-importar]')
    expect(page.get_by_text('8 lançamento(s) importado(s).').last).to_be_visible()
    mag = page.evaluate("window.__db.lancamentos.filter(l=>l.descricao==='MAGALU').map(l=>l.parcela_num+'|'+l.data_pagamento).sort()")
    assert mag == ['3|2026-11-15', '4|2026-12-15', '5|2027-01-15'], mag
    assert page.evaluate("window.__db.lancamentos.filter(l=>l.descricao==='CAFE & CIA').length") == 2
    assert 'IA' in page.evaluate("window.__db.lotes_importacao[window.__db.lotes_importacao.length-1].descricao")
    # reimportar: tudo duplicado
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    sel.select_option(sel.locator('option', has_text='Cartão XP').get_attribute('value'))
    page.select_option('[name=venc]', '2026-11-15')
    page.click('[data-ler]')
    expect(page.locator('[data-importar]')).to_be_disabled()
    page.click('[data-voltar]')

    # ---------- vencimento diferente do escolhido ----------
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    sel.select_option(sel.locator('option', has_text='Cartão XP').get_attribute('value'))
    outro = page.locator('[name=venc] option').evaluate_all("os => os.map(o=>o.value).find(v=>v!=='2026-11-15')")
    page.select_option('[name=venc]', outro)
    page.click('[data-ler]')
    expect(page.get_by_text('O PDF diz que o vencimento é 15/11/2026')).to_be_visible()
    page.click('[data-voltar]')

    # ---------- extrato Itaú em PDF com IA ----------
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    sel.select_option(sel.locator('option', has_text='conta itau salario').get_attribute('value'))
    expect(page.locator('[name=venc]')).to_be_hidden()
    expect(page.locator('[name=leitor]')).to_be_visible()
    page.click('[data-ler]')
    expect(page.locator('.imp-linha')).to_have_count(3)
    assert pedidos[-1]['tipo'] == 'extrato'
    expect(page.locator('.imp-linha', has_text='SALÁRIO EMPRESA').locator('[data-tipo]')).to_have_value('entrada')
    expect(page.locator('.imp-linha', has_text='PIX ENVIADO').locator('[data-tipo]')).to_have_value('saida')
    expect(page.locator('.imp-linha', has_text='PAG BOLETO BANCO XP').locator('[data-tipo]')).to_have_value('pagamento_fatura')
    expect(page.locator('.aviso.ok')).to_contain_text('3.450,00')
    page.screenshot(path=f'{shots}_previa_ia_extrato.png', full_page=True)
    page.click('[data-importar]')
    expect(page.get_by_text('3 lançamento(s) importado(s).').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.filter(l=>l.origem==='extrato_pdf').length") == 3

    # ---------- leitor simples recusa extrato ----------
    page.set_input_files('[data-arquivo]', FIX + 'fatura_teste.pdf')
    sel.select_option(sel.locator('option', has_text='conta itau salario').get_attribute('value'))
    page.select_option('[name=leitor]', 'simples')
    page.click('[data-ler]')
    expect(page.get_by_text('O leitor simples só lê fatura de cartão').last).to_be_visible()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 860}, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx.new_page(), 'tests/saida_ia_desk')
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='pt-BR', timezone_id='America/Sao_Paulo')
    run(ctx2.new_page(), 'tests/saida_ia_mob')
    b.close()
erros = [e for e in erros if 'O leitor simples' not in e]
print('ERROS DE CONSOLE:', erros if erros else 'nenhum')
assert not erros
print('E2E IA OK')
