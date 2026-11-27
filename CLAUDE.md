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

## Funções do servidor (/api na Vercel, ESM — package.json "type": "module")
- `api/_comum.js` helpers (Gemini, Telegram, Drive, RPC). Arquivos com `_` não viram rota.
- `api/ler-pdf.js` PDF→lançamentos (Gemini) · `api/ia.js` análise/chat · `api/telegram.js` bot (webhook + ações do app)
- `api/drive.js` ponte com o Apps Script do usuário (`apps-script/Codigo.gs`) · `api/cron.js` diário 11:00 UTC (avisos, relatório dia 1, backup semanal)
- Variáveis da Vercel: `GEMINI_API_KEY`, `APP_SECRET` (= valor em `privado.config` chave `app_secret`), `CRON_SECRET` (= APP_SECRET).
- Bot e cron não têm login: usam funções `public.srv_*` (security definer, executáveis por anon) que exigem `p_segredo` = APP_SECRET.
- `js/relatorio.js` (HTML do relatório) e `js/contexto-ia.js` (resumo para a IA) são puros e rodam no navegador e no servidor.
- Testes sem internet das rotas: `node tests/api.test.mjs`.

## Arquitetura (sem build)
HTML + CSS + JS (módulos ES) estáticos. Supabase JS via esm.sh; pdf.js servido de `vendor/pdfjs`.
- `js/calc.js` regras puras (datas 'AAAA-MM-DD', fatura por fechamento/vencimento, parcelas, saldos, resumos)
- `js/state.js` dados em memória (`S`), período `S.ano`/`S.mes` (0 = ano todo)
- `js/views/*.js` telas; `js/components/*` período, calendário, gráficos SVG, personalização
- `js/import/parsers.js` CSV/OFX/PDF; chave `chave_dedup` evita duplicados; `lote_id` permite desfazer.
  `descricao_original` = texto exato do banco (a `descricao` é editável); a conferência de repetidos usa SEMPRE a original (`mesmaDescricao`)
- `pagamento_fatura.fatura_venc` = fatura que o pagamento quita (`faturaDoPagamento` em calc.js: total = valor); ao gravar, os itens dessa fatura viram `pago`; desfazer/excluir volta para `pendente`
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
node tests/api.test.mjs
python3 tests/e2e.py && python3 tests/e2e_import.py && python3 tests/e2e_v12.py && python3 tests/e2e_sug.py && python3 tests/e2e_ia.py
python3 tests/e2e_v14.py && python3 tests/e2e_v15.py && python3 tests/e2e_v16.py && python3 tests/e2e_v163.py && python3 tests/e2e_v164.py && python3 tests/e2e_v165.py && python3 tests/e2e_layout.py
node tests/pdf-partes.test.mjs && node tests/ler-pdf.test.mjs
```
PDF com mais de 3 páginas é lido em partes de 4 páginas (1 repetida na virada) — `dividirPaginas`/`emendarPartes` em `js/import/parsers.js`.
O bot do Telegram não lê PDF: só guarda na Caixa de entrada; a leitura é no app.
Montar a cópia: copiar o repo para /tmp/site, copiar `tests/mock-supabase.js` para /tmp/site/tests/ e inserir em
index.html, antes do CSS: `<script type="importmap">{"imports":{"https://esm.sh/@supabase/supabase-js@2":"/tests/mock-supabase.js"}}</script>`.
Os testes usam Chrome em `/usr/bin/google-chrome` (Playwright). `tests/fixtures/migracao_planilha_2026.csv`
não vai para o Git (dados reais): gerar com `python3 tests/migrar.py planilha.xlsm tests/fixtures/migracao_planilha_2026.csv`
(ou exportar os lançamentos do banco no formato do app).

## Armazenamento (decidido em 21/11/2026)
- **Supabase banco:** todos os dados e imagens pequenas (avatar, logos de contas/cartões como data URL).
- **Supabase Storage (1 GB grátis):** bucket privado `comprovantes` com RLS por usuário; exibir com URL assinada.
  Compactação no navegador antes do envio: foto → WebP qualidade ~0,8, lado maior 1600 px (~120–200 KB) + miniatura 320 px (~15 KB);
  original vai só para o Drive. PDF ≤ 1 MB vai como está + miniatura da 1ª página (pdf.js); PDF > 1 MB só no Drive (Supabase guarda miniatura).
  HEIC que o navegador não decodificar: avisar e mandar o original só para o Drive. Ao passar de ~800 MB, comprovantes com mais de 2 anos ficam só no Drive (manter miniatura).
- **Google Drive do usuário (2 TB, pago)** — decidido em 21/11/2026 (v1.6), substitui o plano de OAuth `drive.file`
  (que não enxerga pastas criadas fora do app): **Apps Script do próprio usuário** publicado como App da Web
  (`apps-script/Codigo.gs`, token gerado no app em Integrações). Pasta raiz `Financeiro_Pessoal/Aplicativo_Financeiro_WEB`
  (id `1EmJ84bNWOklfiRXiVFnokuR6qnMP2RVC`):
  `00_Caixa_de_Entrada (ainda não usados)` → importou → `01_Arquivo_por_Mes (já usados)/AAAA/AAAA-MM_Mes/{Faturas_Cartao,Extratos_Conta,Recibos_Comprovantes,Relatorios}`,
  `02_Backups/AAAA`, `03_Revisar_ou_Descartados`, `04_Documentos_do_App` (LEIA-ME). Nome padrão: `AAAA-MM_Fatura_<cartão>_venc-AAAA-MM-DD.pdf`,
  `AAAA-MM_Extrato_<conta>_<ini>_a_<fim>.pdf`, `AAAA-MM-DD_<descrição>_<valor>.jpg`, `Relatorio_AAAA-MM.pdf`, `Backup_AAAA-MM-DD.json/.csv`.
- **IA:** Gemini só quando o usuário pede (Assistente, Telegram, ler PDF). O Gemini responde; o Claude constrói o app.

## Cuidados
- Dados reais do usuário: nunca commitar extratos, faturas ou CSV de migração.
- Não desenhar logos de bancos: o usuário envia a imagem do logo; o app só oferece cores.
- Vercel Hobby = uso pessoal, não comercial.
