# ADR-001 — Renovação de token no auth artesanal do Supabase

- **Data:** 2026-05-30
- **Status:** Aceito
- **Decisores:** José Romualdo

## Contexto

O StickerShelf não usa o cliente `supabase-js`. O auth é artesanal
(`frontend/src/services/collectionStore.ts`): o `access_token`/`refresh_token`
são lidos do hash da URL (magic link) ou de `grant_type=password`, persistidos
no `localStorage` e enviados manualmente como `Authorization: Bearer` em cada
chamada ao PostgREST.

Os JWTs do Supabase expiram (~1h por padrão). O código enviava o `access_token`
persistido **sem verificar expiração e sem renovar**, e o `refresh_token` era
guardado mas nunca utilizado. Ao retornar à home com um token expirado, o
PostgREST respondia `PGRST303 "JWT expired"`, derrubando o carregamento de
álbuns e deixando o usuário preso numa tela quebrada.

## Decisão

Implementar renovação de token (refresh) com defense-in-depth no
`collectionStore`, mantendo o auth artesanal (sem adotar `supabase-js` agora).

## Motivações

- Correção pontual e de baixo risco, sem reescrever o fluxo de auth.
- `supabase-js` traria `autoRefreshToken`/`onAuthStateChange`, mas a migração é
  um esforço maior e fora do escopo do bug.

## Mecanismo

1. **Refresh proativo:** antes de cada requisição, `ensureFreshSession()` checa
   `expires_at` (com janela de skew de 60s) e renova via
   `POST /auth/v1/token?grant_type=refresh_token` se necessário.
2. **Refresh reativo:** se o PostgREST devolver `PGRST303`/401, renova uma vez e
   repete a requisição (retry único).
3. **Forced re-login:** se o `refresh_token` for inválido, limpa a sessão e
   dispara `onSessionExpired`; o `HomePage` reseta o estado e volta ao login.
4. **Dedup:** um único refresh em voo é compartilhado por requisições paralelas.
5. **Resiliência a rede:** erro de rede no refresh não derruba a sessão (evita
   logout falso em quedas transitórias) — propaga o erro original.

## Riscos conhecidos

- **Token revogado server-side** ainda gera uma falha antes do forced-logout —
  mitigado pelo caminho reativo que limpa a sessão.
- **Relógio do cliente errado** pode disparar refresh cedo/tarde — mitigado pela
  janela de skew e pelo fallback reativo.

## Consequências

- **Positivas:** elimina o PGRST303 na home; sessão sobrevive à expiração do
  access_token; UX de re-login limpa. Coberto por testes Jest.
- **Negativas:** lógica de auth manual cresce em complexidade — reforça que uma
  futura migração para `supabase-js` deve ser considerada.

## ADRs relacionadas

- Futuro: avaliar migração para `supabase-js` (autoRefresh/onAuthStateChange).
