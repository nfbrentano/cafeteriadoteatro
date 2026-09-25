# CAF-000042 — [Cardápio] [Admin] Avaliação do pedido e do atendimento pelo cliente

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cardápio público + admin + banco | 🟢 Baixa | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** coletar a avaliação do cliente depois do pedido (nota de 1 a 5 para produtos e atendimento, com comentário opcional) e mostrar os resultados no admin. Clientes satisfeitos (nota ≥ 4) recebem o convite para avaliar no Google.
- **Por que é necessário:** hoje a opinião do cliente só chega pelo Google (o site já tem o botão "Avaliar no Google", rastreado em `js/analytics.js`) ou de boca. Não dá para saber qual produto decepciona nem pegar uma reclamação antes que ela vire uma nota pública ruim.
- **Qual valor será agregado:** feedback por produto e por período, reação rápida a problemas e mais avaliações positivas no Google.
- **Para quem é destinado:** clientes e administração.

### Referência de mercado

- **Suitable (Suit Ratings):** avaliação coletada pelo app de pedidos, tablets e totens, com perguntas configuráveis (estrelas, múltipla escolha e texto) separadas por produto, entrega e atendimento, num painel único.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `avaliacoes (id, pedido_id UNIQUE, nota_produto SMALLINT 1–5, nota_atendimento SMALLINT 1–5, comentario TEXT ≤ 500, origem ['qr_mesa','online','totem','cupom'], created_at)` e `avaliacao_itens (avaliacao_id, produto_id, nota)` (opcional, por produto).
- [ ] Pontos de coleta:
  - página de acompanhamento do pedido ([CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) e [CAF-000038](CAF-000038-pedido-online-para-retirada.md)), quando o pedido fica `entregue`;
  - **QR Code impresso na conta/comprovante** (`js/pedido-print.js`), que abre `avaliar.html?t=<token>` — funciona também para pedidos feitos pelo barista;
  - tela final do totem ([CAF-000040](CAF-000040-totem-de-autoatendimento-no-balcao.md)), opcional.
- [ ] RPC `registrar_avaliacao(p_token, p_payload)` para `anon`: token de uso único ligado ao pedido e válido por 48 h; uma avaliação por pedido.
- [ ] Nota ≥ 4: mostrar "Que bom! Pode deixar sua avaliação no Google?" com o link já configurado no site. Nota ≤ 2: mostrar "Sentimos muito. Quer que a gente entre em contato?" com campo de telefone opcional (com consentimento).
- [ ] Admin: aba "Avaliações" com média geral e por período, distribuição das notas, ranking de produtos por nota, lista de comentários com filtro (≤ 2 estrelas primeiro) e link para o pedido.
- [ ] Alerta no admin (e opcional no PDV) para avaliação ≤ 2 recebida no dia.

### Requisitos não funcionais
- [ ] **Anti-abuso:** token de uso único por pedido; sem token, não há avaliação.
- [ ] **Privacidade:** o comentário não é público; contato só com consentimento.
- [ ] **Leveza:** `avaliar.html` com < 50 KB de JS, funcionando bem em 3G.

### Dependências técnicas
- Token por pedido (o mesmo `pedido_token` da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), ou um gerado na impressão da conta).
- Biblioteca de QR Code já prevista na [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md).

### Recursos necessários
- Link de avaliação do Google da cafeteria (já usado no site).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a conta foi impressa com QR, **quando** o cliente escaneia e dá 5 estrelas, **então** a avaliação é gravada e aparece o convite para o Google.
- [ ] **Dado que** o cliente já avaliou aquele pedido, **quando** tenta avaliar de novo, **então** vê "Avaliação já registrada, obrigado!".
- [ ] **Dado que** chegou uma avaliação de 1 estrela, **quando** o admin abre o painel, **então** vê o alerta e o comentário no topo.
- [ ] **Dado que** houve 20 avaliações no mês, **quando** o admin abre o ranking, **então** vê a média por produto avaliado.

---

## O que a atividade não inclui

- Publicar as avaliações no site.
- Responder o cliente pelo sistema (o contato é manual).
- Pesquisa NPS com perguntas configuráveis (pode vir depois).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | QR na conta | Imprimir conta e escanear | Abre a avaliação do pedido certo |
| 2 | Nota alta | 5 estrelas | Convite para o Google |
| 3 | Nota baixa | 1 estrela | Oferta de contato + alerta no admin |
| 4 | Duplicada | Avaliar duas vezes | Segunda recusada |
| 5 | Token expirado | Avaliar depois de 48 h | Recusada |
| 6 | Sem token | Abrir `avaliar.html` sem `t` | Mensagem de link inválido |

---

## URL Complementar

- Código relacionado: `js/pedido-print.js`, `js/analytics.js` (clique em "Avaliar no Google")
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Suitable — Suit Ratings: https://suitable.com.br/marketing/suit-ratings/
