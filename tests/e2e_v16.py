# v1.6: Assistente IA, Integrações (Telegram/Drive), Caixa de entrada, relatório mensal — rotas /api simuladas
import json, base64
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8765/'
erros = []
pedidos = []
PDF = base64.b64encode(open('tests/fixtures/fatura_teste.pdf', 'rb').read()).decode()


def api(route):
    req = route.request
    corpo = json.loads(req.post_data or '{}')
    url = req.url
    pedidos.append((url.split('/api/')[1], corpo))
    resp = {'ok': True}
    if '/api/ia' in url:
        if corpo.get('acao') == 'analise':
            assert 'Saldo das contas hoje' in corpo['contexto']
            resp = {'resumo': 'Seus gastos estão **controlados**.', 'nota': 7, 'acoes': ['Cortar assinatura X'],
                    'destaques': [{'tipo': 'alerta', 'titulo': 'Juros altos', 'texto': 'Pagou juros no cartão.', 'economia_mensal': 120},
                                  {'tipo': 'positivo', 'titulo': 'Saldo positivo', 'texto': 'Sobrou dinheiro.'}]}
        else:
            resp = {'texto': 'Você gastou **R$ 120,50** com mercado.'}
    elif 'telegram?acao=configurar' in url:
        resp = {'bot': 'financeiro_teste_bot', 'link': 'https://t.me/financeiro_teste_bot?start=123456', 'codigo': '123456'}
    elif '/api/drive' in url:
        a = corpo.get('acao')
        if a == 'listarEntrada':
            resp = {'ok': True, 'arquivos': [{'id': 'arq1', 'nome': 'fatura_xp_nov.pdf', 'mime': 'application/pdf', 'tamanho': 52000, 'criado': '2026-11-20T10:00:00Z'}]}
        elif a == 'baixar':
            resp = {'ok': True, 'nome': 'fatura_xp_nov.pdf', 'mime': 'application/pdf', 'base64': PDF}
        elif a == 'arquivar':
            resp = {'ok': True, 'id': 'arq1', 'url': 'https://drive.google.com/file/d/arq1'}
        elif a == 'relatorioPdf':
            assert 'Relatório financeiro' in corpo['html']
            resp = {'ok': True, 'id': 'rel1', 'url': 'about:blank'}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(resp))


def ir(page, rota):
    page.evaluate(f"location.hash='#/{rota}'"); page.wait_for_timeout(300)


def run(page, shots):
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.route('**/api/**', api)
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.goto(BASE)
    page.fill('[name=email]', 'a@b.com'); page.fill('[name=senha]', 'senha123'); page.click('[data-acao=entrar]')
    page.wait_for_selector('#tela .topo-tela')
    ir(page, 'cadastros'); page.click('[data-seed]'); expect(page.get_by_text('39 categoria(s)').last).to_be_visible()

    # ---- Assistente: análise e chat ----
    ir(page, 'assistente')
    page.click('[data-analisar]')
    expect(page.locator('.ia-analise')).to_contain_text('7/10')
    expect(page.locator('.ia-analise')).to_contain_text('Juros altos')
    expect(page.locator('.ia-analise .aviso.ok')).to_contain_text('120,00')
    assert page.evaluate("window.__db.ia_analises.length") == 1
    page.screenshot(path=f'{shots}_analise.png', full_page=True)
    page.click('[data-aba=chat]')
    page.locator('[data-sug]').first.click()
    expect(page.locator('.msg-ia').last).to_contain_text('R$ 120,50')
    ultimo = [p for p in pedidos if p[0] == 'ia'][-1][1]
    assert ultimo['acao'] == 'chat' and ultimo['mensagens'][-1]['papel'] == 'usuario'

    # ---- Integrações ----
    ir(page, 'integracoes')
    page.fill('[data-tg-form] [name=token]', '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    with page.context.expect_page() as nova:
        page.click('[data-tg-form] button')
    nova.value.close()
    expect(page.get_by_text('Abrir @financeiro_teste_bot')).to_be_visible()
    page.click('[data-drive-copiar]')
    token = page.evaluate("localStorage.getItem('tokenDrivePendente')")
    assert token and len(token) == 48
    page.click('[data-drive-ver]')
    expect(page.locator('[data-codigo]')).to_contain_text(f"const TOKEN = '{token}'")
    page.fill('[data-drive-form] [name=url]', 'https://script.google.com/macros/s/ABC123/exec')
    page.click('[data-drive-form] button')
    cfg = [p for p in pedidos if p[0] == 'drive' and p[1].get('acao') == 'configurar'][-1][1]
    assert cfg['token'] == token and cfg['url'].endswith('/exec')
    # o mock do servidor não grava: simula o que a rota faria
    page.evaluate("window.__db.integracoes.length ? Object.assign(window.__db.integracoes[0], {drive_url:'https://script.google.com/macros/s/ABC123/exec', drive_token:'t'}) : window.__db.integracoes.push({user_id:'user-1', drive_url:'https://script.google.com/macros/s/ABC123/exec', drive_token:'t'})")
    page.locator('[data-op=backup_semanal]').uncheck(); page.wait_for_timeout(200)
    assert page.evaluate("window.__db.integracoes[0].backup_semanal") is False
    page.screenshot(path=f'{shots}_integracoes.png', full_page=True)

    # ---- Caixa de entrada do Drive → importar → arquivar ----
    ir(page, 'importar')
    expect(page.locator('[data-caixa]')).to_contain_text('fatura_xp_nov.pdf')
    page.click('[data-caixa-usar="0"]')
    expect(page.locator('[data-nome]')).to_contain_text('fatura_xp_nov.pdf')
    d = page.locator('[name=destino]'); d.select_option(d.locator('option', has_text='Cartão XP').first.get_attribute('value'))
    page.select_option('[name=leitor]', 'simples')
    page.click('[data-ler]')
    expect(page.get_by_role('heading', name='Prévia da importação')).to_be_visible()
    page.click('[data-importar]')
    expect(page.get_by_text('lançamento(s) importado(s)').last).to_be_visible()
    page.wait_for_timeout(800)
    arq = [p for p in pedidos if p[0] == 'drive' and p[1].get('acao') == 'arquivar']
    assert arq and arq[-1][1]['id'] == 'arq1' and arq[-1][1]['tipo'] == 'fatura' and '_Fatura_Cartao-XP_venc-' in arq[-1][1]['nome'], arq
    assert page.evaluate("window.__db.lotes_importacao[0].drive_file_id") == 'arq1'

    # ---- Relatório ----
    ir(page, 'relatorio')
    expect(page.frame_locator('[data-quadro]').locator('h1')).to_contain_text('Relatório financeiro')
    page.click('[data-drive]')
    expect(page.get_by_text('PDF salvo no Drive').last).to_be_visible()
    page.screenshot(path=f'{shots}_relatorio.png', full_page=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    run(b.new_context(viewport={'width': 1280, 'height': 860}, locale='pt-BR').new_page(), 'tests/saida_v16_desk')
    run(b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='pt-BR').new_page(), 'tests/saida_v16_mob')
    b.close()
print('ERROS', erros or 'nenhum')
assert not erros
print('E2E V1.6 OK')
