# v1.6.7: PIX entre contas próprias = transferência, sinal do total do extrato, saldo do banco pelo extrato,
# pagamento parcial de fatura, filtro "Sem categoria" e por data, atalho dos Dashboards e sugestões recolhíveis.
# Banco simulado (tests/mock-supabase.js), sem dados reais.
import json, os
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

BASE = 'http://localhost:8765/'
PDF = '/tmp/extrato_v167_teste.pdf'
c = canvas.Canvas(PDF); c.drawString(72, 720, 'Extrato de teste'); c.showPage(); c.save()

erros = []
L = lambda d, desc, v: {'data': d, 'descricao': desc, 'valor': v, 'pagina': 1}

def api(route):
    req = route.request
    if '/api/ler-pdf' not in req.url:
        return route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    j = {'modelo': 'gemini-teste', 'saldoInicial': 500, 'saldoFinal': 1362.90, 'periodoInicio': '2026-11-01', 'periodoFim': '2026-11-20',
         'lancamentos': [L('2026-11-05', 'PIX TRANSF EDIMAR', -50), L('2026-11-06', 'PIX TRANSF EDIMAR 06 11', 42.90),
                         L('2026-11-16', 'PAG BOLETO BANCO XP S.A', -100), L('2026-11-10', 'SUPERMERCADO BOM PRECO', -30),
                         L('2026-11-19', 'REMUNERACAO/SALARIO', 1000)]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(j))

def ir(page, rota):
    page.evaluate(f"location.hash='#/{rota}'"); page.wait_for_timeout(300)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = br.new_page(viewport={'width': 1280, 'height': 900})
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.route('**/api/**', api)
    page.goto(BASE)
    page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela .topo-tela')
    ir(page, 'cadastros'); page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # contas com saldo desde 01/10 e uma fatura XP de 15/11 com R$ 300 pendente
    page.evaluate("""() => { for (const c of window.__db.contas) { c.data_saldo = '2026-10-01'; c.saldo_inicial = c.nome === 'conta itau salario' ? 500 : 0; }
      const x = window.__db.cartoes.find(c => c.nome === 'Cartão XP');
      window.__db.lancamentos.push({ id: crypto.randomUUID(), user_id: 'user-1', tipo: 'saida', descricao: 'COMPRA XP', valor: 300,
        data_movimento: '2026-10-20', data_pagamento: '2026-11-15', cartao_id: x.id, situacao: 'pendente', metodo: 'Crédito', tags: [] }); }""")
    page.locator('[data-atualizar-dados]').first.click(); page.wait_for_timeout(500)

    # ---- prévia do extrato ----
    ir(page, 'importar')
    page.set_input_files('[data-arquivo]', PDF)
    page.select_option('[name=destino]', label='🏦 conta itau salario')
    page.click('[data-ler]')
    expect(page.get_by_role('heading', name='Prévia da importação')).to_be_visible(timeout=30000)
    # o nome do usuário nos extratos (o e-mail do teste não serve): ajustar em "mudar"
    page.once('dialog', lambda d: d.accept('EDIMAR'))
    page.click('[data-nomes]'); page.wait_for_timeout(300)
    expect(page.locator('#tela')).to_contain_text('2 PIX/TED entre as suas contas viram transferência')
    pix = page.locator('.imp-linha', has_text='PIX TRANSF EDIMAR').first
    expect(pix.locator('[data-tipo]')).to_have_value('transferencia')
    expect(pix.locator('[data-outra] option:checked')).to_contain_text('conta itau pessoal')
    # sinal certo: +500 entradas (1042,90) − saídas (180) = +862,90
    expect(page.locator('.resumo-linha')).to_contain_text('+R$ 862,90')
    expect(page.locator('#tela')).to_contain_text('Saldo final menos saldo inicial no PDF: R$ 862,90')
    expect(page.locator('#tela')).to_contain_text('Saldo final do extrato em 20/11/2026: R$ 1.362,90 · no app depois de importar: R$ 1.362,90 ✅ bate')
    # pagamento parcial da fatura XP
    pag = page.locator('.imp-linha', has_text='BANCO XP')
    expect(pag).to_contain_text('Paga parcialmente a fatura de 15/11/2026 (R$ 300,00) — falta R$ 200,00')
    expect(pag.locator('[data-fatura]')).to_have_value('2026-11-15')
    page.screenshot(path='/tmp/prints_v167/previa_1280.png', full_page=True)
    page.click('[data-importar]')
    expect(page.get_by_text('5 lançamento(s) importado(s).').last).to_be_visible()

    db = page.evaluate("""() => { const n = id => (window.__db.contas.find(c => c.id === id) || {}).nome;
      const ls = window.__db.lancamentos.filter(l => l.lote_id);
      const sal = window.__db.contas.find(c => c.nome === 'conta itau salario');
      return { tr: ls.filter(l => l.tipo === 'transferencia').map(l => [l.valor, n(l.conta_id), n(l.conta_destino_id)]).sort(),
               pg: ls.filter(l => l.tipo === 'pagamento_fatura').map(l => l.fatura_venc), conf: [sal.conferido_em, sal.conferido_saldo] }; }""")
    assert db['tr'] == [[42.9, 'conta itau pessoal', 'conta itau salario'], [50, 'conta itau salario', 'conta itau pessoal']], db
    assert db['pg'] == ['2026-11-15'], db
    assert db['conf'] == ['2026-11-20', 1362.9], db
    expect(page.locator('#tela')).to_contain_text('+R$ 862,90 no período')

    # ---- Cartões: pagamento parcial ----
    ir(page, 'cartoes')
    expect(page.locator('#tela')).to_contain_text('falta R$ 200,00')

    # ---- abrir o pagamento e trocar a fatura à mão ----
    ir(page, 'lancamentos')
    page.locator('.item', has_text='BANCO XP').click()
    expect(page.locator('.modal')).to_contain_text('Paga parcialmente a fatura de 15/11/2026')
    page.locator('.modal [name=venc]').select_option('')
    page.locator('.modal [data-ligar] button').click()
    expect(page.get_by_text('Pagamento desligado da fatura.').last).to_be_visible()
    assert page.evaluate("window.__db.lancamentos.find(l=>l.tipo==='pagamento_fatura').fatura_venc") is None

    # ---- Lançamentos: filtros "Sem categoria" e por data ----
    page.evaluate("location.hash='#/painel'"); page.wait_for_timeout(200); ir(page, 'lancamentos')
    page.locator('details.filtros summary').click()
    page.select_option('[data-f=categoria]', '__sem__')
    expect(page.locator('#tela')).to_contain_text('Receitas e despesas sem categoria')
    assert page.locator('.lista .item').count() >= 1
    assert page.locator('.lista .item', has_text='PIX TRANSF').count() == 0  # transferência não precisa de categoria
    page.select_option('[data-f=categoria]', '')
    page.locator('details.filtros summary').click()
    page.fill('[data-f=de]', '2026-10-15'); page.locator('[data-f=de]').dispatch_event('change')
    page.fill('[data-f=ate]', '2026-11-06'); page.locator('[data-f=ate]').dispatch_event('change')
    expect(page.locator('#tela')).to_contain_text('de 15/10/2026 a 06/11/2026')
    assert page.locator('.lista .item').count() == 3, page.locator('.lista .item').count()  # COMPRA XP + 2 PIX
    page.screenshot(path='/tmp/prints_v167/lancamentos_datas_1280.png', full_page=True)
    page.click('[data-limpar-datas]')

    # ---- Dashboards: "Sem categoria" abre a lista ----
    page.evaluate("() => { window.__db.lancamentos.forEach(l => { if (l.descricao === 'SUPERMERCADO BOM PRECO') l.categoria_id = null; }); }")
    page.locator('[data-atualizar-dados]').first.click(); page.wait_for_timeout(500)
    page.evaluate("() => { const s = document.querySelector('[data-periodo-mes], select[name=mes]'); }")
    ir(page, 'dashboards')
    page.screenshot(path='/tmp/prints_v167/dashboards_1280.png', full_page=True)
    atalho = page.locator('.sem-cat-atalho')
    if atalho.count():
        atalho.click(); page.wait_for_timeout(300)
        expect(page.locator('#tela')).to_contain_text('Receitas e despesas sem categoria')
        expect(page.locator('[data-f=categoria]')).to_have_value('__sem__')

    # ---- Novidades: recolher/abrir ----
    ir(page, 'novidades'); page.wait_for_timeout(500)
    page.click('[data-sug-secao]')
    expect(page.locator('.sug-form')).to_be_hidden()
    assert page.evaluate("localStorage.getItem('sugRecolhida')") == 'true'
    page.click('[data-sug-secao]')
    expect(page.locator('.sug-form')).to_be_visible()
    expect(page.locator('.versao.atual .versao-tag')).to_have_text('v1.6.7')

    br.close()
os.remove(PDF)
assert not erros, erros
print('E2E V1.6.7 OK')
