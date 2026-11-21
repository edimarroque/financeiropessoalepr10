# Financeiro Pessoal EPR10 — guia para o Claude

App web pessoal do Edimar (substitui a "Super Planilha Tríade Financeira 3.0"). Responder sempre em **português**,
com passos simples e conferência dos valores com a fonte.

## Onde está tudo
- **Site:** https://financeiropessoalepr10.vercel.app — Vercel, time `team_xIIEAQG3GwnRUrkwlPeCBs6F` (slug simulados2),
  projeto `prj_r51gv07St3kxZ10j7Oq0lH3c1HOM`. Deploy automático a cada push na `main`.
- **Banco/login:** Supabase, projeto `sqkvmpuhtsjeabmjdvgc`. Mudanças de banco via `apply_migration`
  **e** copiar o SQL no fim de `supabase/schema.sql`. Toda tabela nova precisa de: RLS por `user_id = auth.uid()`,
  `grant ... to authenticated` (projeto novo não libera sozinho) e `revoke all ... from anon`. Depois rodar `get_advisors`.
- Cadastro de novos usuários está **desligado**; um único usuário.

## Arquitetura (sem build)
HTML + CSS + JS (módulos ES) estáticos. Supabase JS via esm.sh; pdf.js servido de `vendor/pdfjs`.
- `js/calc.js` regras puras (datas 'AAAA-MM-DD', fatura por fechamento/vencimento, parcelas, saldos, resumos)
- `js/state.js` dados em memória (`S`), período `S.ano`/`S.mes` (0 = ano todo)
- `js/views/*.js` telas; `js/components/*` período, calendário, gráficos SVG, personalização
- `js/import/parsers.js` CSV/OFX/PDF; chave `chave_dedup` evita duplicados; `lote_id` permite desfazer
- Mês de um lançamento = **data de pagamento** (no cartão = vencimento da fatura)
- Tipos: entrada, saida, transferencia, pagamento_fatura (os dois últimos não contam como receita/despesa)

## A cada versão (obrigatório)
1. Subir `VERSAO` em `js/config.js`
2. Adicionar a versão no topo de `js/versoes.js` (novidades e correções) e ajustar `PROXIMAS`
3. Subir `CACHE` em `sw.js` (e incluir arquivos novos na lista)
4. Rodar os testes (abaixo), commit, push, conferir deploy READY na Vercel
5. Marcar como feitas as sugestões atendidas: `update public.sugestoes set feito = true where id in (...)`

## Lista de sugestões do usuário
Ficam na tabela `public.sugestoes` (tela Novidades). Ler pendentes:
`select id, texto from public.sugestoes where not feito order by created_at;`
Itens prefixados com [v1.3], [v1.4], [v1.5], [depois] indicam a versão planejada.

## Testes (banco simulado, sem tocar no Supabase real)
```
python3 -m http.server 8765   # servir uma cópia do site com importmap apontando supabase-js para tests/mock-supabase.js
node tests/calc.test.mjs
python3 tests/e2e.py && python3 tests/e2e_import.py && python3 tests/e2e_v12.py && python3 tests/e2e_sug.py
```
Montar a cópia: copiar o repo para /tmp/site, copiar `tests/mock-supabase.js` para /tmp/site/tests/ e inserir em
index.html, antes do CSS: `<script type="importmap">{"imports":{"https://esm.sh/@supabase/supabase-js@2":"/tests/mock-supabase.js"}}</script>`.
Os testes usam Chrome em `/usr/bin/google-chrome` (Playwright). `tests/fixtures/migracao_planilha_2026.csv`
não vai para o Git (dados reais): gerar com `python3 tests/migrar.py planilha.xlsm tests/fixtures/migracao_planilha_2026.csv`.

## Cuidados
- Dados reais do usuário: nunca commitar extratos, faturas ou CSV de migração.
- Não desenhar logos de bancos: o usuário envia a imagem do logo; o app só oferece cores.
- Vercel Hobby = uso pessoal, não comercial.
