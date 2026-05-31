-- Migration idempotente: compartilhamento por link de uso unico,
-- rename de album restrito ao owner e label/descricao do album.
--
-- Pode ser executada manualmente no Supabase quantas vezes for preciso.
-- O conteudo aqui tambem esta refletido em supabase/schema.sql.

-- 1) Label/descricao do album -----------------------------------------------
alter table public.albums
add column if not exists label varchar(200);

-- 2) Link de uso unico: expiracao (48h) e marca de uso ----------------------
alter table public.album_members
add column if not exists expires_at timestamptz,
add column if not exists used_at timestamptz;

-- 3) Rename restrito ao owner -----------------------------------------------
-- A policy antiga usava can_edit_album (permitia editores). Restringe a owner.
drop policy if exists "Owners update albums" on public.albums;
create policy "Owners update albums"
on public.albums for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- 4) Criacao de album passa a aceitar label ---------------------------------
-- Remove a assinatura antiga (5 args) para evitar overload ambiguo no PostgREST.
drop function if exists public.create_album_for_current_user(text, text, text, text, integer);

create or replace function public.create_album_for_current_user(
  p_name text,
  p_publisher text default null,
  p_season text default null,
  p_cover_url text default null,
  p_total_stickers integer default 0,
  p_label text default null
)
returns public.albums
security definer
set search_path = public
language plpgsql
as $$
declare
  new_album public.albums;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.albums (owner_id, name, publisher, season, cover_url, total_stickers, label)
  values (
    auth.uid(),
    p_name,
    p_publisher,
    p_season,
    p_cover_url,
    coalesce(p_total_stickers, 0),
    p_label
  )
  returning * into new_album;

  return new_album;
end;
$$;

-- 5) Aceite de convite por link: expiracao + uso unico ----------------------
-- So aceita se: o link nao foi usado (used_at is null) e nao expirou.
-- Ao aceitar, preenche user_id e marca used_at (uso unico).
create or replace function public.accept_album_invite(invite_token_value uuid)
returns setof public.album_members
security definer
set search_path = public
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  update public.album_members
  set user_id = auth.uid(),
      invite_value = coalesce(
        lower(nullif(auth.jwt() ->> 'email', '')),
        nullif(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '[^\d+]', '', 'g'), ''),
        lower(nullif(auth.jwt() -> 'user_metadata' ->> 'username', '')),
        lower(nullif(auth.jwt() -> 'raw_user_meta_data' ->> 'username', '')),
        auth.uid()::text
      ),
      accepted_at = coalesce(accepted_at, now()),
      used_at = now()
  where invite_token = invite_token_value
    and invite_type = 'link'
    and used_at is null
    and (expires_at is null or expires_at > now())
  returning *;
end;
$$;
