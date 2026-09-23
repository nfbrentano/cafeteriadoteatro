# CAF-000016 — [Admin] Exportar pedidos em CSV

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin | 🟢 Baixa | P | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** adicionar um botão "Exportar CSV" na lista de pedidos do admin, respeitando os filtros aplicados.
- **Por que é necessário:** hoje os dados só podem ser vistos na tela (`js/admin/pedidos-admin.js:93`). Para contabilidade ou análises em planilha, é preciso copiar à mão.
- **Qual valor será agregado:** dados prontos para planilha e contador, sem trabalho manual.
- **Para quem é destinado:** administração e contabilidade.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Botão "⬇ Exportar CSV" ao lado de "Atualizar" na aba Pedidos.
- [ ] Usa os filtros atuais (status, período, pagamento).
- [ ] Dois formatos: **por pedido** (nº, data/hora, mesa, status, pagamento, total) e **por item** (nº do pedido, produto, quantidade, preço, adicionais, desconto, cortesia, cancelado).
- [ ] Nome do arquivo: `pedidos_AAAA-MM-DD_a_AAAA-MM-DD.csv`.

### Requisitos não funcionais
- [ ] Separador `;` e vírgula decimal, compatível com Excel em português; codificação UTF‑8 com BOM.
- [ ] Datas no fuso `America/Sao_Paulo`.
- [ ] Campos com `;`, aspas ou quebra de linha corretamente escapados.
- [ ] Gerado no navegador (sem backend novo).

### Dependências técnicas
- Consulta atual de `loadPedidos` (`js/admin/pedidos-admin.js:93`), sem o limite de linhas da tela.

### Recursos necessários
- Nenhum.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o filtro é "últimos 7 dias" e "pago", **quando** o admin exporta, **então** o CSV traz só esses pedidos.
- [ ] **Dado que** o arquivo é aberto no Excel em português, **quando** é carregado, **então** as colunas e os acentos aparecem corretos.
- [ ] **Dado que** uma observação tem `;` e quebra de linha, **quando** é exportada, **então** continua numa única célula.

---

## O que a atividade não inclui

- Exportação em XLSX ou PDF.
- Envio automático por e‑mail.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Por pedido | Exportar hoje | 1 linha por pedido |
| 2 | Por item | Exportar por item | 1 linha por item |
| 3 | Filtros | Filtrar "cancelado" e exportar | Só cancelados |
| 4 | Excel | Abrir no Excel pt‑BR | Colunas e acentos corretos |
| 5 | Escape | Obs com `;` e aspas | Célula única |
| 6 | Vazio | Período sem pedidos | Aviso, sem arquivo vazio |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 16
- Código: `js/admin/pedidos-admin.js:93` (`loadPedidos`)
