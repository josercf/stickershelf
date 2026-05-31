-- Migration idempotente: corrige as figurinhas do patrocinador Coca-Cola.
--
-- Estado anterior (errado): a secao "Coca-Cola" tinha 10 figurinhas com codigos
-- no estilo "COKE-01".."COKE-10" (ou "COKE 1".."COKE 10" em versoes antigas).
-- Estado correto: 14 figurinhas com codigos CC1..CC14 e titulos
-- "Coca-Cola 1".."Coca-Cola 14".
--
-- ATENCAO: app em producao com 6 usuarios reais. Esta migration:
--   1) REMOVE as figurinhas COKE antigas (qualquer variante de codigo 'COKE%');
--   2) INSERE as 14 figurinhas CC1..CC14 (ON CONFLICT DO NOTHING, nao duplica);
--   3) AJUSTA total_stickers para a contagem real do album (994 no template).
--
-- E 100% idempotente: rodar varias vezes deixa o mesmo estado final.
-- Pode ser que ninguem tenha rodado o SQL anterior ainda: nesse caso o DELETE
-- nao encontra nada (no-op) e o INSERT apenas adiciona as CC.
--
-- Alvo: todo album que ja contem o catalogo da Copa, identificado pela presenca
-- da figurinha de codigo 'FWC 1' (existe em todo album gerado pelo template).
-- Cobre os albuns da Copa dos 6 usuarios mesmo que o album tenha sido renomeado.

-- 1) Remover as figurinhas Coca-Cola antigas (codigos COKE...) ----------------
delete from public.stickers s
where s.code like 'COKE%'
  and exists (
    select 1
    from public.stickers fwc
    where fwc.album_id = s.album_id
      and fwc.code = 'FWC 1'
  );

-- 2) Inserir as 14 figurinhas Coca-Cola corretas (CC1..CC14) ------------------
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

-- 3) Ajustar total_stickers para a contagem real do album --------------------
-- Usa a contagem real (nao GREATEST) para CORRIGIR totais inflados por um
-- estado intermediario (ex.: 980 + 10 COKE + 14 CC = 1004 antes da limpeza).
-- Apos delete + insert o template tem exatamente 994 figurinhas (980 + 14).
-- Idempotente: rodar de novo recalcula o mesmo valor.
update public.albums a
set total_stickers = (
  select count(*) from public.stickers s where s.album_id = a.id
)
where exists (
  select 1
  from public.stickers s
  where s.album_id = a.id
    and s.code = 'FWC 1'
);
