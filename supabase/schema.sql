-- =====================================================================
-- Financeiro Pessoal EPR10 — estrutura do banco (Supabase / PostgreSQL)
-- Como usar: Supabase → SQL Editor → New query → cole TODO este arquivo → Run
-- Pode rodar mais de uma vez sem perder dados (usa IF NOT EXISTS).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Contas bancárias (inclui "Dinheiro" e vale-alimentação)
-- ---------------------------------------------------------------------
create table if not exists public.contas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome          text not null,
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo    date not null default current_date,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (user_id, nome)
);

-- ---------------------------------------------------------------------
-- Cartões de crédito
-- ---------------------------------------------------------------------
create table if not exists public.cartoes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome               text not null,
  dia_fechamento     smallint not null check (dia_fechamento between 1 and 31),
  dia_vencimento     smallint not null check (dia_vencimento between 1 and 31),
  limite             numeric(14,2) not null default 0,
  conta_pagamento_id uuid references public.contas(id) on delete set null,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (user_id, nome)
);

-- ---------------------------------------------------------------------
-- Categorias (receitas e despesas)
-- grupo: 'Renda Ativa' | 'Renda Passiva' | 'Despesas Essenciais'
--        | 'Despesas Não Essenciais' | 'Metas / Investimentos'
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null,
  emoji      text not null default '',
  tipo       text not null check (tipo in ('receita','despesa')),
  grupo      text not null,
  valor_mensal numeric(14,2) not null default 0,  -- previsão (receita) ou limite (despesa)
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, tipo, nome)
);

-- ---------------------------------------------------------------------
-- Lotes de importação (para desfazer uma importação inteira)
-- ---------------------------------------------------------------------
create table if not exists public.lotes_importacao (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origem     text not null,              -- 'planilha', 'fatura_pdf', 'ofx', 'csv'
  descricao  text not null default '',
  quantidade integer not null default 0,
  total      numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Lançamentos (equivale à aba "Movimentações")
-- tipo:
--   'entrada'          receita (usa conta_id)
--   'saida'            despesa (conta_id OU cartao_id)
--   'transferencia'    entre contas (conta_id = origem, conta_destino_id = destino)
--   'pagamento_fatura' paga a fatura (conta_id = de onde saiu, cartao_id = qual cartão)
-- situacao: 'pago' | 'pendente' | 'recebido'
-- data_pagamento é a data que conta para o mês (no cartão = vencimento da fatura)
-- ---------------------------------------------------------------------
create table if not exists public.lancamentos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data_movimento   date not null,
  data_pagamento   date not null,
  tipo             text not null check (tipo in ('entrada','saida','transferencia','pagamento_fatura')),
  categoria_id     uuid references public.categorias(id) on delete set null,
  descricao        text not null default '',
  valor            numeric(14,2) not null check (valor > 0),
  conta_id         uuid references public.contas(id) on delete set null,
  conta_destino_id uuid references public.contas(id) on delete set null,
  cartao_id        uuid references public.cartoes(id) on delete set null,
  metodo           text not null default '',   -- Pix, Débito, Boleto, Dinheiro, Crédito, Transferência
  parcela_num      smallint,
  parcela_total    smallint,
  grupo_parcela    uuid,
  situacao         text not null check (situacao in ('pago','pendente','recebido')),
  origem           text not null default 'manual',
  lote_id          uuid references public.lotes_importacao(id) on delete cascade,
  chave_dedup      text,                        -- evita importar a mesma linha duas vezes
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists lanc_user_pag_idx on public.lancamentos (user_id, data_pagamento);
create index if not exists lanc_user_cartao_idx on public.lancamentos (user_id, cartao_id, data_pagamento);
create index if not exists lanc_grupo_idx on public.lancamentos (grupo_parcela);
create unique index if not exists lanc_dedup_idx on public.lancamentos (user_id, chave_dedup) where chave_dedup is not null;

-- ---------------------------------------------------------------------
-- Histórico de alterações dos lançamentos (quem/quando/o quê)
-- ---------------------------------------------------------------------
create table if not exists public.historico (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid(),
  tabela     text not null,
  acao       text not null,           -- INSERT, UPDATE, DELETE
  registro_id uuid,
  antes      jsonb,
  depois     jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.fn_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into historico(user_id, tabela, acao, registro_id, antes)
    values (old.user_id, tg_table_name, tg_op, old.id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    insert into historico(user_id, tabela, acao, registro_id, antes, depois)
    values (new.user_id, tg_table_name, tg_op, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into historico(user_id, tabela, acao, registro_id, depois)
    values (new.user_id, tg_table_name, tg_op, new.id, to_jsonb(new));
    return new;
  end if;
end $$;

drop trigger if exists trg_hist_lanc on public.lancamentos;
create trigger trg_hist_lanc
  before insert or update or delete on public.lancamentos
  for each row execute function public.fn_historico();

-- ---------------------------------------------------------------------
-- Segurança: cada usuário só enxerga e altera os próprios dados
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['contas','cartoes','categorias','lotes_importacao','lancamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono_select" on public.%I', t);
    execute format('drop policy if exists "dono_insert" on public.%I', t);
    execute format('drop policy if exists "dono_update" on public.%I', t);
    execute format('drop policy if exists "dono_delete" on public.%I', t);
    execute format('create policy "dono_select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "dono_insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "dono_update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "dono_delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.historico enable row level security;
drop policy if exists "dono_select" on public.historico;
create policy "dono_select" on public.historico for select using (user_id = auth.uid());
-- (histórico é gravado só pelo gatilho; usuário não insere/edita/apaga)

-- ---------------------------------------------------------------------
-- Permissões: só usuário logado acessa (as regras acima limitam a cada dono).
-- Projetos novos do Supabase não liberam as tabelas automaticamente.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contas, public.cartoes, public.categorias, public.lotes_importacao, public.lancamentos to authenticated;
grant select on public.historico to authenticated;
revoke all on public.contas, public.cartoes, public.categorias, public.lotes_importacao, public.lancamentos, public.historico from anon;
-- a função do histórico só roda pelo gatilho, nunca chamada direto pela API
revoke execute on function public.fn_historico() from public, anon, authenticated;

-- =====================================================================
-- v1.2.0 — perfil com foto e personalização de contas/cartões
-- =====================================================================
create table if not exists public.perfis (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null default '',
  foto       text,
  updated_at timestamptz not null default now(),
  constraint foto_tamanho check (foto is null or length(foto) <= 400000)
);
alter table public.perfis enable row level security;
drop policy if exists "dono_select" on public.perfis;
drop policy if exists "dono_insert" on public.perfis;
drop policy if exists "dono_update" on public.perfis;
drop policy if exists "dono_delete" on public.perfis;
create policy "dono_select" on public.perfis for select using (user_id = auth.uid());
create policy "dono_insert" on public.perfis for insert with check (user_id = auth.uid());
create policy "dono_update" on public.perfis for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dono_delete" on public.perfis for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.perfis to authenticated;
revoke all on public.perfis from anon;

alter table public.contas  add column if not exists icone  text not null default '🏦';
alter table public.contas  add column if not exists cor    text not null default '#2563eb';
alter table public.contas  add column if not exists imagem text;
alter table public.cartoes add column if not exists icone  text not null default '💳';
alter table public.cartoes add column if not exists cor    text not null default '#0f172a';
alter table public.cartoes add column if not exists imagem text;
alter table public.cartoes add column if not exists final  text not null default '';
alter table public.contas  drop constraint if exists contas_imagem_tamanho;
alter table public.contas  add constraint contas_imagem_tamanho check (imagem is null or length(imagem) <= 200000);
alter table public.cartoes drop constraint if exists cartoes_imagem_tamanho;
alter table public.cartoes add constraint cartoes_imagem_tamanho check (imagem is null or length(imagem) <= 200000);
alter table public.cartoes drop constraint if exists cartoes_final_formato;
alter table public.cartoes add constraint cartoes_final_formato check (final ~ '^[0-9]{0,4}$');

-- =====================================================================
-- v1.2.1 — lista de sugestões de melhorias (tela Novidades)
-- =====================================================================
create table if not exists public.sugestoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto      text not null check (length(texto) between 1 and 1000),
  feito      boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.sugestoes enable row level security;
drop policy if exists "dono_select" on public.sugestoes;
drop policy if exists "dono_insert" on public.sugestoes;
drop policy if exists "dono_update" on public.sugestoes;
drop policy if exists "dono_delete" on public.sugestoes;
create policy "dono_select" on public.sugestoes for select using (user_id = auth.uid());
create policy "dono_insert" on public.sugestoes for insert with check (user_id = auth.uid());
create policy "dono_update" on public.sugestoes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dono_delete" on public.sugestoes for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.sugestoes to authenticated;
revoke all on public.sugestoes from anon;

-- =====================================================================
-- v1.4.0 — preferências, recorrentes, regras de categoria, tags, conferência de saldo
-- =====================================================================
alter table public.perfis add column if not exists preferencias jsonb not null default '{}'::jsonb;

create table if not exists public.recorrentes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  descricao    text not null check (length(descricao) between 1 and 200),
  tipo         text not null check (tipo in ('entrada','saida')),
  valor        numeric(14,2) not null check (valor > 0),
  categoria_id uuid references public.categorias(id) on delete set null,
  conta_id     uuid references public.contas(id) on delete set null,
  cartao_id    uuid references public.cartoes(id) on delete set null,
  metodo       text not null default '',
  dia          smallint not null check (dia between 1 and 31),
  inicio       date not null default current_date,
  fim          date,
  ultimo_mes   text,              -- 'AAAA-MM' do último mês já gerado
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.regras_categoria (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contem       text not null check (length(contem) between 2 and 100),
  tipo         text not null check (tipo in ('entrada','saida')),
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (user_id, tipo, contem)
);

alter table public.lancamentos add column if not exists recorrente_id uuid references public.recorrentes(id) on delete set null;
alter table public.lancamentos add column if not exists tags text[] not null default '{}';
alter table public.contas add column if not exists conferido_em date;
alter table public.contas add column if not exists conferido_saldo numeric(14,2);

do $$
declare t text;
begin
  foreach t in array array['recorrentes','regras_categoria'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono_select" on public.%I', t);
    execute format('drop policy if exists "dono_insert" on public.%I', t);
    execute format('drop policy if exists "dono_update" on public.%I', t);
    execute format('drop policy if exists "dono_delete" on public.%I', t);
    execute format('create policy "dono_select" on public.%I for select using (user_id = (select auth.uid()))', t);
    execute format('create policy "dono_insert" on public.%I for insert with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono_update" on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono_delete" on public.%I for delete using (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create index if not exists rec_user_idx on public.recorrentes (user_id);
create index if not exists regras_user_idx on public.regras_categoria (user_id);
create index if not exists lanc_recorrente_idx on public.lancamentos (recorrente_id);
create index if not exists regras_cat_idx on public.regras_categoria (categoria_id);
create index if not exists rec_cat_idx on public.recorrentes (categoria_id);
create index if not exists rec_conta_idx on public.recorrentes (conta_id);
create index if not exists rec_cartao_idx on public.recorrentes (cartao_id);

-- =====================================================================
-- v1.5.0 — metas, investimentos, dívidas, patrimônio, multimoeda, IR, comprovantes, 2 etapas
-- =====================================================================
create table if not exists public.metas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome         text not null check (length(nome) between 1 and 100),
  emoji        text not null default '🎯',
  cor          text not null default '#4f46e5',
  valor_alvo   numeric(14,2) not null check (valor_alvo > 0),
  valor_inicial numeric(14,2) not null default 0,
  prazo        date,
  concluida    boolean not null default false,
  created_at   timestamptz not null default now()
);
create table if not exists public.metas_movimentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meta_id       uuid not null references public.metas(id) on delete cascade,
  data          date not null default current_date,
  valor         numeric(14,2) not null check (valor <> 0),
  descricao     text not null default '',
  lancamento_id uuid references public.lancamentos(id) on delete set null,
  created_at    timestamptz not null default now()
);
create table if not exists public.investimentos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome           text not null check (length(nome) between 1 and 100),
  classe         text not null check (classe in ('renda_fixa','renda_variavel','cripto','previdencia','outro')),
  subtipo        text not null default '',
  instituicao    text not null default '',
  moeda          text not null default 'BRL' check (moeda in ('BRL','USD')),
  valor_aplicado numeric(14,2) not null default 0,
  valor_atual    numeric(14,2) not null default 0,
  atualizado_em  date not null default current_date,
  vencimento     date,
  rentabilidade  text not null default '',
  liquidez       text not null default '',
  ativo          boolean not null default true,
  created_at     timestamptz not null default now()
);
create table if not exists public.investimentos_historico (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investimento_id uuid not null references public.investimentos(id) on delete cascade,
  data           date not null default current_date,
  valor_atual    numeric(14,2) not null,
  aporte         numeric(14,2) not null default 0,
  created_at     timestamptz not null default now()
);
create table if not exists public.dividas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome           text not null check (length(nome) between 1 and 100),
  direcao        text not null default 'devo' check (direcao in ('devo','me_devem')),
  tipo           text not null default 'emprestimo',
  pessoa         text not null default '',
  valor_original numeric(14,2) not null default 0,
  saldo          numeric(14,2) not null default 0,
  taxa_mensal    numeric(7,4),
  parcela_valor  numeric(14,2),
  parcelas_total smallint,
  parcelas_pagas smallint not null default 0,
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  inicio         date not null default current_date,
  ativo          boolean not null default true,
  obs            text not null default '',
  created_at     timestamptz not null default now()
);
create table if not exists public.dividas_pagamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  divida_id     uuid not null references public.dividas(id) on delete cascade,
  data          date not null default current_date,
  valor         numeric(14,2) not null check (valor > 0),
  juros         numeric(14,2) not null default 0,
  lancamento_id uuid references public.lancamentos(id) on delete set null,
  created_at    timestamptz not null default now()
);
create table if not exists public.patrimonio_mensal (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mes          text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  contas       numeric(14,2) not null default 0,
  investimentos numeric(14,2) not null default 0,
  a_receber    numeric(14,2) not null default 0,
  dividas      numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  updated_at   timestamptz not null default now(),
  unique (user_id, mes)
);

alter table public.contas add column if not exists moeda text not null default 'BRL';
alter table public.contas drop constraint if exists contas_moeda_ok;
alter table public.contas add constraint contas_moeda_ok check (moeda in ('BRL','USD'));
alter table public.lancamentos add column if not exists moeda text not null default 'BRL';
alter table public.lancamentos add column if not exists valor_moeda numeric(14,2);
alter table public.lancamentos add column if not exists cotacao numeric(12,6);
alter table public.lancamentos add column if not exists dedutivel boolean not null default false;
alter table public.lancamentos add column if not exists comprovante text;          -- caminho no Storage
alter table public.lancamentos add column if not exists comprovante_mini text;     -- miniatura (data URL)
alter table public.lancamentos drop constraint if exists lanc_mini_tamanho;
alter table public.lancamentos add constraint lanc_mini_tamanho check (comprovante_mini is null or length(comprovante_mini) <= 60000);
alter table public.categorias add column if not exists dedutivel boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['metas','metas_movimentos','investimentos','investimentos_historico','dividas','dividas_pagamentos','patrimonio_mensal'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono_select" on public.%I', t);
    execute format('drop policy if exists "dono_insert" on public.%I', t);
    execute format('drop policy if exists "dono_update" on public.%I', t);
    execute format('drop policy if exists "dono_delete" on public.%I', t);
    execute format('create policy "dono_select" on public.%I for select using (user_id = (select auth.uid()))', t);
    execute format('create policy "dono_insert" on public.%I for insert with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono_update" on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono_delete" on public.%I for delete using (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create index if not exists metas_user_idx on public.metas (user_id);
create index if not exists metasmov_meta_idx on public.metas_movimentos (meta_id);
create index if not exists metasmov_user_idx on public.metas_movimentos (user_id);
create index if not exists metasmov_lanc_idx on public.metas_movimentos (lancamento_id);
create index if not exists inv_user_idx on public.investimentos (user_id);
create index if not exists invh_inv_idx on public.investimentos_historico (investimento_id);
create index if not exists invh_user_idx on public.investimentos_historico (user_id);
create index if not exists div_user_idx on public.dividas (user_id);
create index if not exists divp_div_idx on public.dividas_pagamentos (divida_id);
create index if not exists divp_user_idx on public.dividas_pagamentos (user_id);
create index if not exists divp_lanc_idx on public.dividas_pagamentos (lancamento_id);

-- Comprovantes: bucket privado, cada usuário só mexe na própria pasta (<user_id>/arquivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 2097152, array['image/webp','image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "comprovantes_dono_select" on storage.objects;
drop policy if exists "comprovantes_dono_insert" on storage.objects;
drop policy if exists "comprovantes_dono_update" on storage.objects;
drop policy if exists "comprovantes_dono_delete" on storage.objects;
create policy "comprovantes_dono_select" on storage.objects for select to authenticated using (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "comprovantes_dono_insert" on storage.objects for insert to authenticated with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "comprovantes_dono_update" on storage.objects for update to authenticated using (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "comprovantes_dono_delete" on storage.objects for delete to authenticated using (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Verificação em 2 etapas: quem ativou o app autenticador só acessa os dados depois de digitar o código (aal2)
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;
do $$
declare t text;
begin
  foreach t in array array['contas','cartoes','categorias','lotes_importacao','lancamentos','perfis','sugestoes','recorrentes','regras_categoria',
                           'metas','metas_movimentos','investimentos','investimentos_historico','dividas','dividas_pagamentos','patrimonio_mensal','historico'] loop
    execute format('drop policy if exists "exige_2_etapas" on public.%I', t);
    execute format('create policy "exige_2_etapas" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
  end loop;
end $$;

-- v1.5.0 (ajuste): função da verificação em 2 etapas fica num schema que não é exposto pela API
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;
create or replace function privado.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke execute on function privado.mfa_ok() from public, anon;
grant execute on function privado.mfa_ok() to authenticated;
do $$
declare t text;
begin
  foreach t in array array['contas','cartoes','categorias','lotes_importacao','lancamentos','perfis','sugestoes','recorrentes','regras_categoria',
                           'metas','metas_movimentos','investimentos','investimentos_historico','dividas','dividas_pagamentos','patrimonio_mensal','historico'] loop
    execute format('drop policy if exists "exige_2_etapas" on public.%I', t);
    execute format('create policy "exige_2_etapas" on public.%I as restrictive for all to authenticated using ((select privado.mfa_ok())) with check ((select privado.mfa_ok()))', t);
  end loop;
end $$;
drop function if exists public.mfa_ok();
