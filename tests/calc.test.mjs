import * as c from '../js/calc.js';
import assert from 'node:assert/strict';
const xp={id:'x',dia_fechamento:7,dia_vencimento:15}, al={id:'a',dia_fechamento:1,dia_vencimento:30}, inv={id:'i',dia_fechamento:25,dia_vencimento:5};
assert.equal(c.vencimentoDaCompra('2026-08-03',xp),'2026-08-15');
assert.equal(c.vencimentoDaCompra('2026-08-07',xp),'2026-09-15');
assert.equal(c.vencimentoDaCompra('2026-12-20',xp),'2027-01-15');
assert.equal(c.vencimentoDaCompra('2026-08-05',al),'2026-09-30');
assert.equal(c.vencimentoDaCompra('2026-02-10',al),'2026-03-30');
assert.equal(c.vencimentoDaCompra('2026-01-20',inv),'2026-02-05');
assert.equal(c.vencimentoDaCompra('2026-01-26',inv),'2026-03-05');
assert.equal(c.fechamentoDoVencimento('2026-02-05',inv),'2026-01-25');
assert.equal(c.fechamentoDoVencimento('2026-09-15',xp),'2026-09-07');
assert.equal(c.somarMeses('2026-01-31',1),'2026-02-28');
assert.equal(c.somarMesRef('2026-01',-1),'2025-12');
assert.deepEqual(c.dividirParcelas(100,3),[33.34,33.33,33.33]);
const p=c.gerarParcelas({data_movimento:'2026-11-20',valor:1000,parcelas:10,cartao:xp});
assert.equal(p.length,10); assert.equal(p[0].data_pagamento,'2026-12-15'); assert.equal(p[9].data_pagamento,'2027-09-15'); assert.equal(p[3].parcela_num,4);
assert.equal(p.reduce((s,x)=>s+x.valor,0).toFixed(2),'1000.00');
const conta={id:'c1',saldo_inicial:1000,data_saldo:'2026-11-01'};
const L=[{tipo:'entrada',conta_id:'c1',valor:500,situacao:'recebido',data_pagamento:'2026-11-05'},
{tipo:'saida',conta_id:'c1',valor:100,situacao:'pago',data_pagamento:'2026-11-06'},
{tipo:'saida',conta_id:'c1',valor:50,situacao:'pendente',data_pagamento:'2026-11-26'},
{tipo:'saida',conta_id:'c1',valor:70,situacao:'pago',data_pagamento:'2026-10-06'},
{tipo:'transferencia',conta_id:'c1',conta_destino_id:'c2',valor:200,situacao:'pago',data_pagamento:'2026-11-07'},
{tipo:'pagamento_fatura',conta_id:'c1',cartao_id:'x',valor:300,situacao:'pago',data_pagamento:'2026-11-15'}];
assert.equal(c.saldoConta(conta,L),900);
const cats=[{id:'k1',grupo:'Despesas Essenciais'}];
const r=c.resumoMes([...L,{tipo:'saida',cartao_id:'x',categoria_id:'k1',valor:80,situacao:'pendente',data_pagamento:'2026-11-15'}],cats,'2026-11');
assert.equal(r.receitas,500); assert.equal(r.despesas,230); assert.equal(r.saldo,270); assert.equal(r.pendentesQtd,2);
const fl=[{id:1,tipo:'saida',cartao_id:'x',valor:80,situacao:'pendente',data_pagamento:'2026-11-15',data_movimento:'2026-10-20'},{id:2,tipo:'entrada',cartao_id:'x',valor:10,situacao:'pendente',data_pagamento:'2026-11-15',data_movimento:'2026-10-21'}];
const f=c.fatura(xp,fl,'2026-11-15'); assert.equal(f.total,70); assert.equal(f.paga,false);
assert.equal(c.limiteUsado(xp,fl),70);
console.log('todos os testes de cálculo passaram');
// v1.4 — recorrentes, assinaturas, orçamento
{
  const r = { id: 'r', ativo: true, inicio: '2026-09-10', dia: 31, valor: 50, tipo: 'saida', descricao: 'Aluguel', conta_id: 'c1' };
  const g = c.gerarRecorrencias(r, '2026-12');
  assert.deepEqual(g.map((x) => x.data_movimento), ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
  assert.equal(g[0].chave_dedup, 'rec:r:2026-09'); assert.equal(g[0].situacao, 'pendente');
  assert.equal(c.gerarRecorrencias({ ...r, ultimo_mes: '2026-12' }, '2026-12').length, 0);
  assert.equal(c.gerarRecorrencias({ ...r, fim: '2026-10-31' }, '2027-03').length, 2);
  assert.equal(c.gerarRecorrencias({ ...r, ativo: false }, '2026-12').length, 0);
  const gc = c.gerarRecorrencias({ ...r, dia: 10, ultimo_mes: '2026-11' }, '2026-12', xp);
  assert.equal(gc[0].data_pagamento, '2027-01-15'); assert.equal(gc[0].cartao_id, 'x'); assert.equal(gc[0].conta_id, null);
  const as = c.assinaturasRepetidas([1, 2, 3, 3].map((m, i) => ({ tipo: 'saida', descricao: 'NETFLIX.COM ' + i, valor: 39.9, data_movimento: `2026-0${m}-0${i + 1}` })));
  assert.equal(as.length, 1); assert.equal(as[0].duplicadoNoMes, true); assert.equal(as[0].meses, 3);
  assert.equal(c.assinaturasRepetidas([1, 2, 3].map((m) => ({ tipo: 'saida', descricao: 'MERCADO', valor: 100 * m, data_movimento: `2026-0${m}-05` }))).length, 0);
  const cats = [{ id: 'k', tipo: 'despesa', valor_mensal: 100 }, { id: 'z', tipo: 'despesa', valor_mensal: 0 }];
  const o = c.orcamentoCategorias([{ tipo: 'saida', categoria_id: 'k', valor: 85, data_pagamento: '2026-11-10' }], cats, '2026-11-01', '2026-11-30');
  assert.equal(o.length, 1); assert.equal(o[0].nivel, 'atencao');
}
console.log('v1.4 calc OK');
// v1.5 — metas, dívidas, projeção, conta em dólar
{
  const m = { id: 'm', valor_alvo: 1200, valor_inicial: 200, prazo: '2027-05-21' };
  const p = c.progressoMeta(m, [{ meta_id: 'm', valor: 100 }, { meta_id: 'x', valor: 999 }], '2026-11-21');
  assert.equal(p.atual, 300); assert.equal(p.falta, 900); assert.equal(p.mesesRestantes, 6); assert.equal(p.mensalNecessario, 150);
  assert.equal(c.progressoMeta({ ...m, prazo: '2026-10-01' }, [], '2026-11-21').atrasada, true);
  assert.equal(c.mesesParaQuitar(10000, 2, 500).meses, 26);
  assert.equal(c.mesesParaQuitar(10000, 5, 400), null);
  assert.equal(c.mesesParaQuitar(1000, 0, 250).meses, 4);
  const cartao = { id: 'k', dia_fechamento: 5, dia_vencimento: 15 };
  const pr = c.projecaoSaldo({ saldoHoje: 1000, ref: '2026-11-21', meses: 3, cartoes: [cartao], parcelasDividas: 100, lancs: [
    { tipo: 'entrada', situacao: 'pendente', valor: 3000, data_pagamento: '2026-12-05' },
    { tipo: 'saida', situacao: 'pendente', valor: 500, data_pagamento: '2026-11-10', conta_id: 'c' },
    { tipo: 'saida', situacao: 'pendente', valor: 200, data_pagamento: '2026-12-15', cartao_id: 'k' },
    { tipo: 'saida', situacao: 'pago', valor: 999, data_pagamento: '2026-12-15', conta_id: 'c' },
  ], recorrentes: [{ id: 'r', ativo: true, inicio: '2026-01-01', dia: 10, valor: 50, tipo: 'saida', conta_id: 'c', ultimo_mes: '2026-12' }] });
  assert.deepEqual(pr.map((x) => x.fim), [400, 3100, 2950]);
  const usdC = { id: 'u', saldo_inicial: 100, data_saldo: '2026-11-01', moeda: 'USD' };
  assert.equal(c.saldoConta(usdC, [{ tipo: 'saida', conta_id: 'u', valor: 55, valor_moeda: 10, situacao: 'pago', data_pagamento: '2026-11-02' }]), 90);
}
console.log('v1.5 calc OK');
