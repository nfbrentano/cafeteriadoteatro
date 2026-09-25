# CAF-000040 — [Salão] [Cardápio] Totem / tablet de autoatendimento no balcão

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Nova tela (totem) + PDV + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar um **modo totem** do cardápio (`totem.html`) para um tablet fixo no balcão ou na entrada do teatro:
  1. O cliente monta o pedido sozinho (adicionais, meio a meio, observação), com fotos grandes e sugestões de complemento ("Que tal um pão de queijo com o seu café?").
  2. Informa o primeiro nome, escolhe "Comer aqui" ou "Para viagem" e recebe uma **senha** na tela (e impressa, se houver impressora).
  3. **Paga no caixa**: o pedido entra no PDV como "Aguardando pagamento" e só vai para a cozinha depois que o barista confirma o pagamento.
  4. Quando fica ocioso, mostra uma tela de descanso com promoções do dia e a programação do teatro.
- **Por que é necessário:** no intervalo do espetáculo a fila se forma **no balcão**, não nas mesas. O QR na mesa ([CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md)) não resolve quem está em pé na fila. Com o totem, o barista só recebe o pagamento e prepara.
- **Qual valor será agregado:** fila mais curta no pico, ticket maior com as sugestões e menos erro de anotação.
- **Para quem é destinado:** clientes de balcão e baristas.

### Referência de mercado

- **Suitable:** totem de pedidos com personalização do item, sugestão de combos e promoções para aumentar o ticket, vídeo na tela de descanso e pagamento integrado; tablet nas mesas.
- **Simpliza:** cardápio digital em tablets enviando o pedido direto para o sistema.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Página `totem.html` + `js/totem.js` + `css/totem.css`, reaproveitando o módulo de montagem de pedido da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md). Layout pensado para tablet em pé (retrato), botões ≥ 64 px.
- [ ] Ativação do dispositivo pelo admin: o admin gera um **código de totem** (token longo, revogável, tabela `totens (id, nome, token_hash, ativo, ultimo_acesso)`) e o tablet é pareado uma vez; sem login de usuário no tablet.
- [ ] RPC `criar_pedido_totem(p_token, p_payload, p_idempotency_key)`: mesma validação e recálculo de preço da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), `origem = 'totem'`, `mesa_codigo = 'BALCÃO'`, `cliente_nome`, `para_viagem` e status `aguardando_pagamento` (novo valor no `CHECK`).
- [ ] Tela final com a **senha** (`numero_pedido`) em destaque, o total a pagar no caixa e "Acompanhe na TV" (painel da [CAF-000027](CAF-000027-painel-de-senhas-retirada.md)). Volta sozinha para o início em 15 s.
- [ ] Sugestões de complemento configuráveis no admin: por produto ou categoria ("sugerir X quando o carrinho tiver Y"), no máximo 3 por pedido.
- [ ] PDV: seção "🧾 Aguardando pagamento" com a senha, o nome e o total; ação **Receber** (forma de pagamento, Pix da [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md)) que muda para `pendente` + `pago` e envia para a cozinha. Pedidos não pagos em 15 min são cancelados automaticamente (configurável).
- [ ] Tela de descanso depois de 60 s sem toque: carrossel com as promoções do dia ([CAF-000017](CONCLUIDAS/CAF-000017-aba-promos-no-cardapio-publico.md)) e imagens/avisos configurados no admin (ex.: "Hoje no Teatro").
- [ ] Modo quiosque: sem barra de endereço (PWA em tela cheia), bloqueio de navegação para fora do totem, carrinho limpo depois de 90 s de inatividade.

### Requisitos não funcionais
- [ ] **Segurança:** token do totem só permite `criar_pedido_totem` e leitura do cardápio público; revogar o token desliga o tablet na hora.
- [ ] **Robustez:** se cair a internet, o totem mostra "Faça seu pedido no caixa" (não enfileira pedidos offline, porque o cliente precisaria da senha na hora).
- [ ] **Acessibilidade:** contraste AA, fonte grande e opção de aumentar os textos.

### Dependências técnicas
- [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) (módulo de montagem de pedido e validação no banco).
- Recomendado com o painel de senhas da [CAF-000027](CAF-000027-painel-de-senhas-retirada.md).
- Build: incluir `totem.html` no `vite.config.js`, com `noindex`.

### Recursos necessários
- Tablet com suporte de balcão, tomada e, opcionalmente, impressora térmica para a senha.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o tablet está pareado, **quando** o cliente monta 1 cappuccino + 1 pão de queijo e informa "Ana", **então** vê a senha e o total, e o PDV mostra o pedido em "Aguardando pagamento".
- [ ] **Dado que** o pedido não foi pago, **quando** a cozinha consulta o KDS, **então** ele não aparece.
- [ ] **Dado que** o barista recebe o pagamento, **quando** confirma, **então** o pedido vai para a cozinha e é impresso.
- [ ] **Dado que** o carrinho tem um café, **quando** o cliente avança, **então** o totem sugere até 3 complementos configurados.
- [ ] **Dado que** o token do totem foi revogado, **quando** o tablet tenta enviar um pedido, **então** recebe erro e mostra "Totem desativado".

---

## O que a atividade não inclui

- Pagamento no próprio totem (TEF, maquininha ou Pix com confirmação automática).
- Leitura de cupom ou login do cliente no totem.
- Integração com plataformas de delivery.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Pareamento | Parear com código do admin | Totem ativo |
| 2 | Pedido | Montar e finalizar | Senha na tela, PDV "Aguardando pagamento" |
| 3 | Pagamento | Receber no PDV | Vai para o KDS |
| 4 | Expiração | Não pagar por 15 min | Cancelado automaticamente |
| 5 | Sugestão | Carrinho com café | Sugere complemento |
| 6 | Inatividade | Deixar 90 s parado | Carrinho limpo, tela de descanso |
| 7 | Sem internet | Desligar Wi-Fi | Aviso "Faça seu pedido no caixa" |
| 8 | Revogação | Revogar token | Totem desativado |

---

## URL Complementar

- Código relacionado: `cardapio.html`, `js/cardapio-dynamic.js`, `js/pedidos.js`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Suitable — totem: https://suitable.com.br/aplicativos/totem/ · tablet: https://suitable.com.br/aplicativos/tablet/
