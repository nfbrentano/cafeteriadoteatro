# [TEST] Suíte de Testes Automatizados de Fluxo Completo de Pedidos com Variações Aleatórias (Mesa, Levar, Prioridade e Pagamento)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-27 · **Atualizada em:** 2026-10-27

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Desenvolver uma suíte de testes funcionais automatizados de ponta a ponta (E2E funcional no DOM real do PDV via Happy DOM) cobrindo o fluxo completo de criação de pedidos no PDV (`pedidos.html` + `js/pedidos.js`), executando variações combinatórias e aleatorizadas:
  1. Pedidos para levar (Takeout / Balcão).
  2. Pedidos para comer na mesa (seleção de mesas dinâmicas).
  3. Pedidos com prioridade (com seleção de motivos e intervalo de espetáculo) e sem prioridade.
  4. Seleção aleatória de produtos do catálogo (produtos simples, produtos compostos com adicionais, quantidades variadas).
  5. Seleção aleatória de formas de pagamento (`dinheiro`, `pix`, `cartao_debito`, `cartao_credito`, `conta_cliente`) e status pago/pendente.
  6. Uso de gerador pseudo-aleatório (PRNG) com semente determinística configurável para garantir reprodutibilidade exata em caso de falha.
- **Problema e evidência:** 
  A suíte combinatória anterior (CAF-000102) cobriu a matriz cartesiana de 360 combinações de envio focada em um produto padrão (`p1: Espresso`). O usuário solicitou testes que exercitem o **fluxo completo real** variando **sempre e aleatoriamente** os produtos escolhidos (simples e com adicionais), quantidades, destinos (mesa vs. levar), sinalização de prioridade (com diferentes motivos) e formas de pagamento, garantindo que o carrinho calcule os valores exatos, chame a RPC `criar_pedido` com o payload correto e reinicie o estado do formulário.
- **Impacto de não fazer:** 
  Risco de regressões silenciosas em fluxos específicos quando múltiplos produtos com adicionais e certas formas de pagamento ou mesas são combinados na operação real do salão.
- **Para quem é destinado:** 
  Equipe de desenvolvimento e QA, assegurando confiabilidade operacional máxima para os baristas e garçons no PDV.
- **História de usuário:** 
  Como desenvolvedor e mantenedor do sistema, quero uma suíte automatizada que gere e submeta pedidos completos e aleatórios no PDV, para validar que o carrinho, o cálculo de totais, o destino, a prioridade e a forma de pagamento chegam íntegros à RPC `criar_pedido` sob qualquer combinação.
- **Como saberemos que deu certo:** 
  1. Criação do arquivo de teste `tests/caf-000105-pedidos-fluxo-completo-aleatorio.test.js`.
  2. Execução de uma bateria com dezenas de pedidos randômicos cobrindo todos os fluxos (mesa, levar, prioridade, pagamentos diversos, produtos diversos).
  3. 100% dos testes passando em `npm test` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|---|---|
| RF01 | Implementar gerador de pedidos pseudo-aleatórios determinístico (PRNG com seed) com distribuição equilibrada entre Mesa e Levar, Prioridade (com motivos) e Formas de Pagamento | P0 | CA01, CA02, CA03, CA04 |
| RF02 | Criar catálogo expandido de teste contendo categorias, produtos simples, produtos com adicionais múltiplos e lista de mesas (01 a 05) | P0 | CA01, CA04, CA05 |
| RF03 | Testar o fluxo completo de "Para Levar" (Takeout) com produto e pagamento aleatórios, validando `para_viagem: true` e `mesa_codigo: 'BALCAO'` | P0 | CA01 |
| RF04 | Testar o fluxo completo de "Comer na Mesa" com seleção dinâmica de mesa, validando `para_viagem: false` e `mesa_codigo` correspondente | P0 | CA02 |
| RF05 | Testar o fluxo completo de "Com Prioridade" (motivos: Espetáculo, Refazer, Reclamação, Outro e Intervalo) e sem prioridade, validando payload da RPC | P0 | CA03 |
| RF06 | Validar o cálculo em tempo real do total no carrinho (produtos + adicionais) comparando com a expectativa do oráculo e o payload emitido | P0 | CA05 |
| RF07 | Validar limpeza de carrinho e formulário após submissão bem-sucedida de cada pedido | P0 | CA06 |
| RF08 | Validar tratamento de erros e bloqueios de validação (carrinho vazio, sem mesa e sem levar, fiado sem cliente habilitado) | P0 | CA07 |

### Requisitos não funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|---|---|
| RNF01 | Executar código real do PDV via `setupPedidosPage` e Happy DOM, sem mocks de lógica de negócio | P0 | Todos |
| RNF02 | Reprodutibilidade determinística: testes gerados via seed previsível para não gerar falso-positivos intermitentes no CI | P0 | CA04 |

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o PDV em execução, quando gerado um pedido "Para Levar" com produto(s) e forma de pagamento aleatórios, então a RPC `criar_pedido` recebe `para_viagem: true`, `mesa_codigo: 'BALCAO'`, os itens correspondentes e o total correto.
- [x] **CA02:** Dado o PDV em execução, quando gerado um pedido "Comer na Mesa" selecionando uma mesa aleatória cadastrada, então a RPC `criar_pedido` recebe `para_viagem: false`, o código da mesa selecionada e itens correspondentes.
- [x] **CA03:** Dado o PDV em execução, quando o pedido é configurado com prioridade aleatória (com motivo sorteado) ou intervalo, então a RPC `criar_pedido` recebe `prioridade: 1` e `prioridade_motivo` condizente; quando sem prioridade, recebe `0` e motivo nulo.
- [x] **CA04:** Dado o gerador pseudo-aleatório, quando executada uma bateria de 30 pedidos com sementes controladas, então todas as variações (produtos simples, compostos, dinheiro, pix, cartões, fiado com cliente, mesas variadas e levar) são executadas com sucesso no DOM real.
- [x] **CA05:** Dado qualquer pedido gerado aleatoriamente, o valor exibido no total do carrinho (`#cart-total-value`) bate exatamente com a soma dos preços unitários dos produtos multiplicados pelas quantidades somados aos adicionais selecionados.
- [x] **CA06:** Dado um pedido enviado com sucesso, o carrinho é esvaziado (`.cart-item` = 0), e os campos de mesa, cliente e observação são restaurados ao estado padrão.
- [x] **CA07 (negativo):** Dado um fluxo onde o pedido gerado aleatoriamente viole regras de validação (sem destino, ou carrinho vazio, ou fiado com cliente sem limite), a submissão é bloqueada sem chamar a RPC e exibe toast de alerta correspondente.

## O que a atividade não inclui

- Modificações nas telas de Cardápio ou Cozinha (foco exclusivo no PDV e sua integração).
- Alteração no banco de produção.

