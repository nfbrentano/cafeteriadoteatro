# [FEAT] CAF-000065 — Busca Inteligente Tolerante a Acentos, Erros de Digitação e Códigos Curtos

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Evoluir o mecanismo de busca de produtos no PDV (`pedidos.html`), no Cardápio Digital (`cardapio.html`) e no Totem (`totem.html`) para suportar: (1) busca multi-palavras fora de ordem (ex.: `"pao queijo"` encontra `"Pão de Queijo"`), (2) tolerância a letras duplicadas/omitidas ou erros comuns de digitação (ex.: `"capucino"` ou `"cappucino"` encontra `"Cappuccino"`, `"expreso"` encontra `"Espresso"`), e (3) busca por código curto/sigla das iniciais do produto (ex.: `"pdq"` encontra `"Pão de Queijo"`).
- **Problema e evidência:** Conforme apontado no item `B4` de `ANALISE_PEDIDOS_MOBILE.md`, hoje a busca usa `.includes()` simples em substring contínua. Se o barista ou cliente digitar `"capucino"` (com um `p`), `"expreso"` (com `x` e um `s`) ou `"pao queijo"` (sem o `"de"`), a busca retorna zero resultados.
- **Impacto de não fazer:** O barista em atendimento rápido ou o cliente no autoatendimento acha que o produto não existe ou perde segundos preciosos apagando e procurando manualmente pelas categorias.
- **Para quem é destinado:** Baristas/garçons (`pedidos.html`) e clientes (`cardapio.html` e `totem.html`).
- **História de usuário:** Como barista ou cliente pesquisando um item no cardápio pelo celular, quero encontrar o produto mesmo se eu digitar sem conectivos, com grafia fonética (`"capucino"`) ou pelas iniciais (`"pdq"`), para lançar o pedido imediatamente sem precisar navegar por todas as categorias.
- **Como saberemos que deu certo:** Consultas como `"capucino"`, `"expreso"`, `"pao queijo"`, `"croassant"` e `"pdq"` retornam os respectivos produtos em `< 16ms` (1 frame) na listagem.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar utilitário compartilhado `js/utils/smart-search.js` com normalização fonética/ortográfica pt-BR (remoção de acentos, colapso de consoantes duplas `pp -> p`, `cc -> c`, `ss -> s`, equivalência `x/s` em `expresso/espresso`, `ch/x`, etc.) | P0 | CA01 |
| RF02 | Suportar busca por múltiplos tokens independentes da ordem ou de preposições intermediárias (ex.: `"cafe leite"` ou `"pao queijo"` exige que todos os tokens façam match no nome/descrição/categoria do produto) | P0 | CA02 |
| RF03 | Suportar correspondência por sigla de iniciais do nome do produto (ignorando preposições `de`, `da`, `do`, `com`, `e` — ex.: `"pdq"` para `"Pão de Queijo"`, `"cq"` para `"Chocolate Quente"`) e tolerância a distância de edição (Levenshtein `<= 1` para tokens com 5+ caracteres) | P1 | CA03, CA04 |
| RF04 | Integrar o `smart-search.js` em `js/pedidos.js`, `js/cardapio.js` e `js/totem.js`, ordenando os resultados por relevância (match exato/prefixo primeiro, depois tokens/sigla, depois aproximação fuzzy) | P0 | CA01, CA02, CA03, CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A filtragem de até 200 produtos em memória deve executar em `< 10ms` em dispositivos móveis intermediários, sem travar a digitação | P0 | CA01 |
| RNF02 | Zero dependências externas pesadas (implementação pura em ES Modules leve `< 3KB`) | P0 | CA01 |

### Dependências técnicas

- Listagens de produtos em `js/pedidos.js`, `js/cardapio.js` e `js/totem.js`.

### Recursos necessários

- Nenhum recurso externo ou alteração de banco de dados.

## Critérios de Aceitação / Entregas

- [x] **CA01:**** Dado que o usuário digita `"capucino"`, `"cappucino"` ou `"expreso"` na busca do PDV (`pedidos.html`), Cardápio (`cardapio.html`) ou Totem (`totem.html`), quando a lista filtrar, então os produtos `"Cappuccino"` / `"Espresso"` devem ser exibidos normalmente.
- [x] **CA02:**** Dado que o usuário digita `"pao queijo"` (sem a preposição `"de"`) ou `"suco laranja"`, quando a lista filtrar, então `"Pão de Queijo"` e `"Suco de Laranja"` devem aparecer nos resultados.
- [x] **CA03:**** Dado que o barista digita a sigla `"pdq"` na busca do PDV, quando a lista filtrar, então `"Pão de Queijo"` deve ser retornado.
- [x] **CA04:**** Dado que o usuário digita uma palavra de 5 ou mais letras com 1 erro de digitação (ex.: `"croisant"` ou `"browni"`), quando a lista filtrar, então o produto correspondente deve ser encontrado.
- [x] **CA05:**** Dado que o usuário digita um termo completamente inexistente (ex.: `"hamburguer sushi"`), quando a lista filtrar, então nenhum falso-positivo deve ser retornado e o estado vazio padrão deve ser exibido.

## O que a atividade não inclui

- Busca semântica por IA generativa / embeddings: motivo: desnecessário para um catálogo de cafeteria (~50 a 150 itens), onde busca determinística + fonética/fuzzy em memória é instantânea e funciona offline.

### Considerado para o futuro (P2)

- Campo opcional `atalho_pdv` / `codigo_rapido` editável no cadastro do produto no Admin.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Busca fonética / consoantes duplas | Unit / Manual | CA01 | Buscar `"capucino"` e `"expreso"` | Encontra `"Cappuccino"` e `"Espresso"` |
| CT02 | Busca multi-token sem preposição | Unit / Manual | CA02 | Buscar `"pao queijo"` | Encontra `"Pão de Queijo"` |
| CT03 | Busca por iniciais | Unit / Manual | CA03 | Buscar `"pdq"` | Encontra `"Pão de Queijo"` |
| CT04 | Busca com 1 erro de digitação e termo inexistente | Unit / Manual | CA04, CA05 | Buscar `"croisant"` e depois `"xyz123"` | `"croisant"` encontra `"Croissant"`; `"xyz123"` retorna lista vazia |

## URL Complementar

- Documentação técnica: Item `B4` em `SDD/CONCLUIDAS/ANALISE_PEDIDOS_MOBILE.md`
