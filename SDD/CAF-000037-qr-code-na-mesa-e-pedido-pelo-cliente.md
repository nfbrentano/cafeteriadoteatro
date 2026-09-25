# CAF-000037 — [Cardápio] [PDV] QR Code por mesa e pedido feito pelo cliente (com aprovação do barista)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cardápio público + PDV + banco | 🔴 Alta | G | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Gerar um **QR Code por mesa** no admin (`mesas`), que abre o cardápio já identificado com a mesa (`cardapio.html?mesa=M3&t=<token>`).
  2. Permitir que o cliente **monte o pedido no cardápio** (com adicionais, meio a meio e observação, como no PDV) e envie.
  3. O pedido chega no PDV como **"Aguardando aprovação"**; o barista confirma (vai para a cozinha) ou recusa.
  4. O cliente acompanha o status na própria tela e pode **"Chamar atendente"** ou **"Pedir a conta"**.
- **Por que é necessário:** o cardápio público (`cardapio.html`, `js/cardapio-dynamic.js`) só exibe produtos; o pedido depende de o barista ir até a mesa. No intervalo de um espetáculo, com salão cheio, isso vira fila. Já está registrado como "ideia para o futuro" no [FEATURES_PENDENTES.md](CONCLUIDAS/FEATURES_PENDENTES.md) e na [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md), e é recurso comum dos concorrentes.
- **Qual valor será agregado:** mais pedidos atendidos no pico com a mesma equipe, menos erro de anotação e maior ticket (o cliente vê fotos e adicionais com calma).
- **Para quem é destinado:** clientes nas mesas e baristas.

### Referência de mercado

- **Garfo:** cardápio digital com QR Code exclusivo e personalização da marca; mesas e comandas em tempo real.
- **Simpliza:** QR Code na mesa para autoatendimento, com impressão automática na cozinha/bar dos pedidos feitos pelo app.
- **Jarbas / Kyte:** cardápio digital e catálogo online onde o cliente faz o pedido.
- **Suitable:** autoatendimento por QR Code, tablet na mesa ou totem, com envio direto à comanda; pagamento na mesa. Fonte: https://suitable.com.br/produto/salao/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Coluna `mesas.qr_token TEXT UNIQUE` (aleatório, regenerável) e botão "🔳 QR Code" em `js/admin/mesas-admin.js`: mostra, baixa em PNG e imprime folha A4 com os QR de todas as mesas (logo + "Faça seu pedido aqui"). Geração local (biblioteca de QR via CDN permitida), sem serviço externo.
- [ ] Configuração `pedido_cliente_ativo` (liga/desliga geral) e respeito ao horário de funcionamento (`business_hours`): fora do horário o cardápio só exibe.
- [ ] No cardápio, com mesa válida: botão "+ Adicionar" nos produtos disponíveis, modal de montagem (adicionais vinculados — [CAF-000020](CONCLUIDAS/CAF-000020-vinculo-de-adicionais-por-produto.md) —, meio a meio e observação), carrinho com promoções do dia ([CAF-000017](CONCLUIDAS/CAF-000017-aba-promos-no-cardapio-publico.md)) e campo "Seu nome".
- [ ] Nova RPC `criar_pedido_cliente(p_qr_token, p_payload, p_idempotency_key)` (`SECURITY DEFINER`, liberada para `anon`):
  - valida token, mesa ativa, horário, produtos/adicionais disponíveis e **recalcula todos os preços no banco**;
  - cria o pedido com `origem = 'cliente_qr'` e `status = 'aguardando_aprovacao'` (novo valor no `CHECK`);
  - limite de envio por token (ex.: 1 pedido a cada 60 s, máx. 10 itens por pedido).
- [ ] PDV (`js/pedidos.js`): seção "📱 Pedidos da mesa" com alerta sonoro; ações **Aprovar** (vira `pendente`, entra no KDS e imprime) e **Recusar** (com motivo mostrado ao cliente). Só pedidos aprovados aparecem na cozinha e na conta da mesa.
- [ ] Tela de acompanhamento do cliente: "Aguardando confirmação → Em preparo → Pronto", via view pública mínima filtrada por um `pedido_token` devolvido pela RPC (mesmo modelo de privacidade da [CAF-000027](CAF-000027-painel-de-senhas-retirada.md)).
- [ ] Botões "🙋 Chamar atendente" e "🧾 Pedir a conta", que geram um aviso no PDV da mesa (tabela `mesa_chamados` com tipo e horário; atendido pelo barista).
- [ ] Pagamento continua no fechamento de mesa ([CAF-000002](CONCLUIDAS/CAF-000002-fechamento-de-conta-da-mesa.md)); o cliente não paga pelo celular nesta atividade.

### Requisitos não funcionais
- [ ] **Segurança:** `anon` não ganha `INSERT` direto em `pedidos`; tudo passa pela RPC. Preço vindo do cliente é ignorado. Token regenerável se o QR vazar.
- [ ] **Anti-abuso:** rate limit por token e por IP (quando disponível), e o pedido só vale depois da aprovação humana.
- [ ] **Desempenho:** o cardápio continua carregando em < 2 s em 4G; o modo pedido é carregado sob demanda (não pesa para quem só consulta).
- [ ] **Acessibilidade e mobile:** botões ≥ 44 px, funciona em telas de 360 px, sem login.

### Dependências técnicas
- `mesas`, `criar_pedido` (reaproveitar a validação de itens), promoções e `business_hours`.
- KDS: não mostrar `aguardando_aprovacao` (filtro em `js/cozinha.js`).
- Build: sem nova página (usa `cardapio.html`), mas novo módulo JS no `vite.config.js` se for separado.

### Recursos necessários
- Impressão/plastificação dos QR Codes para as mesas.
- Decisão do cliente: aprovação sempre obrigatória ou automática para mesas já abertas?

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o cliente escaneia o QR da Mesa 3, **quando** o cardápio abre, **então** aparece "Mesa 3" e o botão de adicionar nos produtos disponíveis.
- [ ] **Dado que** o cliente envia 2 cappuccinos, **quando** o pedido chega, **então** o PDV toca o alerta e o pedido fica em "Aguardando aprovação", sem aparecer na cozinha.
- [ ] **Dado que** o barista aprova, **quando** confirma, **então** o pedido vai para a cozinha, é impresso e o cliente vê "Em preparo".
- [ ] **Dado que** alguém altera o preço no navegador, **quando** envia, **então** o pedido é gravado com o preço do banco.
- [ ] **Dado que** o QR é usado fora do horário de funcionamento, **quando** o cardápio abre, **então** só exibe produtos, sem botão de pedido.
- [ ] **Dado que** o cliente toca "Pedir a conta", **quando** o aviso chega, **então** o PDV mostra "Mesa 3 pediu a conta".

---

## O que a atividade não inclui

- Pagamento online pelo cliente (Pix/cartão no celular).
- Pedido para entrega; pedido remoto para retirada (fica na [CAF-000038](CAF-000038-pedido-online-para-retirada.md)).
- Integração com iFood e outras plataformas de delivery.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | QR válido | Abrir link da mesa | Modo pedido ativo |
| 2 | Token inválido/regenerado | Abrir QR antigo | Só consulta, aviso "QR inválido" |
| 3 | Pedido completo | Adicionais + meio a meio + obs | Chega igual no PDV |
| 4 | Aprovação | Aprovar | Vai para KDS e imprime |
| 5 | Recusa | Recusar com motivo | Cliente vê o motivo |
| 6 | Preço adulterado | Mudar preço no payload | Preço do banco |
| 7 | Esgotado | Produto esgota com item no carrinho | Envio recusado com aviso |
| 8 | Rate limit | Enviar 2 pedidos em 10 s | Segundo bloqueado |
| 9 | Fora do horário | Abrir à noite | Só consulta |
| 10 | Chamar atendente | Tocar no botão | Aviso no PDV |

---

## URL Complementar

- Código relacionado: `cardapio.html`, `js/cardapio-dynamic.js`, `js/admin/mesas-admin.js`, `js/pedidos.js`, `supabase/migration_caf_000026_idempotencia.sql`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Garfo: https://garfo.app · Simpliza — sistema para restaurantes: https://simpliza.com.br/sistema-para-restaurantes.php
