# Financeiro Pessoal (EPR10)

App web (e instalável no celular) para controle financeiro pessoal: lançamentos, contas, cartões de crédito com faturas e painel mensal.
Baseado na "Super Planilha Tríade Financeira 3.0".

- **Site:** Vercel (plano Hobby, grátis), arquivos estáticos, sem etapa de build
- **Banco e login:** Supabase (plano Free), com regra de acesso por usuário (RLS)
- **Celular:** PWA. Abra o site e use "Instalar app" (Android) ou "Adicionar à Tela de Início" (iPhone)

## Publicar (uma vez só)

1. **Banco:** Supabase → SQL Editor → New query → cole todo o `supabase/schema.sql` → Run.
2. **Site:** Vercel → Add New → Project → importe `financeiropessoalepr10` → Framework Preset: **Other** → Deploy.
3. **Login:** Supabase → Authentication → URL Configuration → Site URL = endereço da Vercel. Abra o site, clique em "Criar meu acesso", confirme o e-mail e entre.
4. **Fechar cadastros novos:** Supabase → Authentication → Sign In / Providers → desligue "Allow new users to sign up".
5. No app: Cadastros → "Carregar cadastros da planilha" e ajuste o saldo inicial de cada conta.

## Estrutura

```
index.html            página única do app
css/style.css         visual (claro/escuro automático)
js/config.js          URL e chave anon do Supabase
js/db.js              acesso ao banco e login
js/calc.js            regras: fatura do cartão, parcelas, saldos, resumos
js/state.js           dados em memória
js/seed.js            cadastros vindos da planilha
js/views/*.js         telas (painel, lançamentos, cartões, cadastros, mais)
supabase/schema.sql   tabelas, histórico de alterações e regras de acesso
sw.js / manifest      instalação como app
```

## Regras principais

- **Mês de referência = data de pagamento** (igual à planilha). No cartão é a data de vencimento da fatura.
- **Fatura do cartão:** compra antes do dia de fechamento entra na fatura do mês; no dia do fechamento ou depois, entra na seguinte.
- **Parcelado:** o valor total é dividido (centavos que sobram ficam na 1ª parcela) e cada parcela cai numa fatura.
- **Pagar fatura** (tela Cartões): registra a saída na conta e marca os itens como pagos, sem contar a despesa duas vezes.
- **Saldo da conta:** saldo inicial na data informada + tudo que foi recebido/pago a partir dessa data.

## Importar (tela 📥)

- **PDF com IA (Gemini)**: fatura de cartão ou extrato de conta, lidos pela função `api/ler-pdf.js` na Vercel (a chave fica na variável `GEMINI_API_KEY`; opcional `GEMINI_MODELS`). PDF com senha vai como imagens das páginas. Substitui os Apps Scripts de conversão.
- **PDF de fatura (leitor simples)**: leitor genérico de linhas "dd/mm descrição [nn/nn] valor", com conferência contra o "Total desta fatura" do PDF. PDF com senha: informe a senha na tela.
- **OFX** (extrato da conta): débito do boleto/fatura é sugerido como "Pagamento de fatura" (não conta como despesa).
- **CSV** de banco (colunas Data, Descrição/Estabelecimento, Valor, Parcela) ou no **formato do app** (exportação/migração da planilha).
- Prévia antes de gravar, categoria sugerida pelo histórico, parcelas futuras criadas automaticamente,
  bloqueio de duplicados (cada linha tem uma chave única) e **Desfazer** por importação.
- pdf.js fica em `vendor/pdfjs` (licença Apache 2.0), servido pelo próprio site.

## Versões

O número da versão fica em `js/config.js` (VERSAO) e o histórico em `js/versoes.js` — ele aparece na tela **Novidades** do app.
A cada ajuste: atualizar os dois, e o `CACHE` do `sw.js`.

## Integrações (v1.6)

- **Assistente IA** (`api/ia.js`): análise financeira e chat com Gemini, sob demanda.
- **Telegram** (`api/telegram.js`): bot pessoal — lançar por texto/foto, PDFs para a Caixa de entrada, perguntas, /resumo /saldo /faturas /contas /relatorio.
- **Google Drive** (`api/drive.js` + `apps-script/Codigo.gs`): Caixa de entrada → Arquivo por ano/mês, comprovantes originais, relatórios e backups.
- **Agendador** (`api/cron.js`, 08:00 de Brasília): avisos de vencimento, relatório do mês no dia 1º e backup semanal.
- Variáveis na Vercel: `GEMINI_API_KEY`, `APP_SECRET`, `CRON_SECRET`.

## Versões anteriores

- v1.4 recorrentes, regras, tags, orçamento · v1.5 patrimônio, metas, investimentos, dívidas, multimoeda, IR, comprovantes, 2 etapas
