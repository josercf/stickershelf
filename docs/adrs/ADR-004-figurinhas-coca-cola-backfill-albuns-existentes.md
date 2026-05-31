# ADR-004: Figurinhas Coca-Cola no template da Copa e backfill nos álbuns existentes

- **Data:** 2026-05-31
- **Status:** Aceito
- **Decisores:** Jose Romualdo

## Contexto

O template Panini FIFA World Cup 2026 tinha 980 posicoes (introducao, 48
selecoes x 20 e 4 especiais). Foi pedido incluir as figurinhas do patrocinador
oficial Coca-Cola. Como o app esta em producao com 6 usuarios reais que ja
importaram a Copa, as novas figurinhas precisam aparecer tanto para novos albuns
(via template) quanto nos albuns ja existentes, sem alterar/perder nada do que
os usuarios ja colecionaram.

## Decisao

- Adicionar uma secao "Coca-Cola" com 10 figurinhas (codigos COKE-01..COKE-10)
  ao template (`buildPaniniWorldCup2026Catalog`), elevando o total para 990.
- Fazer o backfill nos albuns existentes via migration idempotente que insere as
  figurinhas Coca-Cola em todo album que ja contem o catalogo da Copa,
  identificado pela presenca da figurinha `FWC-01`.
- Usar `INSERT ... ON CONFLICT (album_id, code) DO NOTHING` (a constraint unica
  ja existente `unique (album_id, code)`), tornando a operacao puramente aditiva
  e re-executavel.

## Motivacoes

- Identificar o album da Copa por conteudo (`FWC-01`) e mais robusto que por
  nome, pois o usuario pode ter renomeado o album.
- `ON CONFLICT DO NOTHING` evita duplicatas e permite rodar a migration quantas
  vezes for preciso, sem efeito colateral.
- As novas figurinhas entram com `quantity = 0` / `owned = false`: nenhum estado
  de colecao existente e tocado.

## Riscos conhecidos

- Albuns da Copa sem `FWC-01` (ex.: usuario apagou essa figurinha) nao recebem o
  backfill. Mitigacao: `FWC-01` faz parte do template e raramente e removida; se
  necessario, um criterio alternativo (secao 'Introdução') pode ser usado depois.
- O `total_stickers` dos albuns existentes continua 980 ate o dono ajustar; o
  app calcula progresso por `max(total_stickers, figurinhas cadastradas)`, entao
  as 10 novas ja contam no denominador. Aceitavel; nao alteramos `total_stickers`
  dos albuns dos usuarios para nao sobrescrever ajustes manuais.

## Consequencias

- **Positivas:** Coca-Cola disponivel para todos (novos e existentes); operacao
  segura, idempotente e reversivel na pratica (basta nao rodar).
- **Negativas:** mais uma secao no catalogo; o backfill depende de execucao
  manual no Supabase, como os demais migrations do projeto.

## ADRs relacionadas

- ADR-002
- ADR-003
