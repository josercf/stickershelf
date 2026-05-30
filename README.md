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
- Importador inicial do catalogo Panini FIFA World Cup 2026 com 980 posicoes.

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

Use a URL raiz do projeto em `REACT_APP_SUPABASE_URL`, sem aspas e preferencialmente sem `/rest/v1`. O app tambem aceita a URL terminando em `/rest/v1`, mas nao use caminhos de tabela como `/rest/v1/albums`.

O schema atual usa politicas publicas de leitura e escrita para simplificar o primeiro prototipo hospedado no GitHub Pages. Para uso real com dados privados, o proximo passo e adicionar autenticacao Supabase e restringir as policies por usuario.

Para conectar o site publicado, configure os secrets do GitHub:

```bash
gh secret set REACT_APP_SUPABASE_URL --repo josercf/stickershelf
gh secret set REACT_APP_SUPABASE_ANON_KEY --repo josercf/stickershelf
```

Depois rode novamente o workflow de deploy.

## Catalogo Panini

O importador `Panini Copa 2026` usa informacoes publicas sobre a estrutura do album: 980 figurinhas, 1 `PANINI`, 19 `FWC` e 48 selecoes com 20 figurinhas por time. As figurinhas sao renderizadas como placeholders de album; o app nao copia imagens proprietarias da Panini.

Fontes consultadas:

- Panini: `https://www.paninigroup.com/en/wc26pack-contents`
- Scanini checklist: `https://scanini.app/albums/world-cup-2026`

## GitHub Pages

O workflow `.github/workflows/deploy-frontend.yml` publica `frontend/build` no GitHub Pages a cada push na branch `main`.

Configure estes secrets no repositorio:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

No GitHub, habilite Pages com source `GitHub Actions`.
