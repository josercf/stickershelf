-- Migration idempotente: adiciona as 14 figurinhas do patrocinador Coca-Cola
-- (secao "Coca-Cola", codigos CC1..CC14, titulos "Coca-Cola 1".."Coca-Cola 14")
-- aos albuns ja existentes da FIFA World Cup 2026 dos usuarios, e ajusta o
-- total_stickers desses albuns.
--
-- ATENCAO: app em producao com 6 usuarios reais. Apenas operacoes ADITIVAS.
-- Nada de DROP/DELETE/TRUNCATE/ALTER DROP COLUMN. Pode rodar varias vezes:
--   - o INSERT usa ON CONFLICT (album_id, code) DO NOTHING (nao duplica);
--   - o UPDATE de total_stickers usa GREATEST + contagem real (idempotente:
--     rodar de novo nao soma de novo, so reflete a quantidade atual).
--
-- Alvo: todo album que ja contem o catalogo da Copa, identificado pela
-- presenca da figurinha de codigo 'FWC 1' (existe em todo album gerado pelo
-- template). Isso cobre os albuns da Copa dos 6 usuarios mesmo que o album
-- tenha sido renomeado.

-- 1) Inserir as 14 figurinhas Coca-Cola (sem tocar nas existentes) -----------
insert into public.stickers (album_id, code, title, section, owned, quantity, is_stuck, wishlisted)
select
  a.id,
  c.code,
  c.title,
  'Coca-Cola' as section,
  false as owned,
  0 as quantity,
  false as is_stuck,
  false as wishlisted
from public.albums a
cross join (values
  ('CC1',  'Coca-Cola 1'),
  ('CC2',  'Coca-Cola 2'),
  ('CC3',  'Coca-Cola 3'),
  ('CC4',  'Coca-Cola 4'),
  ('CC5',  'Coca-Cola 5'),
  ('CC6',  'Coca-Cola 6'),
  ('CC7',  'Coca-Cola 7'),
  ('CC8',  'Coca-Cola 8'),
  ('CC9',  'Coca-Cola 9'),
  ('CC10', 'Coca-Cola 10'),
  ('CC11', 'Coca-Cola 11'),
  ('CC12', 'Coca-Cola 12'),
  ('CC13', 'Coca-Cola 13'),
  ('CC14', 'Coca-Cola 14')
) as c(code, title)
where exists (
  select 1
  from public.stickers s
  where s.album_id = a.id
    and s.code = 'FWC 1'
)
on conflict (album_id, code) do nothing;

-- 2) Ajustar total_stickers dos albuns da Copa (idempotente) -----------------
-- Usa a contagem real de figurinhas do album, nunca diminuindo um total que o
-- dono tenha ajustado manualmente para cima. Apos o insert acima, o album do
-- template passa a ter 994 figurinhas (980 + 14), entao total_stickers vira
-- max(total_atual, 994) sem somar repetido se a migration rodar de novo.
update public.albums a
set total_stickers = greatest(
  a.total_stickers,
  (select count(*) from public.stickers s where s.album_id = a.id)
)
where exists (
  select 1
  from public.stickers s
  where s.album_id = a.id
    and s.code = 'FWC 1'
);
