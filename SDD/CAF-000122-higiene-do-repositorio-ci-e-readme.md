# [CHORE] Higiene do repositório: arquivos pesados e temporários versionados, Node do CI e README

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Tirar do repositório o que não é código do produto, alinhar a versão do Node do CI e atualizar a documentação de entrada.
- **Problema e evidência:**
  - `assets/images_backup/` está versionado com 17 arquivos e **54 MB** (as imagens em uso, em `assets/images/`, somam 11 MB), e `vite.config.js` copia a pasta `assets` inteira para `dist/`, então o backup vai junto para o site publicado.
  - `supabase/.temp/` está versionado (9 arquivos, incluindo `pooler-url`, `project-ref` e `linked-project.json`): são arquivos de estado local da Supabase CLI.
  - Arquivos de rascunho na raiz: `scratch-hero.html`, `replace_hero.py`, `produtos_cafeteria.xls`, `produtos_cafeteria.csv`; e imagens com nome de exportação (`assets/images/Prancheta 1 cópia 2.png`/`.webp`).
  - `.github/workflows/deploy.yml` usa `node-version: 20` (fim de suporte em abril de 2026), enquanto o desenvolvimento local roda Node 24; não há campo `engines` em `package.json` nem `.nvmrc`.
  - `.github/workflows/contador_diario.yml` traz a URL e a chave anon do Supabase escritas duas vezes no YAML.
  - `README.md` é de 2026-08-19 e descreve só o site institucional; não menciona PDV, KDS, Totem, Admin, testes, migrations nem o fluxo de SDD.
- **Impacto de não fazer:** Clone e deploy lentos, 54 MB publicados sem uso, risco de quebra silenciosa do CI por versão de Node sem suporte, e quem chega ao projeto não sabe como rodar nem testar.
- **Para quem é destinado:** Desenvolvedor.
- **História de usuário:** Como desenvolvedor novo no projeto, quero clonar, ler o README e rodar os testes em 10 minutos, para começar a contribuir sem depender de explicação.
- **Como saberemos que deu certo:** `dist/` sem `images_backup`; 0 arquivos de `.temp` e de rascunho rastreados; CI na mesma versão LTS do `engines`; README cobre instalar, rodar, testar, migrar e o fluxo de SDD.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Remover `assets/images_backup/` do versionamento (guardar os originais fora do repositório) | P0 | CA01 |
| RF02 | Remover `supabase/.temp/` do versionamento e adicioná-lo ao `.gitignore` | P0 | CA02 |
| RF03 | Remover ou mover para `docs/`/`scripts/` os arquivos de rascunho da raiz; renomear as imagens "Prancheta 1 cópia 2" se ainda forem usadas, ou remover | P1 | CA03 |
| RF04 | `engines` em `package.json` + `.nvmrc` com a LTS atual; workflows usando `node-version-file` | P0 | CA04 |
| RF05 | URL e chave do Supabase do `contador_diario.yml` em `vars`/`secrets` do repositório | P1 | CA05 |
| RF06 | README reescrito: visão das telas, como rodar (`npm run dev`), testar (`npm test`, `npm run test:db`), aplicar migrations, publicar, e o fluxo SDD → aprovação → testes → `CONCLUIDAS` | P0 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma imagem em uso no site deixa de carregar | P0 | CA01, CA03 |
| RNF02 | Sem reescrita de histórico do Git (apenas remoção daqui para frente) | P0 | CA01 |

### Dependências técnicas

- `vite.config.js` (cópia de `assets`), `.gitignore`, workflows.
- O README aponta para o runner de migrations da CAF-000116 quando existir.

### Recursos necessários

- Local fora do repositório para guardar os originais das imagens.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o build, quando listo `dist/assets`, então não existe `images_backup` e todas as imagens referenciadas pelos `.html`, CSS e JS existem.
- [ ] **CA02:** Dado `git ls-files`, quando filtro por `supabase/.temp`, então o resultado é vazio e o caminho está no `.gitignore`.
- [ ] **CA03:** Dado `git ls-files` na raiz, quando procuro `scratch-hero.html`, `replace_hero.py` e `produtos_cafeteria.*`, então não estão na raiz.
- [ ] **CA04:** Dado o CI, quando o job roda, então usa a versão de Node definida em `.nvmrc`, igual à faixa de `engines`.
- [ ] **CA05:** Dado `contador_diario.yml`, quando leio o arquivo, então não há URL nem token escritos no YAML e a rotina continua retornando 2xx.
- [ ] **CA06:** Dado um clone limpo, quando sigo o README, então consigo subir o site local e rodar `npm test` sem outro material.

## O que a atividade não inclui

- Reescrever o histórico para reduzir o tamanho do `.git`: motivo: operação destrutiva que exige recriar clones; avaliar separadamente.
- Otimizar as imagens em uso: motivo: outra iniciativa (já tratada em parte pela CAF-000070).
- Trocar a chave anon: motivo: é pública por natureza.

### Considerado para o futuro (P2)

- Limpeza do histórico com `git filter-repo` em janela combinada.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Os originais de `images_backup` existem em outro lugar (Drive)? Só remover depois de confirmar | PO | Sim | |
| D02 | `produtos_cafeteria.xls/.csv` ainda são usados para importação ou podem sair? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Imagens referenciadas existem | unit (varre HTML/CSS/JS) | CA01, CA03 | Extrair caminhos de `assets/images` e checar no disco | Todos existem |
| CT02 | Build sem backup | integração (pós-build) | CA01 | Listar `dist/assets` | Sem `images_backup` |
| CT03 | Arquivos proibidos fora do Git | unit (`git ls-files`) | CA02, CA03 | Filtrar caminhos | Vazio |
| CT04 | Versão do Node única | unit | CA04 | Comparar `.nvmrc`, `engines` e workflows | Coerentes |
| CT05 | Workflow sem segredo literal | unit | CA05 | Procurar `eyJ` e host do projeto no YAML | Não encontrado |
| CT06 | README executável | manual | CA06 | Seguir o passo a passo em clone limpo | Site e testes rodam |

## URL Complementar

- Documentação técnica: `.gitignore`, `vite.config.js`, `.github/workflows/`
- Protótipo / mockup: —
- Discussões relacionadas: —
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
