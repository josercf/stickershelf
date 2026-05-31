-- Migration idempotente: aba "Mercado" (descoberta de outros usuarios e seus
-- albuns em modo SOMENTE LEITURA, para encontrar figurinhas repetidas de troca).
--
-- ATENCAO: app em producao. Apenas operacoes ADITIVAS.
-- Nada de DROP TABLE/DELETE/TRUNCATE/ALTER DROP COLUMN. Tudo CREATE OR REPLACE.
--
-- Privacidade: nenhuma RPC abaixo expoe e-mail, telefone ou metadados pessoais.
-- O identificador publico do usuario sao os 8 primeiros caracteres do UUID,
-- derivados no frontend a partir de user_id.
--
-- O conteudo aqui tambem esta refletido em supabase/schema.sql.

-- 1) Lista de usuarios que possuem albuns ----------------------------------
-- Retorna owner_id (uuid), qtd de albuns e total de figurinhas cadastradas.
-- SECURITY DEFINER para enxergar albuns/figurinhas de outros usuarios em
-- agregado, sem afrouxar as policies de RLS das tabelas. Exclui o proprio
-- usuario (voce nao troca consigo mesmo).
create or replace function public.market_list_users()
returns table (
  user_id uuid,
  album_count bigint,
  sticker_count bigint
)
security definer
set search_path = public
stable
language sql
as $$
  select
    a.owner_id as user_id,
    count(distinct a.id) as album_count,
    coalesce(sum(sc.cnt), 0) as sticker_count
  from public.albums a
  left join (
    select album_id, count(*) as cnt
    from public.stickers
    group by album_id
  ) sc on sc.album_id = a.id
  where a.owner_id is not null
    and (auth.uid() is null or a.owner_id <> auth.uid())
  group by a.owner_id
  order by album_count desc, sticker_count desc;
$$;

-- 2) Albuns de um usuario especifico ---------------------------------------
-- Retorna os albuns do dono indicado, com contagens uteis para o card:
-- total cadastrado, quantos o dono possui e quantas estao repetidas (trocas).
create or replace function public.market_list_albums(p_user_id uuid)
returns table (
  id uuid,
  name text,
  label varchar,
  publisher text,
  season text,
  cover_url text,
  total_stickers integer,
  sticker_count bigint,
  owned_count bigint,
  duplicate_count bigint
)
security definer
set search_path = public
stable
language sql
as $$
  select
    a.id,
    a.name,
    a.label,
    a.publisher,
    a.season,
    a.cover_url,
    a.total_stickers,
    count(s.id) as sticker_count,
    count(s.id) filter (where s.quantity > 0) as owned_count,
    coalesce(sum(greatest(s.quantity - 1, 0)), 0) as duplicate_count
  from public.albums a
  left join public.stickers s on s.album_id = a.id
  where a.owner_id = p_user_id
  group by a.id, a.name, a.label, a.publisher, a.season, a.cover_url, a.total_stickers, a.updated_at
  order by a.updated_at desc;
$$;

-- 3) Figurinhas de um album de outro usuario (somente leitura) --------------
-- Retorna as figurinhas do album indicado. Exige que o album tenha dono
-- (e portanto seja um album "real" do mercado). Inclui quantity, para o
-- frontend destacar as repetidas (quantity > 1 = disponiveis para troca).
create or replace function public.market_list_stickers(p_album_id uuid)
returns table (
  id uuid,
  album_id uuid,
  code text,
  title text,
  section text,
  image_url text,
  owned boolean,
  quantity integer,
  is_stuck boolean,
  wishlisted boolean,
  created_at timestamptz,
  updated_at timestamptz
)
security definer
set search_path = public
stable
language sql
as $$
  select
    s.id,
    s.album_id,
    s.code,
    s.title,
    s.section,
    s.image_url,
    s.owned,
    s.quantity,
    s.is_stuck,
    s.wishlisted,
    s.created_at,
    s.updated_at
  from public.stickers s
  join public.albums a on a.id = s.album_id
  where s.album_id = p_album_id
    and a.owner_id is not null
  order by s.code asc;
$$;

-- Garante que os papeis do PostgREST possam executar as RPCs do mercado.
grant execute on function public.market_list_users() to anon, authenticated;
grant execute on function public.market_list_albums(uuid) to anon, authenticated;
grant execute on function public.market_list_stickers(uuid) to anon, authenticated;
