# ADR-002 — Compartilhamento por link de uso único, rename restrito ao owner e label do álbum

- **Data:** 2026-05-30
- **Status:** Aceito
- **Decisores:** José Romualdo

## Contexto

Três necessidades de produto surgiram para os álbuns do StickerShelf:

1. **Compartilhar um álbum por link** sem precisar saber o e-mail/username do
   convidado antecipadamente, mas de forma controlada (não um link eterno que
   qualquer um reusa indefinidamente).
2. **Renomear o álbum**, restrito ao dono. A policy de UPDATE existente
   (`"Owners update albums"`) usava `can_edit_album(id)`, que também autoriza
   editores. Ou seja, qualquer editor podia renomear o álbum dos outros.
3. **Descrição/label do álbum**, editável pelo dono e exibida na home.

A estrutura `album_members` já suportava `invite_type='link'` com
`invite_token`, e a RPC `accept_album_invite` já preenchia `user_id` ao aceitar.
Faltava controle de expiração e de uso único.

## Decisão

- **Link de uso único:** adicionar `expires_at` e `used_at` em `album_members`.
  Ao gerar um link (`invite_type='link'`), o frontend grava `expires_at = now()
  + 48h`. A RPC `accept_album_invite` passa a só aceitar quando `used_at is
  null` **e** `expires_at > now()`, e marca `used_at = now()` no aceite,
  inutilizando o link após o primeiro uso.
- **Rename restrito ao owner:** trocar a policy de UPDATE de `albums` de
  `can_edit_album(id)` para `auth.uid() = owner_id` (USING e WITH CHECK).
  Editores continuam editando figurinhas (policies próprias da tabela
  `stickers`), mas não o álbum em si.
- **Label:** coluna `label varchar(200)` em `albums`, opcional. A RPC
  `create_album_for_current_user` ganhou o parâmetro `p_label` (com a assinatura
  antiga de 5 argumentos removida para evitar overload ambíguo no PostgREST).

## Motivações

- Reaproveita a estrutura de `album_members` em vez de criar uma tabela nova.
- A verificação de expiração e uso único fica no servidor (RPC SECURITY
  DEFINER), não confiando no cliente.
- Corrige uma falha real de autorização: editores conseguiam renomear álbuns.
- SQL idempotente (`add column if not exists`, `create or replace`,
  `drop policy if exists`), executável manualmente no Supabase quantas vezes
  for preciso, alinhado ao fluxo do projeto.

## Riscos conhecidos

- **Links antigos sem `expires_at`/`used_at`:** a RPC trata `expires_at is null`
  como "não expira" e `used_at is null` como "não usado", então links legados
  continuam funcionando até o primeiro uso. Mitigação: comportamento
  intencional e compatível; novos links sempre nascem com 48h.
- **Relógio do servidor:** a expiração depende de `now()` no Postgres, não do
  cliente. Mitigação: é a fonte de tempo correta para a regra.
- **PATCH direto de `albums` (rename/label):** depende da nova policy de UPDATE.
  Se o quirk de RLS do PostgREST observado no INSERT (ver ADR-001 / criação via
  RPC) reaparecer no UPDATE, será preciso migrar rename/label para RPC. Não
  observado nos testes atuais.

## Consequências

### Positivas
- Compartilhamento simples e seguro (expira e é de uso único).
- Autorização de rename corrigida.
- Descrição de álbum disponível ponta a ponta (schema, store, UI, create flow).

### Negativas
- Mais colunas e mais ramos condicionais na RPC de aceite.
- A lista de colaboradores agora precisa interpretar o estado do link
  (ativo/usado/expirado) na UI.

## ADRs relacionadas

- [ADR-001](ADR-001-refresh-token-auth-artesanal.md) — auth artesanal e o
  contexto da criação de álbum via RPC SECURITY DEFINER.
