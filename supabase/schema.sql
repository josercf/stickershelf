create extension if not exists "pgcrypto";

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  publisher text,
  season text,
  cover_url text,
  total_stickers integer not null default 0 check (total_stickers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
alter table public.stickers enable row level security;

drop policy if exists "Public read albums" on public.albums;
create policy "Public read albums"
on public.albums for select
using (true);

drop policy if exists "Public insert albums" on public.albums;
create policy "Public insert albums"
on public.albums for insert
with check (true);

drop policy if exists "Public update albums" on public.albums;
create policy "Public update albums"
on public.albums for update
using (true)
with check (true);

drop policy if exists "Public delete albums" on public.albums;
create policy "Public delete albums"
on public.albums for delete
using (true);

drop policy if exists "Public read stickers" on public.stickers;
create policy "Public read stickers"
on public.stickers for select
using (true);

drop policy if exists "Public insert stickers" on public.stickers;
create policy "Public insert stickers"
on public.stickers for insert
with check (true);

drop policy if exists "Public update stickers" on public.stickers;
create policy "Public update stickers"
on public.stickers for update
using (true)
with check (true);

drop policy if exists "Public delete stickers" on public.stickers;
create policy "Public delete stickers"
on public.stickers for delete
using (true);
