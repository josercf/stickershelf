-- Migration idempotente: adiciona as 10 figurinhas do patrocinador Coca-Cola
-- (secao "Coca-Cola", codigos COKE-01..COKE-10) aos albuns ja existentes da
-- FIFA World Cup 2026 dos usuarios.
--
-- ATENCAO: app em producao com usuarios reais. Apenas operacoes ADITIVAS.
-- Nada de DROP/DELETE/TRUNCATE/UPDATE destrutivo. Pode rodar varias vezes:
-- o ON CONFLICT (album_id, code) DO NOTHING garante idempotencia.
--
-- Alvo: todo album que ja contem o catalogo da Copa (identificado pela
-- presenca da figurinha de codigo 'FWC-01', que existe em todo album gerado
-- pelo template). Isso cobre os albuns da Copa dos 6 usuarios mesmo que o
-- album tenha sido renomeado.

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
  ('COKE-01', 'Coca-Cola — Logo oficial'),
  ('COKE-02', 'Coca-Cola — Garrafa da Copa'),
  ('COKE-03', 'Coca-Cola — Trophy Tour'),
  ('COKE-04', 'Coca-Cola — Lata edição Copa 2026'),
  ('COKE-05', 'Coca-Cola — Torcida do mundo'),
  ('COKE-06', 'Coca-Cola — Momento do gol'),
  ('COKE-07', 'Coca-Cola — Estádio patrocinado'),
  ('COKE-08', 'Coca-Cola — Mascote Coca-Cola'),
  ('COKE-09', 'Coca-Cola — Bandeira comemorativa'),
  ('COKE-10', 'Coca-Cola — Pôster colecionável')
) as c(code, title)
where exists (
  select 1
  from public.stickers s
  where s.album_id = a.id
    and s.code = 'FWC-01'
)
on conflict (album_id, code) do nothing;
