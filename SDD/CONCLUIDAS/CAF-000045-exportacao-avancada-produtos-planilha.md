# [FEAT] Exportação Completa de Produtos para Planilha (Excel e CSV)

> **Status:** Concluída  
> **Autor:** Antigravity · **Revisor:** Natanael Brentano · **Criada em:** 2026-09-28 · **Atualizada em:** 2026-09-28

## Detalhes da Atividade

- **O que precisa ser feito:**  
  Aprimorar a funcionalidade de exportação de produtos no Painel de Administração (`admin.html`), permitindo ao administrador exportar a relação completa de produtos cadastrados no banco de dados para planilha nos formatos **Excel (.xls formatado)** e **CSV (UTF-8 com BOM e separador `;`)**, contemplando todos os atributos operacionais (ID, Categoria, Nome, Preço R$, Preço Numérico, Disponível, Ativo, Tipo de Montagem, Permite Adicionais, Badges/Destaques, Descrição, URL da Imagem e Ordem), com suporte aos filtros aplicados na tela (categoria, status e busca) ou opção de exportar o catálogo completo.

- **Problema e evidência:**  
  Atualmente, o botão "Exportar CSV" presente na aba de Produtos exporta apenas um conjunto restrito de colunas (ID, Nome, Categoria, Preço, Ativo, Disponível e Descrição), omitindo dados essenciais para gestão como montagem, adicionais permitidos, badges, imagens e ordenação. Além disso, não oferece arquivo pré-formatado para Excel com colunas estilizadas, moedas configuradas e compatibilidade garantida sem necessidade de assistente de importação de texto.

- **Impacto de não fazer:**  
  Dificuldade na conferência de preços, análise de cardápio e integração com planilhas externas de estoque/precificação; retrabalho manual para formatar e importar colunas no Excel.

- **Para quem é destinado:**  
  Administradores, gestores e operadores da Cafeteria do Teatro com acesso ao painel gerencial.

- **História de usuário:**  
  *Como* gestor da cafeteria,  
  *quero* exportar a lista completa de produtos cadastrados para planilha em formato Excel (.xls) ou CSV,  
  *para* que eu possa auditar itens, revisar preços, conferir montagens/adicionais e compartilhar relatórios operacionais com facilidade.

- **Como saberemos que deu certo:**  
  Exportação executada em até 2 cliques; planilha gerada em menos de 1 segundo contendo 100% dos produtos esperados; caracteres com acentuação perfeitamente renderizados no Microsoft Excel, Google Planilhas e Apple Numbers; coluna de valores formatada corretamente em moeda brasileira.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Disponibilizar opções de exportação para **Excel (.xls estilizado)** e **CSV (UTF-8 com BOM)** na interface da aba de Produtos. | P0 | CA01 |
| RF02 | Incluir na exportação todas as colunas relevantes: ID, Categoria, Nome, Preço (R$), Preço Numérico, Disponível, Ativo, Tipo de Montagem, Permite Adicionais, Badges, Descrição, URL da Imagem e Ordem. | P0 | CA02 |
| RF03 | Respeitar os filtros atuais da tabela (categoria, status ativo/inativo, termo de busca) ou permitir exportar a listagem completa. | P0 | CA03 |
| RF04 | Formatar o arquivo Excel (.xls / SpreadsheetML) com cabeçalho temático em destaque, largura de colunas autoajustada e máscara monetária nos preços. | P1 | CA04 |
| RF05 | Garantir codificação UTF-8 com BOM no arquivo CSV e separador ponto e vírgula (`;`), abrindo diretamente no Excel sem quebras ou caracteres corrompidos. | P0 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Desempenho: O download do arquivo deve iniciar imediatamente após o clique (< 800ms para até 500 produtos) sem congelar a interface. | P0 | CA01, CA04 |
| RNF02 | Usabilidade: Interface intuitiva com botão/menu dropdown simples para escolha entre Excel ou CSV, mantendo o padrão visual e acessibilidade do painel. | P0 | CA01 |
| RNF03 | Compatibilidade: Arquivos compatíveis com Microsoft Excel (Windows/Mac), Google Planilhas, Apple Numbers e LibreOffice Calc. | P0 | CA04, CA05 |

### Dependências técnicas

- Arquivo `admin.html` (estrutura da barra de ferramentas da tabela de produtos).
- Arquivo `js/admin/products.js` (lógica de filtragem e manipulação de eventos de produtos).
- Arquivo `js/admin/main.js` (funções utilitárias de download do admin).
- Dados de `admin.appData.produtos` e `admin.appData.categorias` já carregados na memória do painel.

### Recursos necessários

- Acesso ao código-fonte do frontend do painel administrativo.
- Navegador para validação visual e teste de abertura de planilhas.

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o usuário está no Painel de Administração na aba "Produtos", quando clicar na opção de exportar (seja Excel ou CSV), então o arquivo deve ser baixado instantaneamente pelo navegador com nomenclatura padronizada contendo a data (`produtos_YYYY-MM-DD.xls` ou `.csv`).
- [x] **CA02:** Dado que o arquivo de planilha foi gerado, quando aberto no Excel/Google Planilhas, então deve conter todas as 13 colunas especificadas (ID, Categoria, Nome, Preço, Preço Numérico, Disponível, Ativo, Montagem, Adicionais, Badges, Descrição, Imagem, Ordem).
- [x] **CA03:** Dado que filtros estão aplicados na tela (ex.: filtro de categoria "Cafés Quentes" e status "Ativo"), quando o usuário solicitar exportar, então o relatório deve refletir exatamente os produtos filtrados (ou exibir aviso caso nenhum item atenda ao filtro).
- [x] **CA04:** Dado que o formato Excel (.xls) é selecionado, quando o arquivo é aberto, então o cabeçalho deve apresentar estilo visual distinto e os valores de preço devem ser reconhecidos como números com formato de moeda `R$ #,##0.00`.
- [x] **CA05:** Dado que o formato CSV é selecionado, quando aberto no Excel ou bloco de notas, então acentos (como "Índia", "Café", "Pão") e cedilhas não devem sofrer corrupção de encoding (UTF-8 com BOM presente).

---

## O que a atividade não inclui

- **Importação de planilha:** Importar produtos de volta da planilha para o banco de dados (recurso complexo de sincronização bidirecional, tratado em atividade futura).
- **Exportação para PDF:** A exportação focará em formatos de planilha editável (Excel e CSV); o cardápio em PDF já possui visualizador dedicado.

### Considerado para o futuro (P2)

- Importação e atualização em massa de produtos via planilha Excel/CSV.
- Exportação automatizada agendada por e-mail para relatórios gerenciais periódicos.

---

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | O botão de exportação deve ser um botão duplo (ou dropdown com "Exportar Excel (.xls)" e "Exportar CSV") ou um botão principal que gera Excel com opção de CSV? | PO / Usuário | Não | Sugestão: Botão com menu suspenso ou botões lado a lado "⬇ Excel" e "⬇ CSV" no cabeçalho de produtos. |

---

## Sugestões de casos de teste

| # | Cenário | Tipo | Cobre | Passos | Resultado esperado |
|---|---------|------|-------|--------|--------------------|
| CT01 | Exportação de todos os produtos em Excel | Manual / E2E | CA01, CA02, CA04 | Sem filtros ativos, clicar em exportar Excel. Abrir arquivo baixado. | 148 produtos listados com 13 colunas completas, cabeçalho estilizado e moeda formatada. |
| CT02 | Exportação com filtros de categoria e busca | Manual / E2E | CA03 | Filtrar por "Cafés Quentes" e buscar "espresso". Clicar em exportar. | Apenas os itens correspondentes ao filtro devem constar na planilha exportada. |
| CT03 | Exportação em CSV e validação de acentos | Manual | CA05 | Clicar em exportar CSV. Abrir diretamente no Excel ou Google Sheets. | Caracteres como "Café", "Índia", "Pão" exibidos corretamente sem caracteres estranhos. |
| CT04 | Tentativa de exportação com filtro vazio | Manual | CA03 | Aplicar um termo de busca inexistente e clicar em exportar. | Toast informativo indicando que não há produtos para exportar com os filtros atuais, sem gerar arquivo corrompido. |

---

## URL Complementar

- Documentação técnica: [admin.html](file:///Users/natanaelfernandogattibrentano/cafeteriadoteatro/admin.html) e [products.js](file:///Users/natanaelfernandogattibrentano/cafeteriadoteatro/js/admin/products.js)
- Planilhas de referência geradas: [produtos_cafeteria.xls](file:///Users/natanaelfernandogattibrentano/cafeteriadoteatro/produtos_cafeteria.xls) e [produtos_cafeteria.csv](file:///Users/natanaelfernandogattibrentano/cafeteriadoteatro/produtos_cafeteria.csv)
