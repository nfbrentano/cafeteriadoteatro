# CAF-000038 — [Cardápio] [PDV] Pedido online para retirada e encomendas pelo link (WhatsApp / Instagram)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cardápio público + PDV + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir que o cliente, **fora da cafeteria**, faça um pedido pelo link do cardápio (divulgado no WhatsApp, Instagram e Google) para **retirar no balcão** em um horário escolhido:
  - "O quanto antes" (ex.: pedir o café no caminho para o espetáculo).
  - **Agendado / encomenda** (ex.: bolo inteiro ou kit de salgados para amanhã às 15h).
  O pedido chega no PDV para confirmação, igual ao da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), e o cliente recebe confirmação e aviso de pronto por link do WhatsApp.
- **Por que é necessário:** hoje o botão flutuante do WhatsApp ([CAF-000020](CONCLUIDAS/CAF-000020-menu-flutuante-whatsapp.md), `cardapio.html:360`) só abre uma conversa; o pedido é digitado à mão pelo barista, com erro de item e de preço, e encomendas ficam anotadas em papel. Todos os concorrentes oferecem link de pedidos próprio, sem depender de marketplace.
- **Qual valor será agregado:** venda antecipada antes do espetáculo, organização das encomendas e fim da digitação de pedidos que chegam por mensagem.
- **Para quem é destinado:** clientes (público do teatro, comunidade da Univates) e baristas.

### Referência de mercado

- **Kyte:** catálogo online e site de pedidos com link compartilhável (WhatsApp, Instagram, Facebook, Google), recibo digital.
- **Jarbas:** vendas pelo WhatsApp e redes sociais, catálogo/vitrine virtual, orçamentos.
- **Simpliza:** site de pedidos publicável no WhatsApp.
- **Garfo:** cardápio digital com link/QR próprio.
- **Suitable:** cardápio digital / loja online própria. Fonte: https://suitable.com.br/produto/loja-online/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Modo "Pedido para retirada" no `cardapio.html` (sem mesa), ativado por configuração `pedido_online_ativo` e respeitando `business_hours`.
- [ ] Checkout com nome e telefone obrigatórios (cria ou reaproveita o cliente da [CAF-000033](CAF-000033-cadastro-de-clientes.md), com consentimento LGPD) e escolha de horário:
  - "O quanto antes" (mostra o tempo estimado configurável, ex.: 15 min).
  - Agendado em janelas de 15 min dentro do horário de funcionamento, com antecedência mínima por produto (`produtos.antecedencia_min_horas`, ex.: bolo inteiro = 24 h).
- [ ] Produtos marcáveis como "Só por encomenda" (não aparecem no PDV do dia, só no agendamento).
- [ ] RPC `criar_pedido_online(p_payload, p_idempotency_key)` (`anon`, mesma validação e recálculo de preço da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md)), criando pedido com `origem = 'online'`, `para_viagem = true`, `retirada_em TIMESTAMPTZ` e `status = 'aguardando_aprovacao'`.
- [ ] Limite de pedidos por janela de horário (configurável) para não lotar o intervalo do espetáculo.
- [ ] PDV: seção "🌐 Online / Encomendas" com alerta; **Aprovar** / **Recusar** (com motivo). Na aprovação, abre o WhatsApp do cliente com mensagem pronta ("Pedido #52 confirmado para 19h45").
- [ ] Encomendas agendadas entram no KDS só **X minutos antes** do horário de retirada (configurável por estação, padrão 20 min); antes disso ficam numa lista "Agendados" no PDV e no admin (agenda por dia).
- [ ] Ao ficar pronto: aparece no painel de retirada ([CAF-000027](CAF-000027-painel-de-senhas-retirada.md)) e o PDV oferece "Avisar pelo WhatsApp" (link com mensagem pronta).
- [ ] Página de acompanhamento com `pedido_token` (status e horário), igual à [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md).
- [ ] Pagamento na retirada (formas atuais). Sinal/pagamento antecipado de encomenda pode ser feito com o Pix da [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md), confirmado manualmente pelo barista.
- [ ] Botão "Compartilhar cardápio" no admin com o link e um QR para Instagram/cartaz.

### Requisitos não funcionais
- [ ] **Segurança:** mesmas regras da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) (RPC, preço do banco, rate limit, aprovação humana). Telefone validado no formato BR.
- [ ] **Não-comparecimento:** marcar pedido como "não retirado" (vira cancelado com motivo e estorno de estoque) e registrar no cadastro do cliente.
- [ ] **SEO:** o link do cardápio continua indexável; páginas de acompanhamento com `noindex`.

### Dependências técnicas
- [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) (montagem de pedido no cardápio, RPC pública, status `aguardando_aprovacao`), [CAF-000033](CAF-000033-cadastro-de-clientes.md).
- Recomendado depois da [CAF-000027](CAF-000027-painel-de-senhas-retirada.md).

### Recursos necessários
- Decisão do cliente: quais produtos aceitam encomenda, antecedência mínima e capacidade por janela.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o pedido online está ativo, **quando** o cliente abre o link sem mesa, **então** pode montar o pedido e escolher "o quanto antes" ou um horário.
- [ ] **Dado que** o bolo inteiro exige 24 h, **quando** o cliente tenta agendar para daqui a 3 h, **então** o horário não é oferecido.
- [ ] **Dado que** o barista aprova um pedido, **quando** confirma, **então** o WhatsApp abre com a mensagem de confirmação para o telefone do cliente.
- [ ] **Dado que** uma encomenda é para 15h, **quando** são 14h40, **então** ela entra no KDS (e não antes).
- [ ] **Dado que** a janela das 19h30 atingiu o limite, **quando** outro cliente tenta agendar, **então** essa janela aparece indisponível.

---

## O que a atividade não inclui

- **Entrega (delivery)** e integração com iFood, 99Food, Aiqfome ou outras plataformas.
- Pagamento online com confirmação automática (gateway/PSP).
- Envio automático de WhatsApp (API oficial); aqui são links `wa.me` acionados pelo barista.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Pedido imediato | Link → pedido "o quanto antes" | Chega no PDV aguardando aprovação |
| 2 | Agendado | Pedido para amanhã | Lista "Agendados", fora do KDS |
| 3 | Entrada no KDS | Chegar a 20 min do horário | Aparece no KDS e imprime |
| 4 | Antecedência | Produto 24 h agendado para hoje | Bloqueado |
| 5 | Capacidade | Lotar janela | Janela indisponível |
| 6 | Fora do horário | Agendar domingo fechado | Não oferecido |
| 7 | Não retirado | Marcar "não retirado" | Cancelado + estorno |
| 8 | Aviso de pronto | "Avisar pelo WhatsApp" | Link com mensagem correta |

---

## URL Complementar

- Código relacionado: `cardapio.html:360` (botão WhatsApp), `js/cardapio.js`, `js/cardapio-dynamic.js`, `supabase/migration_business_hours_fix.sql`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Kyte: https://www.kyteapp.com/pt · Jarbas: https://www.jarbas.app · Simpliza: https://simpliza.com.br
