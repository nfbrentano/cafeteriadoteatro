# [CHORE] CAF-000096 — Cobertura de Testes Unitários: KDS da Cozinha, Bar e Impressão Térmica

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** PO (Natanael) · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-22

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar suíte de testes unitários e funcionais cobrindo o sistema de produção e KDS (Kitchen Display System) do Bar e Cozinha (`js/cozinha.js`) e a formatação de comandas e etiquetas de impressão térmica (`js/pedido-print.js`). A suíte deve validar a segregação de pedidos por estação, avanço de status de itens e pedidos (pendente, preparando, pronto, entregue), acionamento de semáforo de tempo alvo, controle contra impressões duplicadas e geração correta das vias de bar, cozinha e conferência de mesa.

- **Problema e evidência:**
  `js/cozinha.js` possui quase 2.900 linhas e `js/pedido-print.js` tem 741 linhas, ambos com **0% de cobertura de código**. Erros na separação de itens entre bar e cozinha ou na lógica de conclusão independente por estação causam pedidos esquecidos, atrasos no salão e impressões duplicadas nas bobinas térmicas.

- **Impacto de não fazer:**
  Descompasso entre o que o barista no bar prepara e o que a cozinha entrega, comandas saindo com corte indevido ou formatação truncada, e falta de sincronia entre os status exibidos no KDS e no painel de retirada do cliente.

- **Para quem é destinado:**
  Cozinheiros, baristas e equipe de expedição/atendimento.

- **História de usuário:**
  Como cozinheiro ou barista, quero que os pedidos apareçam instantaneamente nas estações corretas com tempos de espera claros e comandas legíveis, para que a produção mantenha o padrão de qualidade e agilidade sem erros.

- **Como saberemos que deu certo:**
  1. Suíte `tests/caf-000096-kds-impressao.test.js` criada e exercitando o código real do KDS e gerador de impressão.
  2. 100% dos testes aprovados em `npm test`.
  3. `npm run build` executando sem falhas.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RF01 | Testar a distribuição e filtragem de pedidos por estação (somente itens de "bar", somente itens de "cozinha" ou visualização combinada de produção). | P0 | CA01, CA02 |
| RF02 | Testar a mudança de estado item a item (`pendente` -> `preparando` -> `pronto`), refletindo o progresso visual no card da comanda. | P0 | CA03 |
| RF03 | Testar a conclusão por estação e a regra de conclusão global do pedido (pedido só vai para "pronto para servir" quando todas as suas estações ativas finalizarem). | P0 | CA04 |
| RF04 | Testar a categorização do semáforo de tempo de espera (verde = dentro do tempo, amarelo = próximo do limite, vermelho = estourado), considerando compensação de horário. | P0 | CA05 |
| RF05 | Testar a geração da comanda de texto para impressora térmica (formatação de cabeçalho, mesa/viagem, itens, adicionais em destaque e observações). | P0 | CA06, CA07 |
| RF06 | Testar a trava de impressão (`impressao-trava.js`) para evitar que o mesmo pedido seja enviado mais de uma vez para a mesma impressora. | P0 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RNF01 | Formatação de impressão compatível com colunagem padrão de impressoras térmicas (40/48 colunas em 80mm). | P0 | CA06 |
| RNF02 | Sanitização e escape seguro de caracteres acentuados para compatibilidade com drivers ESC/POS. | P0 | CA07 |

### Dependências técnicas

- `js/cozinha.js`
- `js/pedido-print.js`
- `js/utils/kds-regras.js`
- `js/utils/impressao-trava.js`

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um pedido com 1 "Cappuccino" (estação Bar) e 1 "Omelete" (estação Cozinha), quando a tela está filtrada para "Bar", então apenas o "Cappuccino" é exibido na lista de preparo do bar.
- [x] **CA02:** Dado o mesmo pedido, quando a tela está filtrada para "Cozinha", então apenas o "Omelete" é exibido na lista de preparo da cozinha.
- [x] **CA03:** Dado um item com status "pendente", quando o cozinheiro clica para marcar preparo iniciado, então o status transita para "preparando" com timestamp de início gravado.
- [x] **CA04:** Dado um pedido misto com Bar e Cozinha, quando o bar conclui suas bebidas mas a cozinha ainda não terminou o prato, então o pedido permanece em andamento; quando a cozinha conclui seu item, o pedido transita automaticamente para "pronto para servir".
- [x] **CA05:** Dado um produto com tempo alvo de 15 minutos lançado há 17 minutos, quando o KDS renderiza o card, então o semáforo exibe badge vermelho com contagem de minutos excedidos.
- [x] **CA06:** Dado um pedido gerado, quando `formatarComandaEstacao` é invocado para 80mm, então o texto retornado contém cabeçalho centralizado, identificação clara da mesa/senha, itens com quantidade e linhas de separação alinhadas.
- [x] **CA07:** Dado itens com adicionais especiais (ex: "Sem Açúcar" ou "Extra Quente"), quando a comanda térmica é impressa, então essas observações aparecem indentadas e em destaque logo abaixo do item correspondente.
- [x] **CA08:** Dado um pedido já impresso na estação Bar, quando uma rotina de atualização tenta disparar a impressão da mesma via novamente dentro do tempo de retenção, então a trava de impressão intercepta e bloqueia a reimpressão duplicada.
- [x] **CA09:** Suíte `tests/caf-000096-kds-impressao.test.js` implementada e rodando com 100% de sucesso em conjunto com `npm test` e `npm run build`.

---

## O que a atividade não inclui

- Driver nativo USB/Bluetooth (a camada testada é a lógica de geração de texto, layout e regras de fila de impressão).
- Recursos de síntese de voz (TTS) do navegador em ambientes que não suportam a Web Speech API.
