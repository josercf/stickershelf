# ADR-003: Aba Mercado via RPCs SECURITY DEFINER em somente leitura

- **Data:** 2026-05-31
- **Status:** Aceito
- **Decisores:** Jose Romualdo

## Contexto

Os usuarios precisavam descobrir outros colecionadores do app e ver os albuns
deles para encontrar figurinhas repetidas disponiveis para troca. As policies de
RLS atuais (`can_read_album`) so permitem ler albuns onde o usuario e dono ou
membro convidado. Expor as coleções de terceiros via RLS exigiria afrouxar essas
policies, o que aumentaria o risco de vazamento e edicao indevida. O app esta em
producao com usuarios reais, entao a mudanca precisa ser estritamente aditiva e
nao pode expor dados pessoais (e-mail, telefone).

## Decisao

Adicionar tres funcoes RPC `SECURITY DEFINER` somente leitura
(`market_list_users`, `market_list_albums`, `market_list_stickers`) que agregam e
retornam dados de outros usuarios sem tocar nas policies de RLS das tabelas.
Nenhuma RPC retorna e-mail ou metadados pessoais; o identificador publico do
usuario sao os 8 primeiros caracteres do UUID, derivados no frontend.

## Motivacoes

- Habilitar a descoberta de trocas sem afrouxar a RLS de leitura/escrita.
- Garantir somente leitura: as RPCs apenas fazem `SELECT`, sem qualquer mutacao.
- Privacidade por design: o e-mail nunca sai do banco para o mercado.
- Manter o padrao do projeto (SQL aditivo/idempotente + ADR), conforme CLAUDE.md.

## Riscos conhecidos

- `SECURITY DEFINER` roda com privilegios do dono da funcao: mitigado por
  `set search_path = public`, por serem funcoes apenas de `SELECT` e por nao
  exporem colunas sensiveis (e-mail/telefone/notes ficam de fora ou nao sao PII).
- Prefixo de 8 chars do UUID pode colidir teoricamente entre usuarios: aceitavel
  para identificacao visual; a troca real acontece fora do app.
- Os contadores (`bigint`) chegam como numero no JSON; o frontend coage com
  `Number()` por seguranca.

## Consequencias

- **Positivas:** nova capacidade de descoberta/troca sem mexer em RLS existente;
  superficie de escrita inalterada; reversivel (basta nao chamar as RPCs).
- **Negativas:** mais funcoes SQL para manter; qualquer coluna nova sensivel em
  `albums`/`stickers` precisa ser revisada para nao vazar pelas RPCs do mercado.

## ADRs relacionadas

- ADR-001
- ADR-002
