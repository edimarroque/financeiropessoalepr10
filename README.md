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

## Próximas etapas

- Importar fatura em PDF (XP e Itaú) com prévia, controle de duplicidade e desfazer
- Importar extrato OFX
- Migrar o histórico da planilha (corrigindo as 62 datas com dia e mês trocados)
- Metas financeiras e investimentos
