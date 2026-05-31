# ADR-004: Figurinhas Coca-Cola no template da Copa e backfill nos albuns existentes

- **Data:** 2026-05-31
- **Status:** Aceito
- **Decisores:** Jose Romualdo

## Contexto

O template FIFA World Cup 2026 tem 980 posicoes base: 1 (logo Panini) + 19
(features FWC) + 48 selecoes x 20 figurinhas = 980. Foi pedido incluir as
figurinhas do patrocinador oficial Coca-Cola, com codigos CC1..CC14 (14
figurinhas) numa nova secao "Coca-Cola". Como o app esta em producao com 6
usuarios reais que ja importaram a Copa, as novas figurinhas precisam aparecer
tanto para novos albuns (via template) quanto nos albuns ja existentes, sem
alterar nem perder nada do que os usuarios ja colecionaram.

## Decisao

- Adicionar a secao "Coca-Cola" com 14 figurinhas (codigos CC1..CC14, titulos
  "Coca-Cola 1".."Coca-Cola 14") ao template (`buildPaniniWorldCup2026Catalog`),
  elevando o total para 994.
- Backfill nos albuns existentes via migration idempotente que insere as
  figurinhas Coca-Cola em todo album que ja contem o catalogo da Copa,
  identificado pela presenca da figurinha de codigo `FWC 1`.
- Usar `INSERT ... ON CONFLICT (album_id, code) DO NOTHING` (a constraint unica
  ja existente `unique (album_id, code)`), tornando o insert puramente aditivo
  e re-executavel.
- Ajustar `total_stickers` dos albuns da Copa com
  `greatest(total_stickers, contagem real de figurinhas)`. E idempotente (rodar
  de novo nao soma duas vezes) e nunca diminui um total ajustado manualmente
  para cima pelo dono.

## Motivacoes

- Identificar o album da Copa por conteudo (`FWC 1`) e mais robusto que por
  nome, pois o usuario pode ter renomeado o album.
- `ON CONFLICT DO NOTHING` evita duplicatas e permite rodar a migration quantas
  vezes for preciso, sem efeito colateral.
- As novas figurinhas entram com `quantity = 0` e `owned = false`: nenhum estado
  de colecao existente e tocado.
- Atualizar `total_stickers` via `greatest(...)` atende ao pedido de refletir as
  14 novas posicoes mantendo a idempotencia exigida em producao.

## Riscos conhecidos

- Albuns da Copa sem `FWC 1` (ex.: usuario apagou essa figurinha) nao recebem o
  backfill. Mitigacao: `FWC 1` faz parte do template e raramente e removida; se
  necessario, um criterio alternativo ('PANINI 1' ou secao 'Intro') pode ser
  usado depois.
- O `update` de `total_stickers` usa a contagem real, entao se um album tiver
  figurinhas extras alem do template, o total refletira essa realidade (>994).
  Aceitavel e correto.

## Consequencias

- **Positivas:** Coca-Cola disponivel para todos (novos e existentes); operacao
  segura, idempotente e re-executavel; total_stickers coerente com o conteudo.
- **Negativas:** mais uma secao no catalogo; o backfill depende de execucao
  manual no Supabase, como os demais migrations do projeto.

## ADRs relacionadas

- ADR-002
- ADR-003
