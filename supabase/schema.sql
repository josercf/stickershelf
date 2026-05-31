create extension if not exists "pgcrypto";

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  label varchar(200),
  publisher text,
  season text,
  cover_url text,
  total_stickers integer not null default 0 check (total_stickers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.albums
add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.albums
add column if not exists label varchar(200);

create table if not exists public.album_members (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  invite_type text not null default 'email' check (invite_type in ('email', 'username', 'phone', 'link')),
  invite_value text,
  invite_token uuid,
  accepted_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.album_members
add column if not exists user_id uuid references auth.users(id) on delete cascade,
add column if not exists invite_type text not null default 'email' check (invite_type in ('email', 'username', 'phone', 'link')),
add column if not exists invite_value text,
add column if not exists invite_token uuid,
add column if not exists accepted_at timestamptz,
add column if not exists expires_at timestamptz,
add column if not exists used_at timestamptz;

alter table public.album_members
alter column email drop not null;

update public.album_members
set invite_type = 'email',
    invite_value = lower(email)
where invite_value is null
  and email is not null;

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  code text not null,
  title text not null,
  section text,
  image_url text,
  owned boolean not null default false,
  quantity integer not null default 0 check (quantity >= 0),
  is_stuck boolean not null default false,
  wishlisted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, code)
);

create index if not exists stickers_album_id_idx on public.stickers(album_id);
create index if not exists stickers_album_code_idx on public.stickers(album_id, code);
create index if not exists album_members_album_id_idx on public.album_members(album_id);
create index if not exists album_members_email_idx on public.album_members(lower(email));
create index if not exists album_members_user_id_idx on public.album_members(user_id);
create index if not exists album_members_invite_value_idx on public.album_members(invite_type, lower(invite_value));
create unique index if not exists album_members_identity_key
on public.album_members(album_id, invite_type, invite_value)
where invite_value is not null;
create unique index if not exists album_members_token_key
on public.album_members(album_id, invite_token)
where invite_token is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'album_members_invite_identity_unique'
  ) then
    alter table public.album_members
    add constraint album_members_invite_identity_unique unique (album_id, invite_type, invite_value);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'album_members_invite_token_unique'
  ) then
    alter table public.album_members
    add constraint album_members_invite_token_unique unique (album_id, invite_token);
  end if;
end $$;

alter table public.stickers
add column if not exists is_stuck boolean not null default false;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists albums_set_updated_at on public.albums;
create trigger albums_set_updated_at
before update on public.albums
for each row execute function public.set_updated_at();

drop trigger if exists stickers_set_updated_at on public.stickers;
create trigger stickers_set_updated_at
before update on public.stickers
for each row execute function public.set_updated_at();

create or replace function public.current_invite_values()
returns text[]
stable
language sql
as $$
  select array_remove(array[
    lower(nullif(auth.jwt() ->> 'email', '')),
    nullif(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '[^\d+]', '', 'g'), ''),
    lower(nullif(auth.jwt() -> 'user_metadata' ->> 'username', '')),
    lower(nullif(auth.jwt() -> 'user_metadata' ->> 'user_name', '')),
    lower(nullif(auth.jwt() -> 'user_metadata' ->> 'name', '')),
    lower(nullif(auth.jwt() -> 'raw_user_meta_data' ->> 'username', '')),
    lower(nullif(auth.jwt() -> 'raw_user_meta_data' ->> 'user_name', '')),
    lower(nullif(auth.jwt() -> 'raw_user_meta_data' ->> 'name', ''))
  ], null);
$$;

create or replace function public.can_read_album(album_id_value uuid)
returns boolean
stable
security definer
set search_path = public
language sql
as $$
  select exists (
    select 1
    from public.albums a
    where a.id = album_id_value
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1
          from public.album_members am
          where am.album_id = a.id
            and (
              am.user_id = auth.uid()
              or lower(coalesce(am.invite_value, am.email, '')) = any(public.current_invite_values())
            )
        )
      )
  );
$$;

create or replace function public.can_edit_album(album_id_value uuid)
returns boolean
stable
security definer
set search_path = public
language sql
as $$
  select exists (
    select 1
    from public.albums a
    where a.id = album_id_value
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1
          from public.album_members am
          where am.album_id = a.id
            and am.role in ('owner', 'editor')
            and (
              am.user_id = auth.uid()
              or lower(coalesce(am.invite_value, am.email, '')) = any(public.current_invite_values())
            )
        )
      )
  );
$$;

-- Criacao de album via RPC (SECURITY DEFINER): contorna um quirk de RLS do
-- PostgREST no INSERT WITH CHECK direto. Define owner_id = auth.uid() internamente
-- e aceita label/descricao opcional.
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

-- Aceite de convite por link de uso unico:
-- so aceita se o link nao foi usado (used_at is null) e nao expirou.
-- Ao aceitar, preenche user_id e marca used_at, inutilizando o link.
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

alter table public.albums enable row level security;
alter table public.album_members enable row level security;
alter table public.stickers enable row level security;

drop policy if exists "Public read albums" on public.albums;
drop policy if exists "Public insert albums" on public.albums;
drop policy if exists "Public update albums" on public.albums;
drop policy if exists "Public delete albums" on public.albums;
drop policy if exists "Members read albums" on public.albums;
drop policy if exists "Authenticated create albums" on public.albums;
drop policy if exists "Owners update albums" on public.albums;
drop policy if exists "Owners delete albums" on public.albums;

create policy "Members read albums"
on public.albums for select
using (public.can_read_album(id));

create policy "Authenticated create albums"
on public.albums for insert
with check (auth.uid() is not null and owner_id = auth.uid());

-- Rename/label do album: apenas o owner. Editores editam figurinhas, nao o album.
create policy "Owners update albums"
on public.albums for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Owners delete albums"
on public.albums for delete
using (auth.uid() = owner_id);

drop policy if exists "Members read album_members" on public.album_members;
drop policy if exists "Owners manage album_members" on public.album_members;

create policy "Members read album_members"
on public.album_members for select
using (public.can_read_album(album_id));

create policy "Owners manage album_members"
on public.album_members for all
using (
  exists (
    select 1 from public.albums a
    where a.id = album_members.album_id
      and a.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.albums a
    where a.id = album_members.album_id
      and a.owner_id = auth.uid()
  )
);

drop policy if exists "Public read stickers" on public.stickers;
drop policy if exists "Public insert stickers" on public.stickers;
drop policy if exists "Public update stickers" on public.stickers;
drop policy if exists "Public delete stickers" on public.stickers;
drop policy if exists "Members read stickers" on public.stickers;
drop policy if exists "Editors insert stickers" on public.stickers;
drop policy if exists "Editors update stickers" on public.stickers;
drop policy if exists "Owners delete stickers" on public.stickers;

create policy "Members read stickers"
on public.stickers for select
using (public.can_read_album(album_id));

create policy "Editors insert stickers"
on public.stickers for insert
with check (public.can_edit_album(album_id));

create policy "Editors update stickers"
on public.stickers for update
using (public.can_edit_album(album_id))
with check (public.can_edit_album(album_id));

create policy "Owners delete stickers"
on public.stickers for delete
using (
  exists (
    select 1 from public.albums a
    where a.id = stickers.album_id
      and a.owner_id = auth.uid()
  )
);
