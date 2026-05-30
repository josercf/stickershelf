create extension if not exists "pgcrypto";

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  publisher text,
  season text,
  cover_url text,
  total_stickers integer not null default 0 check (total_stickers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.albums
add column if not exists owner_id uuid references auth.users(id) on delete set null;

create table if not exists public.album_members (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (album_id, email)
);

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
using (
  auth.uid() = owner_id
  or exists (
    select 1 from public.album_members am
    where am.album_id = albums.id
      and lower(am.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create policy "Authenticated create albums"
on public.albums for insert
with check (auth.uid() is not null and owner_id = auth.uid());

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
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1 from public.albums a
    where a.id = album_members.album_id
      and a.owner_id = auth.uid()
  )
);

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
using (
  exists (
    select 1 from public.albums a
    where a.id = stickers.album_id
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1 from public.album_members am
          where am.album_id = a.id
            and lower(am.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  )
);

create policy "Editors insert stickers"
on public.stickers for insert
with check (
  exists (
    select 1 from public.albums a
    where a.id = stickers.album_id
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1 from public.album_members am
          where am.album_id = a.id
            and lower(am.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            and am.role in ('owner', 'editor')
        )
      )
  )
);

create policy "Editors update stickers"
on public.stickers for update
using (
  exists (
    select 1 from public.albums a
    where a.id = stickers.album_id
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1 from public.album_members am
          where am.album_id = a.id
            and lower(am.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            and am.role in ('owner', 'editor')
        )
      )
  )
)
with check (
  exists (
    select 1 from public.albums a
    where a.id = stickers.album_id
      and (
        a.owner_id = auth.uid()
        or exists (
          select 1 from public.album_members am
          where am.album_id = a.id
            and lower(am.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            and am.role in ('owner', 'editor')
        )
      )
  )
);

create policy "Owners delete stickers"
on public.stickers for delete
using (
  exists (
    select 1 from public.albums a
    where a.id = stickers.album_id
      and a.owner_id = auth.uid()
  )
);
