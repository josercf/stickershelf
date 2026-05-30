# StickerShelf

Aplicativo web para gerenciar albuns de figurinhas, controlar faltantes, repetidas, lista de desejos e progresso de cada album.

O frontend e estatico, feito em React + TypeScript, e pode ser hospedado no GitHub Pages. O backend usado pela aplicacao e o Supabase via REST API.

## Funcionalidades

- Cadastro de albuns com editora, temporada, capa e total de figurinhas.
- Cadastro de figurinhas por codigo, titulo, secao, quantidade e observacoes.
- Controle rapido de figurinhas que voce tem, faltantes, repetidas e desejadas.
- Busca por codigo, nome, secao ou observacao.
- Indicadores de completude, faltantes, repetidas e wishlist.
- Modo local de demonstracao quando o Supabase ainda nao esta configurado.

## Desenvolvimento

```bash
cd frontend
npm install
npm start
```

Build de producao:

```bash
cd frontend
npm run build
```

## Supabase

1. Crie um projeto no Supabase.
2. Execute o SQL em `supabase/schema.sql` no SQL Editor do projeto.
3. Copie `frontend/.env.example` para `frontend/.env.local`.
4. Preencha:

```bash
REACT_APP_SUPABASE_URL=https://your-project-ref.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

O schema atual usa politicas publicas de leitura e escrita para simplificar o primeiro prototipo hospedado no GitHub Pages. Para uso real com dados privados, o proximo passo e adicionar autenticacao Supabase e restringir as policies por usuario.

## GitHub Pages

O workflow `.github/workflows/deploy-frontend.yml` publica `frontend/build` no GitHub Pages a cada push na branch `main`.

Configure estes secrets no repositorio:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

No GitHub, habilite Pages com source `GitHub Actions`.
