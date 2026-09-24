# CAF-000029 — [Cozinha] [PDV] Prioridade de pedido e operação do KDS por teclado (bump bar)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + PDV + banco | 🟢 Baixa | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Permitir que o barista marque um pedido como **prioritário** (ex.: cliente com hora marcada para o espetáculo, reclamação, refazer) e que a cozinha também possa priorizar um pedido da fila.
  2. Permitir operar o KDS por **teclado numérico ou bump bar**, sem tocar na tela com as mãos sujas.
- **Por que é necessário:** a fila do KDS é estritamente cronológica (`order('created_at')`, `js/cozinha.js:303`) e não há como furar a fila de forma visível. O público do teatro tem horário rígido (o espetáculo começa na hora), e isso hoje é combinado de boca. O KDS também exige toque em botões pequenos, o que é ruim com mãos molhadas ou engorduradas.
- **Qual valor será agregado:** atendimento que respeita o horário do espetáculo, menos pedidos refeitos por esquecimento e uma operação mais higiênica e rápida.
- **Para quem é destinado:** baristas, cozinha e bar.

### Referência de mercado

- **Padrão de mercado em KDS:** pedidos "VIP" ou "urgentes" no topo com cor própria, e suporte a **bump bar** (teclado físico de 10 teclas) para selecionar e avançar pedidos.
- **SAIPOS:** a tela KDS funciona em monitores touch ou em TVs comuns. Em TVs sem toque, a navegação depende de dispositivo externo.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Coluna `pedidos.prioridade SMALLINT NOT NULL DEFAULT 0` (0 = normal, 1 = prioritário) e `pedidos.prioridade_motivo TEXT`.
- [ ] PDV: opção "⚡ Prioritário" no carrinho (com motivo rápido: "Espetáculo", "Refazer", "Outro") e no card do pedido já enviado.
- [ ] KDS: pedidos prioritários ficam no topo da coluna, com borda e selo "⚡ PRIORIDADE". A cozinha pode ligar e desligar a prioridade pelo card.
- [ ] Mudanças de prioridade registradas no log ([CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md)).
- [ ] Atalhos no KDS:
  - `←`/`→` trocam a coluna e `↑`/`↓` o card selecionado (com foco visível).
  - `Enter` avança o status do card ("Iniciar" → "Pronto").
  - `Backspace` desfaz a última ação (com toast de 5 s).
  - `P` reimprime e `C` chama por voz.
  - `1`–`9` selecionam o card N da coluna atual.
- [ ] Legenda dos atalhos acessível pela tecla `?`.

### Requisitos não funcionais
- [ ] **Acessibilidade:** os cards viram elementos focáveis (`tabindex`, `role="button"`), com foco bem visível no tema escuro do KDS.
- [ ] Os atalhos não disparam enquanto um campo de texto estiver focado (login).

### Dependências técnicas
- RPC `criar_pedido` (aceitar `prioridade` no payload) e `js/pedidos.js` (carrinho).
- Complementa o semáforo da [CAF-000025](CAF-000025-tempo-alvo-de-preparo-e-semaforo.md): na ordenação, prioridade vem antes do tempo restante.

### Recursos necessários
- Um teclado numérico USB ou Bluetooth para teste (bump bar opcional).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o barista marca um pedido como prioritário, **quando** ele chega ao KDS, **então** aparece no topo de "Pendentes" com o selo ⚡, mesmo sendo o mais recente.
- [ ] **Dado que** a cozinha remove a prioridade, **quando** o board atualiza, **então** o pedido volta à ordem normal e o evento fica no log.
- [ ] **Dado que** um card está selecionado pelo teclado, **quando** a cozinha pressiona `Enter` duas vezes, **então** o pedido vai de "Pendente" a "Pronto".
- [ ] **Dado que** foi pressionado `Backspace` logo após concluir, **quando** a ação acontece, **então** o pedido volta para "Em preparo".

---

## O que a atividade não inclui

- Agendamento de pedidos para um horário futuro ("preparar às 20h40").
- Priorização automática por tempo de espera (coberta pelo semáforo da CAF-000025).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Prioridade no PDV | Lançar pedido ⚡ | Topo da fila no KDS |
| 2 | Remover na cozinha | Desligar ⚡ no card | Volta à ordem + log |
| 3 | Navegação | Setas pelo board | Foco visível move |
| 4 | Avançar | `Enter` 2× | Pendente → Pronto |
| 5 | Desfazer | `Backspace` | Estado anterior |
| 6 | Atalho em input | Digitar no login | Nenhuma ação disparada |
| 7 | Legenda | Pressionar `?` | Lista de atalhos |

---

## URL Complementar

- Código: `js/cozinha.js:288-336` (busca e ordenação), `js/cozinha.js:459-494` (botões do card), `js/pedidos.js:1500-1690` (carrinho e envio)
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
