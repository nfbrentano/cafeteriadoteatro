# CAF-000041 — [Admin] [Marketing] CRM: segmentação automática de clientes, tags e listas para campanha

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin + banco | 🟢 Baixa | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** sobre o cadastro de clientes da [CAF-000033](CAF-000033-cadastro-de-clientes.md):
  1. **Classificar automaticamente** cada cliente pelo comportamento de compra: Novo, Ativo, Fiel, Em risco e Perdido.
  2. Permitir **tags** livres (ex.: "VIP", "Funcionário Univates", "Assinante do teatro", "Vegano").
  3. Montar **listas de campanha** (segmento + tags + filtros) e disparar mensagens pelo WhatsApp de forma assistida (um link `wa.me` por cliente, com o texto pronto e o nome preenchido).
- **Por que é necessário:** com o cadastro, a cafeteria passa a ter dados, mas não sabe quem está deixando de vir nem para quem mandar uma novidade. O público do teatro é sazonal (temporadas de espetáculos), então saber quem sumiu e chamá-lo de volta tem valor direto.
- **Qual valor será agregado:** reativação de clientes que sumiram, comunicação segmentada (ex.: avisar só quem compra bolo que chegou um sabor novo) e visão da saúde da base.
- **Para quem é destinado:** administração.

### Referência de mercado

- **Suitable:** CRM que classifica os clientes automaticamente (novo, ativo, promissor, fiel, em risco, perdido), tags que alimentam automações, visão 360° do cliente, campanhas e gatilhos pelo WhatsApp.
- **Kyte:** "novos compradores" com contato direto pelo WhatsApp.
- **Jarbas:** relatório de análise de clientes.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] View `v_clientes_rfv` com, por cliente: data da última compra, nº de pedidos nos últimos 90 dias, total gasto nos últimos 90 dias e **segmento**:
  - **Novo:** 1ª compra há ≤ 30 dias.
  - **Fiel:** ≥ 4 pedidos em 90 dias e última compra há ≤ 30 dias.
  - **Ativo:** última compra há ≤ 30 dias (e não é fiel nem novo).
  - **Em risco:** última compra entre 31 e 90 dias.
  - **Perdido:** última compra há mais de 90 dias.
  Os limites ficam em `configuracoes` e podem ser ajustados.
- [ ] Tabelas `cliente_tags (id, nome, cor)` e `cliente_tag_vinculos (cliente_id, tag_id)`; aplicar ou remover tag na ficha e em lote na lista.
- [ ] Aba "Clientes" ([CAF-000033](CAF-000033-cadastro-de-clientes.md)): filtros por segmento, tag, produto já comprado e período; cartões com a quantidade por segmento e a variação em relação ao mês anterior.
- [ ] "Campanhas":
  - criar campanha com nome, filtro salvo e mensagem com variáveis (`{primeiro_nome}`, `{produto_favorito}`);
  - lista de destinatários **só com `aceita_contato = true`**;
  - botão "Enviar" por destinatário abre o `wa.me` com o texto pronto e marca como enviado (tabela `campanha_envios`);
  - opcional: cupom da campanha, ligado a uma promoção existente ([CAF-000017](CONCLUIDAS/CAF-000017-aba-promos-no-cardapio-publico.md)), para medir conversão.
- [ ] Relatório da campanha: enviados, clientes que compraram nos 7 dias seguintes e faturamento gerado.

### Requisitos não funcionais
- [ ] **LGPD:** só clientes com consentimento aparecem nas campanhas; link "não quero mais receber" registrado como `aceita_contato = false` pelo barista ou admin; exportação só para `admin`.
- [ ] **Desempenho:** view com índice em `pedidos(cliente_id, created_at)`; lista de 5 mil clientes em < 1 s.
- [ ] **Anti-spam:** limite de uma campanha por cliente a cada 7 dias (configurável).

### Dependências técnicas
- [CAF-000033](CAF-000033-cadastro-de-clientes.md) (clientes e `pedidos.cliente_id`).
- Promoções existentes para os cupons.

### Recursos necessários
- Definição com o cliente dos limites de cada segmento e do tom das mensagens.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a Ana não compra há 45 dias, **quando** o admin abre os clientes, **então** ela aparece como "Em risco".
- [ ] **Dado que** o admin cria a campanha "Sentimos sua falta" para "Em risco" + "aceita contato", **quando** clica em Enviar na linha da Ana, **então** o WhatsApp abre com "Oi Ana, …" e o envio fica registrado.
- [ ] **Dado que** um cliente não aceitou contato, **quando** a lista da campanha é montada, **então** ele não aparece.
- [ ] **Dado que** a Ana comprou 3 dias depois do envio, **quando** o admin abre o relatório da campanha, **então** ela conta como conversão.

---

## O que a atividade não inclui

- Envio automático em massa ou por gatilho (exige a API oficial do WhatsApp Business e um provedor pago).
- Robô de atendimento no WhatsApp.
- E-mail marketing e SMS.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Segmentos | Clientes com datas variadas | Cada um no segmento correto |
| 2 | Limites | Mudar o limite de "perdido" para 60 dias | Reclassificação imediata |
| 3 | Tags em lote | Aplicar tag em 10 clientes | Todos com a tag |
| 4 | Consentimento | Cliente sem consentimento | Fora da campanha |
| 5 | Variáveis | Mensagem com `{primeiro_nome}` | Nome preenchido |
| 6 | Anti-spam | 2ª campanha em 3 dias | Cliente fora da lista |
| 7 | Conversão | Compra após o envio | Contada no relatório |

---

## URL Complementar

- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Suitable — CRM: https://suitable.com.br/marketing/crm/ · gatilhos: https://suitable.com.br/marketing/gatilhos/
