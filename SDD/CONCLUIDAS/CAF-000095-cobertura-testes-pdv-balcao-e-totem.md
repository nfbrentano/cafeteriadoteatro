# [CHORE] CAF-000095 — Cobertura de Testes Unitários: PDV do Balcão e Totem de Autoatendimento

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** PO (Natanael) · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-22

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  Criar suíte de testes funcionais e unitários automatizados para o fluxo de montagem e envio de pedidos no PDV do Barista/Atendimento (`js/pedidos.js`) e no Totem de Autoatendimento do Salão (`js/totem.js`). A suíte deve simular o ciclo de vida do pedido: seleção de canal (mesa ou viagem), busca e inclusão de itens no carrinho com adicionais obrigatórios/opcionais, aplicação de cupons/cashback, fechamento de conta e emissão do payload para a cozinha e banco de dados.

- **Problema e evidência:**
  `js/pedidos.js` (5.755 linhas) e `js/totem.js` (1.224 linhas) são o coração operacional da cafeteria, mas possuem **0% de cobertura de código**. Alterações recentes no cálculo de taxas, divisões de conta ou adicionais dependem de testes manuais, gerando alto risco de quebra durante horários de pico de movimento.

- **Impacto de não fazer:**
  Uma regressão no PDV pode travar a digitação de pedidos pelos baristas, impedir a finalização de carrinhos no totem do salão, gerar pedidos com valores incorretos ou omitir complementos essenciais pedidos pelo cliente.

- **Para quem é destinado:**
  Baristas, operadores do balcão e clientes que utilizam o totem.

- **História de usuário:**
  Como barista ou cliente no totem, quero que o carrinho calcule os adicionais, descontos e taxas corretamente e envie os pedidos sem falhas ou atrasos, para garantir agilidade no atendimento e cobrança justa.

- **Como saberemos que deu certo:**
  1. Suíte `tests/caf-000095-pdv-balcao-totem.test.js` cobrindo os fluxos de carrinho, cálculo e envio.
  2. 100% dos testes aprovados em `npm test`.
  3. `npm run build` executando com sucesso.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RF01 | Testar o gerenciamento do carrinho (adição de produto, incremento/decremento de quantidade, remoção e inserção de observação). | P0 | CA01, CA02 |
| RF02 | Testar a personalização de adicionais (grupos com seleção única/obrigatória e grupos com múltipla escolha até a quantidade máxima permitida). | P0 | CA03, CA04 |
| RF03 | Testar a definição de destino do pedido (número de mesa com comanda aberta vs balcão / viagem sem mesa obrigatória). | P0 | CA05 |
| RF04 | Testar a aplicação combinada de cupom de desconto e saldo de cashback da carteira do cliente, respeitando as regras de validação. | P0 | CA06, CA07 |
| RF05 | Testar o totem de autoatendimento, incluindo escolha de consumo no local ou para viagem, geração de QR Code Pix dinâmico e emissão de senha de retirada. | P0 | CA08, CA09 |
| RF06 | Testar a montagem e validação do payload final de envio para a tabela `pedidos` e `pedido_itens`. | P0 | CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RNF01 | Testes com manipulação rápida de DOM via `happy-dom` simulando eventos de clique, input e submissão. | P0 | CA11 |
| RNF02 | Sanitização anti-XSS comprovada nos campos de texto livre (observações e nome do cliente). | P0 | CA12 |

### Dependências técnicas

- `js/pedidos.js`
- `js/totem.js`
- `js/utils/order-calculator.js`
- `js/utils/coupon-validator.js`
- `js/utils/cashback.js`

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o operador clica para adicionar um "Café Espresso" (R$ 8,00), quando altera a quantidade para 2, então o subtotal do carrinho atualiza imediatamente para R$ 16,00.
- [x] **CA02:** Dado um item com quantidade 1 no carrinho, quando o operador clica no botão de decrementar ou excluir, então o item é removido e o total é recalculado.
- [x] **CA03:** Dado um produto com grupo de adicional obrigatório (ex: "Tipo de Leite: Integral ou Vegetal"), quando o usuário tenta adicionar ao carrinho sem selecionar uma opção, então a adição é bloqueada com aviso de campo obrigatório.
- [x] **CA04:** Dado um produto com adicionais opcionais (ex: + Chantilly R$ 3,00 e + Canela R$ 0,00), quando selecionados, então o valor do item reflete o preço base acrescido dos complementos (ex: R$ 8,00 + R$ 3,00 = R$ 11,00).
- [x] **CA05:** Dado um pedido selecionado como "Para Viagem", quando enviado, então o campo `tipo_consumo` é preenchido com `'viagem'` e o `mesa_id` é `null` (sem exigir vínculo de mesa).
- [x] **CA06:** Dado um cupom de 10% de desconto aplicado a um carrinho de R$ 50,00, quando validado, então o desconto de R$ 5,00 é deduzido e exibido claramente antes do fechamento.
- [x] **CA07:** Dado um cliente identificado com R$ 15,00 de cashback acumulado, quando autoriza o uso de R$ 10,00 no carrinho de R$ 40,00, então o saldo a pagar é ajustado para R$ 30,00 e o débito de cashback é incluído no payload.
- [x] **CA08:** Dado o totem de autoatendimento, quando o cliente finaliza o pedido com forma Pix, então o QR Code BR Code Pix é renderizado na tela com o valor exato da compra.
- [x] **CA09:** Dado a confirmação do pedido no totem, quando concluído, então uma senha única de retirada (ex: `A-12` ou `042`) é exibida ao cliente para acompanhamento no painel da TV.
- [x] **CA10:** Dado o payload final gerado pelo PDV, quando verificado, então todos os itens contêm `produto_id`, `quantidade`, `preco_unitario`, `adicionais` e `observacao` devidamente formatados.
- [x] **CA11:** Dado texto com caracteres especiais (`<script>`, `&`, `"`), quando inserido no nome do cliente ou observação do pedido, então a saída é sanitizada sem vulnerabilidade XSS.
- [x] **CA12:** Suíte `tests/caf-000095-pdv-balcao-totem.test.js` passando com 100% de sucesso junto aos comandos `npm test` e `npm run build`.

---

## O que a atividade não inclui

- Alteração no layout CSS ou redesenho visual dos cards de produtos do PDV e totem.
- Integração física de hardware com impressoras fiscais ou gavetas automáticas acionadas por pulso elétrico.
