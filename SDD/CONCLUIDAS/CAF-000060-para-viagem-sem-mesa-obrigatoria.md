# [FEAT] Seleção Automática de "Sem Mesa" e Liberação de Envio ao Marcar "Para Viagem / Balcão"

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael Brentano · **Criada em:** 2026-10-17 · **Atualizada em:** 2026-10-17

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Ao marcar a opção "🥡 Para viagem / Balcão" (`#pedido-para-viagem`) no PDV (`pedidos.html` / `js/pedidos.js`), o sistema deve automaticamente desmarcar qualquer mesa selecionada (definindo como sem mesa / balcão), atualizar a interface de seleção de mesa para indicar "🥡 Balcão / Viagem", dispensar a obrigatoriedade de seleção de mesa para habilitar e enviar o pedido, e garantir que a submissão do pedido registre `BALCAO` no banco de dados sem exibir o alerta de bloqueio ("Por favor, selecione uma mesa para o pedido").
- **Problema e evidência:** 
  1. Atualmente, ao marcar a checkbox "🥡 Para viagem / Balcão", o campo de seleção de mesa não é limpo automaticamente e o gatilho visual (`#btn-mesa-trigger`) continua exibindo "Selecione a Mesa...".
  2. Apesar de `checkFormValidity()` habilitar o botão de envio quando `isParaViagem` está ativo, o evento de clique `btnEnviarPedido.addEventListener('click')` possui uma validação impeditiva rígida: `if (!mesaCodigo) { showToast('Por favor, selecione uma mesa para o pedido.', 'error'); return; }`. Isso impede o envio do pedido se o barista não escolher manualmente uma mesa fictícia ou não abrir o modal para clicar em "Balcão".
  3. Gera atrito e lentidão no atendimento rápido de balcão e pedidos "to-go", forçando cliques extras desnecessários.
- **Impacto de não fazer:** 
  Operadores de caixa e baristas perdem tempo durante o pico de atendimento tentando enviar pedidos para viagem e sendo bloqueados pelo toast de erro de mesa não selecionada.
- **Para quem é destinado:** 
  Baristas, caixas e atendentes da Cafeteria do Teatro que operam o PDV.
- **História de usuário:** 
  Como barista ou operador de caixa no PDV, quero marcar "Para viagem / Balcão" e ter a mesa desmarcada automaticamente e dispensada, para enviar pedidos rápidos de balcão ou viagem em poucos toques sem ser obrigado a selecionar uma mesa.
- **Como saberemos que deu certo:** 
  1. Ao marcar a caixa "🥡 Para viagem / Balcão", a mesa é imediatamente definida como sem mesa, o badge do carrinho exibe `🥡 Viagem` e o botão seletor exibe `🥡 Balcão / Viagem`.
  2. Com itens no carrinho e "Para viagem" marcado, o botão "Enviar Pedido" fica ativo e conclui o envio com sucesso (registrando `BALCAO` no backend) sem exibir toast de erro de mesa obrigatória.
  3. 0 erros no console e build sem falhas (`npm run build`).

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Ao marcar `#pedido-para-viagem`, limpar o valor de `mesaSelect` (`''`), acionar atualização da UI do seletor (`updateMesaTriggerUI`) e da grade de mesas (`renderMesaSelectionGrid`), exibindo o estado visual de Balcão/Viagem. | P0 | CA01 |
| RF02 | Permitir o envio do pedido quando `paraViagem` estiver marcado, mesmo que `mesaCodigo` esteja vazio (`''`), atribuindo o identificador `"Balcão"` na mensagem otimista e enviando `mesa_codigo: ''` (o qual a RPC `criar_pedido` converte automaticamente para `'BALCAO'`). | P0 | CA02 |
| RF03 | Ao desmarcar `#pedido-para-viagem` (caso não haja mesa selecionada), restaurar a UI para "Selecione a Mesa...", badge "Sem Mesa", e revalidar o formulário via `checkFormValidity()`, exigindo a escolha de mesa para pedidos locais de salão. | P0 | CA03 |
| RF04 | Se o usuário estiver com "Para viagem" marcado e posteriormente abrir o modal e selecionar uma mesa de salão (ex: Mesa 03), manter a mesa selecionada e atualizar o badge com o código da mesa. | P1 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Resposta visual instantânea (< 50ms) ao alternar o checkbox, com feedback háptico sutil (vibração de 10-15ms em dispositivos móveis compatíveis). | P0 | CA01, CA03 |
| RNF02 | Compatibilidade com o salvamento de rascunho offline (`salvarRascunhoCarrinho`) e fila de envio em segundo plano. | P0 | CA02 |

### Dependências técnicas

- Arquivos envolvidos: `js/pedidos.js` (funções `checkFormValidity`, listener de `#pedido-para-viagem`, listener de `btnEnviarPedido`, e `updateMesaTriggerUI`).
- Backend Supabase: RPC `criar_pedido` (já possui suporte nativo para `IF v_mesa_codigo IS NULL OR v_mesa_codigo = '' THEN v_mesa_codigo := 'BALCAO'; END IF;`).

### Recursos necessários

- Navegador web / ambiente local com Vite para validação dos fluxos no PDV.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o barista está com itens no carrinho no PDV, quando marcar a opção "🥡 Para viagem / Balcão", então qualquer mesa previamente selecionada é desmarcada, o botão de seleção de mesa exibe "🥡 Balcão / Viagem" com estilo ativo, o badge do carrinho exibe "🥡 Viagem", e o botão "Enviar Pedido" fica habilitado.
- [x] **CA02:** Dado que "🥡 Para viagem / Balcão" está marcado e nenhuma mesa está selecionada, quando o barista clicar em "Enviar Pedido", então o pedido é enviado com sucesso sem exibir toast de erro "Por favor, selecione uma mesa para o pedido", sendo gravado com código de mesa "BALCAO".
- [x] **CA03:** Dado que "🥡 Para viagem / Balcão" estava marcado, quando o barista desmarcar a opção e nenhuma mesa estiver selecionada, então a interface retorna para "Selecione a Mesa...", o badge exibe "Sem Mesa" e o botão "Enviar Pedido" fica desabilitado até que uma mesa seja selecionada.
- [x] **CA04:** Dado que "🥡 Para viagem / Balcão" está marcado, quando o barista selecionar uma mesa de salão através da grade de seleção de mesas, então a mesa escolhida passa a ser exibida no seletor e no badge.

## O que a atividade não inclui

- Alteração na estrutura do banco de dados ou criação de novas migrations (a RPC `criar_pedido` já trata valores nulos/vazios convertendo para `'BALCAO'`).
- Alterações no painel KDS ou na tela de cozinha (estes já tratam pedidos com mesa `BALCAO` e flag `para_viagem`).

### Considerado para o futuro (P2)

- Adição de atalho de teclado rápido (ex: `Alt + V`) para alternar diretamente o modo "Para Viagem".

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Ao desmarcar "Para Viagem", deve reexigir mesa caso o cliente não tenha nome preenchido? | dev | Não | Sim, `checkFormValidity()` já exige mesa a menos que seja viagem ou pedido balcão identificado. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Marcar "Para Viagem" sem mesa prévia | Manual | CA01 | 1. Adicionar item ao carrinho.<br>2. Clicar em "Para Viagem / Balcão". | Mesa é definida como vazia, gatilho mostra "🥡 Balcão / Viagem", botão enviar fica habilitado. |
| CT02 | Marcar "Para Viagem" com mesa previamente selecionada | Manual | CA01 | 1. Selecionar Mesa 05.<br>2. Clicar em "Para Viagem / Balcão". | Mesa 05 é desmarcada, botão exibe "🥡 Balcão / Viagem" e badge mostra "🥡 Viagem". |
| CT03 | Enviar pedido para viagem sem mesa | Manual | CA02 | 1. Com item e "Para Viagem" marcado sem mesa, clicar em "Enviar Pedido". | Pedido enviado com sucesso, toast informa envio da mesa Balcão / Viagem, sem toast de erro. |
| CT04 | Desmarcar "Para Viagem" | Manual | CA03 | 1. Com "Para Viagem" marcado, desmarcar a caixa. | Botão volta para "Selecione a Mesa...", badge "Sem Mesa", envio bloqueado até escolher mesa. |

## URL Complementar

- Documentação técnica: [js/pedidos.js](file:///Users/natanaelfernandogattibrentano/cafeteriadoteatro/js/pedidos.js)
- Template de origem: [SDD/MODELO_ATIVIDADE.md](file:///Users/natanaelfernandogattibrentano/cafeteriadoteatro/SDD/MODELO_ATIVIDADE.md)
