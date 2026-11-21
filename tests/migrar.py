# Gera o CSV de migração (formato do app) a partir da planilha, corrigindo datas e nomes
import openpyxl, warnings, re, csv, sys, collections
warnings.filterwarnings('ignore')
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
rows = [r for r in wb['Movimentações'].iter_rows(min_row=5, min_col=2, max_col=12, values_only=True) if r[0]]
def limpa_cat(c):
    c = str(c or '').replace('_xDD14_', '')
    c = re.sub(r'^[^\wÀ-ÿ]+', '', c).strip()
    return c
corr = 0; out = []; obs = collections.Counter()
for r in rows:
    dm, dp, tipo, cat, desc, valor, conta, metodo, forma, parc, sit = r
    card = 'Crédito' in str(metodo or '')
    if not card and dm != dp and dm.day <= 12 and dm.replace(month=dm.day, day=dm.month) == dp:
        dm = dm.replace(month=dm.day, day=dm.month); corr += 1
    catn = limpa_cat(cat)
    cartao = ''
    if card: cartao = re.sub(r'^.*Crédito\s+', '', str(metodo)).strip()
    if catn == 'Pagamento da Fatura':
        t = 'Pagamento da Fatura'; catn = ''
    else:
        t = 'Entrada' if 'Entrada' in str(tipo) else 'Saída'
    if card and t != 'Pagamento da Fatura': conta_out = ''
    else: conta_out = conta or ''
    met = '' if card or metodo is None else str(metodo)
    if t == 'Pagamento da Fatura': met = 'Boleto'
    # parcela
    num = tot = None
    m = re.search(r'(\d+)\s*/\s*(\d+)', str(parc or ''))
    mx = re.search(r'(\d+)x', str(forma or ''))
    if m: num, tot = int(m.group(1)), int(m.group(2))
    elif isinstance(parc, (int, float)) or (isinstance(parc, str) and parc.strip().isdigit()):
        if mx: num, tot = int(parc), int(mx.group(1))
    if tot == 1: num = tot = None
    p = f'{num} de {tot}' if num else ''
    out.append([dm.strftime('%d/%m/%Y'), dp.strftime('%d/%m/%Y'), t, catn, desc or '', f'{valor:.2f}'.replace('.', ','),
                conta_out, '', cartao, met, p, sit or ''])
cab = ['Data da Movimentação','Data do Pagamento','Tipo','Categoria','Descrição','Valor','Conta Bancária','Conta Destino','Cartão','Método de Pagamento','Nº da Parcela','Situação']
with open(sys.argv[2], 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter=';'); w.writerow(cab); w.writerows(out)
print('linhas', len(out), 'datas corrigidas', corr)
print(collections.Counter(o[3] for o in out).most_common(40))
print(collections.Counter((o[2], o[6], o[8]) for o in out))
