# StickerShelf

Aplicativo web para gerenciar albuns de figurinhas a partir de um catalogo-base, controlar faltantes, repetidas, lista de desejos e progresso de cada album.

O frontend e estatico, feito em React + TypeScript, e pode ser hospedado no GitHub Pages. O backend usado pela aplicacao e o Supabase via REST API.

## Funcionalidades

- Cadastro de albuns com editora, temporada, capa e total de figurinhas.
- Catalogo de figurinhas por album, com cadastro manual ou geracao de sequencia.
- Tela por times/secoes para marcar rapidamente cada figurinha.
- Leitor de camera para codigos de barras/QR via `BarcodeDetector`, com campo manual de fallback.
- Registro de figurinha lida com incremento automatico de quantidade (`+1`).
- Controle de figurinhas que voce tem, faltantes, coladas, repetidas e desejadas.
- Area de trocas baseada nas repetidas (`quantidade > 1`).
- Busca por codigo, titulo ou secao.
- Indicadores de completude, faltantes, repetidas e wishlist.
- Modo local de demonstracao quando o Supabase ainda nao esta configurado.

## Fluxo principal

1. Crie ou selecione um album.
2. Monte o catalogo do album na aba `Catalogo`.
3. Use a aba `Times` para abrir um time/secao e marcar se voce tem a figurinha, se ja colou e quantas repetidas existem.
4. Use a aba `Leitor` para abrir a camera ou digitar o codigo.
5. Quando a figurinha e encontrada no catalogo, a quantidade aumenta em 1.
6. Figurinhas com quantidade maior que 1 aparecem na aba `Trocas`.

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
