# CAF-000025 — [Cozinha] [Admin] Tempo alvo de preparo por categoria/produto e semáforo no KDS

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + admin + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** trocar o limite fixo de 15 minutos por um **tempo alvo** configurável por categoria (com exceção por produto), e mostrar um semáforo no card: verde no prazo, amarelo perto do limite e vermelho estourado.
- **Por que é necessário:** hoje o card só fica "atrasado" depois de 15 minutos, contados da **criação** do pedido (`js/cozinha.js:352-356`), para qualquer item. Um espresso com 10 minutos de espera já está muito atrasado e não recebe destaque, enquanto uma lasanha com 16 minutos fica vermelha sem estar atrasada. O cronômetro também só atualiza a cada 60 s (`js/cozinha.js:529-531`).
- **Qual valor será agregado:** a cozinha prioriza o que realmente está atrasado, e o admin passa a ter uma meta para comparar com o tempo médio de preparo que já é medido ([CAF-000014](CONCLUIDAS/CAF-000014-relatorios-no-admin.md)).
- **Para quem é destinado:** cozinha, bar e administração.

### Referência de mercado

- **SAIPOS:** o temporizador do KDS **pisca em laranja e em vermelho** quando o prazo de produção é estourado.
- **Padrão de mercado (Food Sistemas e outros):** "tempo ideal por categoria de prato", cores verde, amarelo e vermelho, e relatório de tempo médio **por item** para achar gargalos.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Colunas `categorias.tempo_alvo_min INT` e `produtos.tempo_alvo_min INT` (nulo = herda da categoria). Padrão global em `configuracoes` (ex.: 15 min).
- [ ] Campo "Tempo alvo (min)" nos formulários de categoria (`js/admin/categories.js`) e de produto (`js/admin/products.js`).
- [ ] O tempo alvo do pedido **na estação** é o maior tempo alvo entre os seus itens não cancelados daquela estação.
- [ ] Semáforo no card:
  - 🟢 abaixo de 70% do alvo.
  - 🟡 entre 70% e 100%.
  - 🔴 acima de 100%, com borda pulsando. O vermelho só pisca nos primeiros 2 minutos, para não cansar a vista.
- [ ] Cronômetro em `mm:ss`, atualizado a cada segundo **apenas no texto do tempo** (sem re-renderizar o board inteiro).
- [ ] Mostrar "⏱ 07:32 / 10 min" e, nas colunas "Pendentes" e "Em preparo", ordenar pelo tempo restante (quem estoura antes aparece primeiro).
- [ ] Alerta sonoro curto e opcional (configurável) quando um pedido fica vermelho.
- [ ] No relatório do admin, acrescentar "tempo médio de preparo × tempo alvo" por categoria, usando `pedido_itens.pronto_em - pedidos.created_at`.

### Requisitos não funcionais
- [ ] **Desempenho:** o timer de 1 s atualiza no máximo os elementos `.pedido-tempo` visíveis. Nada de `renderPedidos()` a cada segundo.
- [ ] **Relógio:** usar a diferença entre o relógio do dispositivo e o do servidor (calculada no login a partir da resposta do Supabase) para os tempos não ficarem negativos em tablets com hora errada.
- [ ] **Acessibilidade:** o estado não depende só da cor (ícone ou texto "ATRASADO").

### Dependências técnicas
- Medição de `iniciado_em` e `concluido_em` ([CAF-000014](CONCLUIDAS/CAF-000014-relatorios-no-admin.md), `supabase/migration_caf_000024_relatorios.sql`).
- Recomendado depois da [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) (tempo por estação).

### Recursos necessários
- Tempos alvo definidos pelo cliente para cada categoria (ex.: cafés 5 min, salgados 10 min, pratos 20 min).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a categoria "Cafés" tem alvo de 5 min, **quando** um espresso espera 4 min, **então** o card fica amarelo.
- [ ] **Dado que** o mesmo pedido passa de 5 min, **quando** o cronômetro vira, **então** o card fica vermelho com o texto "ATRASADO".
- [ ] **Dado que** um produto tem alvo próprio de 25 min numa categoria de 10 min, **quando** ele é pedido, **então** vale o alvo de 25 min.
- [ ] **Dado que** nenhum alvo foi configurado, **quando** o pedido chega, **então** vale o padrão global.
- [ ] **Dado que** há 30 pedidos abertos, **quando** o cronômetro atualiza a cada segundo, **então** o board não pisca nem perde a rolagem.

---

## O que a atividade não inclui

- Previsão de tempo para o cliente (ETA) ou exibição no painel de senhas.
- Redistribuição automática de pedidos entre estações.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Verde | Pedido novo com alvo de 10 min | Verde |
| 2 | Amarelo | Esperar 7,5 min | Amarelo |
| 3 | Vermelho | Esperar mais de 10 min | Vermelho + "ATRASADO" |
| 4 | Exceção por produto | Produto com alvo próprio | Usa o do produto |
| 5 | Maior alvo | Pedido com café (5) e prato (20) na mesma estação | Alvo de 20 |
| 6 | Ordenação | 3 pedidos com alvos diferentes | Ordenados pelo tempo restante |
| 7 | Relógio errado | Tablet 5 min adiantado | Tempos corretos |
| 8 | Admin | Editar o alvo da categoria | KDS reflete após recarregar |
| 9 | Relatório | Período com pedidos | Média × alvo por categoria |

---

## URL Complementar

- Código: `js/cozinha.js:352-361` (tempo e atraso), `js/cozinha.js:529-531` (intervalo de 60 s), `js/admin/categories.js`, `js/admin/products.js`, `js/admin/relatorios-admin.js`
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- SAIPOS — Tela KDS (temporizador laranja e vermelho): https://meajuda.saipos.com/hc/pt-br/articles/20211492079252-Tela-KDS-Sistema-de-Display-para-Cozinha
- Food Sistemas — KDS: https://foodsistemas.com.br/funcionalidades/kds/
