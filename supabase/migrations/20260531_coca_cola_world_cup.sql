-- Migration idempotente: adiciona as 10 figurinhas do patrocinador Coca-Cola
-- (secao "Coca-Cola", codigos COKE 1..COKE 10) aos albuns ja existentes da
-- FIFA World Cup 2026 dos usuarios.
--
-- ATENCAO: app em producao com usuarios reais. Apenas operacoes ADITIVAS.
-- Nada de DROP/DELETE/TRUNCATE/UPDATE destrutivo. Pode rodar varias vezes:
-- o ON CONFLICT (album_id, code) DO NOTHING garante idempotencia.
--
-- Alvo: todo album que ja contem o catalogo da Copa, identificado pela
-- presenca da figurinha de codigo 'FWC 1' (existe em todo album gerado pelo
-- template). Isso cobre os albuns da Copa dos 6 usuarios mesmo que o album
-- tenha sido renomeado. Os codigos seguem o estilo do template (prefixo +
-- numero com espaco), como as demais figurinhas ja cadastradas.

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
  ('COKE 1', 'Coca-Cola official logo'),
  ('COKE 2', 'Coca-Cola World Cup bottle'),
  ('COKE 3', 'Coca-Cola Trophy Tour'),
  ('COKE 4', 'Coca-Cola 2026 edition can'),
  ('COKE 5', 'Coca-Cola world fans'),
  ('COKE 6', 'Coca-Cola goal moment'),
  ('COKE 7', 'Coca-Cola sponsored stadium'),
  ('COKE 8', 'Coca-Cola mascot'),
  ('COKE 9', 'Coca-Cola celebration flag'),
  ('COKE 10', 'Coca-Cola collectible poster')
) as c(code, title)
where exists (
  select 1
  from public.stickers s
  where s.album_id = a.id
    and s.code = 'FWC 1'
)
on conflict (album_id, code) do nothing;
