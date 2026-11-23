// v1.6.3: divisão de PDF grande em partes e emenda das partes (node tests/pdf-partes.test.mjs)
import assert from 'node:assert/strict';
import { dividirPaginas, emendarPartes, converterRespostaIA } from '../js/import/parsers.js';

assert.deepEqual(dividirPaginas(1), [[1, 1]]);
assert.deepEqual(dividirPaginas(3), [[1, 3]]);
assert.deepEqual(dividirPaginas(4), [[1, 4]]);
assert.deepEqual(dividirPaginas(5), [[1, 4], [4, 5]]);
assert.deepEqual(dividirPaginas(10), [[1, 4], [4, 7], [7, 10]]);
assert.deepEqual(dividirPaginas(11), [[1, 4], [4, 7], [7, 10], [10, 11]]);
// toda página coberta, vizinhas dividem exatamente 1 página
for (let n = 4; n <= 40; n++) {
  const p = dividirPaginas(n);
  assert.equal(p[0][0], 1); assert.equal(p.at(-1)[1], n);
  for (let k = 1; k < p.length; k++) assert.equal(p[k][0], p[k - 1][1]);
  assert.ok(p.every(([a, b]) => b - a + 1 <= 4));
}

const L = (data, descricao, valor, pagina) => ({ data, descricao, valor, pagina });

// 1) virada com repetição exata + duas compras iguais no mesmo dia (devem ficar as duas)
let r = emendarPartes([
  { de: 1, ate: 4, json: { saldoInicial: 100, periodoInicio: '2026-09-01', modelo: 'g', lancamentos: [
    L('2026-09-01', 'SALARIO', 5000, 1), L('2026-09-20', 'PIX QRS ICM 60', -60, 4), L('2026-09-20', 'PIX QRS ICM 60', -60, 4), L('2026-09-21', 'MERCADO', -10, 4)] } },
  { de: 4, ate: 7, json: { saldoFinal: 50, periodoFim: '2026-10-30', modelo: 'g', lancamentos: [
    L('2026-09-20', 'PIX QRS ICM 60', -60, 1), L('2026-09-20', 'PIX QRS ICM 60', -60, 1), L('2026-09-21', 'MERCADO', -10, 1), L('2026-10-01', 'LUZ', -90, 2)] } },
]);
assert.equal(r.lancamentos.length, 5);
assert.equal(r.lancamentos.filter((x) => x.descricao === 'PIX QRS ICM 60').length, 2);
assert.deepEqual(r.emenda, { partes: 2, repetidos: 3, recuperados: 0 });
assert.equal(r.saldoInicial, 100); assert.equal(r.saldoFinal, 50); assert.equal(r.periodoInicio, '2026-09-01'); assert.equal(r.periodoFim, '2026-10-30');
assert.equal(r.lancamentos.at(-1).descricao, 'LUZ');

// 2) a parte anterior perdeu um lançamento da virada: a parte nova recupera (sem perder)
r = emendarPartes([
  { de: 1, ate: 4, json: { lancamentos: [L('2026-09-01', 'A', -1, 1), L('2026-09-10', 'B', -2, 4)] } },
  { de: 4, ate: 5, json: { lancamentos: [L('2026-09-10', 'B', -2, 1), L('2026-09-11', 'C', -3, 1), L('2026-09-12', 'D', -4, 2)] } },
]);
assert.deepEqual(r.lancamentos.map((x) => x.descricao), ['A', 'B', 'C', 'D']);
assert.equal(r.emenda.recuperados, 1);

// 3) descrição escrita diferente na virada (mesma data e valor) não duplica
r = emendarPartes([
  { de: 1, ate: 4, json: { lancamentos: [L('2026-10-05', 'PIX TRANSF EDIMAR', -200, 4)] } },
  { de: 4, ate: 6, json: { lancamentos: [L('2026-10-05', 'PIX TRANSF  EDIMAR R', -200, 1), L('2026-10-06', 'X', -1, 2)] } },
]);
assert.equal(r.lancamentos.length, 2);

// 4) sem número de página: compara fim da anterior com começo da nova
r = emendarPartes([
  { de: 1, ate: 4, json: { lancamentos: [L('2026-09-01', 'A', -1), L('2026-09-02', 'B', -2)] } },
  { de: 4, ate: 7, json: { lancamentos: [L('2026-09-02', 'B', -2), L('2026-09-03', 'C', -3)] } },
]);
assert.deepEqual(r.lancamentos.map((x) => x.descricao), ['A', 'B', 'C']);

// 5) fatura: vencimento e total vêm da parte que tiver; parcelas preservadas na conversão
r = emendarPartes([
  { de: 1, ate: 4, json: { vencimento: '2026-12-10', totalFatura: 500.5, lancamentos: [{ data: '2026-11-03', descricao: 'BRASIL NOVO 3/7', valor: -57.55, parcelaAtual: 3, parcelaTotal: 7, pagina: 2 }] } },
  { de: 4, ate: 5, json: { vencimento: null, lancamentos: [{ data: '2026-11-04', descricao: 'UBER', valor: -20, pagina: 2 }] } },
]);
const lido = converterRespostaIA(r, 'cartao');
assert.equal(lido.vencimentoLido, '2026-12-10'); assert.equal(lido.totalDeclarado, 500.5);
assert.equal(lido.linhas[0].parcela_num, 3); assert.equal(lido.linhas[0].parcela_total, 7); assert.equal(lido.linhas.length, 2);

console.log('pdf-partes: ok');
