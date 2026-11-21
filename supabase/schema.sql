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
