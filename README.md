# Cafeteria do Teatro

Aplicação web e sistema operacional completo da **Cafeteria do Teatro** (Teatro da Univates — Lajeado/RS), reunindo site institucional, cardápio digital com pedido via QR Code, totem de autoatendimento, PDV, KDS (cozinha/bar), painel de retirada, avaliação e painel administrativo.

---

## Telas da Aplicação

| Tela | Arquivo | Finalidade |
|---|---|---|
| **Site Institucional** | `index.html` | Apresentação, horários dinâmicos, galeria e localização (`js/main.js`, `js/home-dynamic.js`) |
| **Cardápio & Pedido do Cliente** | `cardapio.html` | Cardápio digital, adicionais, combos e pedido online/mesa via QR Code (`js/cardapio-dynamic.js`, `js/cardapio-cliente-pedido.js`) |
| **Totem de Autoatendimento** | `totem.html` | Fluxo de pedido no balcão/totem com impressão e Pix (`js/totem.js`) |
| **PDV (Barista / Caixa)** | `pedidos.html` | Lançamento de pedidos, mesas, fechamento completo/parcial, cashback, cupons e fila offline (`js/pedidos.js`, `js/pdv/*.js`) |
| **KDS (Cozinha e Bar)** | `cozinha.html` | Fila de preparo por estação, semáforo de SLA e alerta sonoro (`js/cozinha.js`) |
| **Painel de Retirada** | `retirada.html` | Acompanhamento de pedidos prontos por senha (`js/retirada.js`) |
| **Avaliação Pós-Consumo** | `avaliar.html` | Formulário de satisfação vinculado ao pedido (`js/avaliar.js`) |
| **Painel Administrativo** | `admin.html` | Produtos, estoque/PEPS, caixa, DRE, finanças, clientes, promoções, relatórios, saúde e configurações (`admin/partials/*.html`, `js/admin/*.js`) |
| **Página 404** | `404.html` | Fallback para rotas inexistentes (`js/404-init.js`) |

---

## Pré-requisitos e Instalação Rápida

- **Node.js `24.x`** (fixado em `.nvmrc` e em `engines.node` no `package.json`)
- **npm** (incluído no Node.js)

```bash
# 1. Clonar o repositório
git clone <url-do-repositorio>
cd cafeteriadoteatro

# 2. Alinhar a versão do Node (opcional se já estiver em 24.x)
nvm use

# 3. Instalar dependências
npm ci

# 4. Subir servidor local de desenvolvimento (Vite em http://localhost:3000)
npm run dev
```

Para executar o build de produção e pré-visualizar o conteúdo gerado em `dist/`:

```bash
npm run build
npm run preview
```

---

## Estrutura do Repositório

```text
/
├── admin/partials/          # Parciais HTML das abas e modais do admin.html (expandidos no build)
├── assets/
│   ├── audio/               # Alertas sonoros do KDS/PDV
│   ├── icons/               # Favicons e ícones PWA
│   └── images/              # Imagens otimizadas em uso no site
├── css/                     # Folhas de estilo por tela e componentes
├── e2e/                     # Suíte Playwright em navegador real (E2E)
├── js/
│   ├── admin/               # Módulos do painel administrativo
│   ├── pdv/                 # Módulos ES do PDV (estado, catálogo, carrinho, mesas, fechamento, offline, realtime, impressão)
│   ├── utils/               # Funções puras e utilitários compartilhados
│   ├── db.js                # Camada de acesso ao Supabase
│   ├── supabase-client.js   # Cliente e override controlado para E2E
│   └── ...                  # Scripts de entrada das demais telas
├── scripts/                 # Automação (parciais HTML, SW precache, runner de migrations, backup, E2E server/db, cobertura)
├── SDD/                     # Especificações SDD ativas, INDICE.md, PLANO_EVOLUCAO.md e CONCLUIDAS/
├── supabase/
│   ├── migrations.manifest.json # Ordem canônica das migrations ativas
│   ├── migration_*.sql      # Migrations SQL versionadas
│   ├── rollback/            # Scripts de reversão
│   ├── e2e/                 # Bootstrap e seed mínimo isolado para E2E
│   └── tests/               # Testes SQL em pgTAP
├── tests/                   # Suíte Vitest (Happy DOM, módulos reais e contratos)
├── .nvmrc                   # Versão oficial do Node.js para dev e CI
├── vite.config.js           # Build multi-página, parciais HTML, cópia estática e SW precache
└── vitest.config.js         # Configuração e pisos de cobertura V8
```

---

## Testes e Qualidade

| Comando | O que executa |
|---|---|
| `npm test` | Suíte Vitest (`tests/*.test.js`) com código real em Happy DOM e contratos |
| `npm run test:watch` | Execução contínua em modo watch durante desenvolvimento |
| `npm run test:coverage` | Suíte Vitest com coleta de cobertura V8 e verificação dos pisos em `vitest.config.js` |
| `node scripts/coverage-summary-md.mjs` | Resumo em Markdown da cobertura por escopo (`js/utils/`, `js/pdv/`, `js/admin/`, `js/*.js`) |
| `npm run lint` | Análise estática ESLint em `js/` |
| `npm run lint:e2e` | Análise estática ESLint em `e2e/`, `playwright.config.js` e `scripts/e2e-*.mjs` |
| `npm run test:db` | Testes SQL pgTAP em `supabase/tests/*.test.sql` (requer `TEST_DATABASE_URL` ou Postgres local) |
| `npm run test:e2e` | Testes E2E em navegador real (Playwright) contra banco local isolado via PGlite (`scripts/e2e-server.mjs`) |

> **Nota para `npm run test:db`:** no CI é utilizado `postgres:17-alpine` com `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`. Para instalar o navegador do Playwright na primeira execução local de E2E, rode `npx playwright install chromium`.

---

## Banco de Dados, Migrations e Backup

O repositório Git é a fonte única de verdade para o schema (tabelas, RPCs, triggers e policies RLS). A ordem oficial de aplicação fica registrada em `supabase/migrations.manifest.json`.

```bash
# Inspecionar status sem alterar o banco (requer DATABASE_URL)
npm run db:migrate -- --dry-run

# Aplicar migrations pendentes de forma transacional e validada por SHA-256
npm run db:migrate
```

- Documentação detalhada de migrations: `supabase/README.md`
- Guia de recuperação e restauração de backups: `supabase/RESTAURACAO.md`
- Rollbacks versionados: `supabase/rollback/`

---

## Build, CI/CD e Publicação

O Vite (`npm run build`) gera os artefatos otimizados em `dist/`, resolve parciais `<include>` (`scripts/html-partials.mjs`), copia apenas `assets/audio`, `assets/icons`, `assets/images`, `css`, `js` e metadados estáticos, e gera automaticamente o manifesto de precache versionado do Service Worker (`scripts/sw-precache-generator.js`). `npm run deploy` executa o mesmo build de produção (`vite build`).

Os workflows em `.github/workflows/` utilizam `.nvmrc` para selecionar o Node.js no CI:

- **`.github/workflows/deploy.yml`:** executa ESLint (`lint`, `lint:e2e`), cobertura (`test:coverage`), pgTAP (`test:db`), Playwright (`test:e2e`), `npm run build` e publica `dist/` no GitHub Pages em pushes na `main`.
- **`.github/workflows/backup-diario.yml`:** rotina diária (`scripts/backup-db.mjs`) usando `secrets.SUPABASE_DB_URL`, `secrets.GDRIVE_SERVICE_ACCOUNT_KEY` e `secrets.GDRIVE_FOLDER_ID`.
- **`.github/workflows/contador_diario.yml`:** consolidação diária de acessos no Supabase utilizando `vars.SUPABASE_URL` / `secrets.SUPABASE_URL` e `secrets.SUPABASE_ANON_KEY`.

---

## Fluxo de Trabalho (SDD)

Toda alteração estrutural ou nova feature segue o fluxo SDD definido em `GEMINI.md`:

1. **Especificação:** criar `SDD/CAF-NNNNNN-<slug>.md` com base em `SDD/MODELO_ATIVIDADE.md`.
2. **Revisão e Aprovação:** apresentar a SDD e o plano antes de codificar.
3. **Implementação + Testes:** implementar a solução e adicionar testes funcionais automatizados em `tests/caf-NNNNNN-*.test.js` cobrindo o código real da aplicação.
4. **Validação:** garantir 100% de aprovação em `npm test` e `npm run build` (além de `npm run lint`, `npm run test:db` e `npm run test:e2e` quando aplicável).
5. **Conclusão:** marcar todos os Critérios de Aceitação com `[x]`, atualizar `SDD/INDICE.md` e mover a SDD para `SDD/CONCLUIDAS/`.
