# CAF-000057 — [PDV] [Mobile] Confiabilidade móvel: carrinho salvo em rascunho e faixa de offline clara

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + CSS + HTML) | 🟡 Média (P1) | P | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  1. **Persistência do carrinho em montagem:** Salvar o estado completo do carrinho no `localStorage` (`cafeteria_pdv_carrinho_rascunho`) a cada alteração:
     - Mesa selecionada;
     - Lista de itens com adicionais, sabores, observações e quantidades;
     - Nome do cliente e checkbox "Para Viagem";
     - Observações gerais do pedido e forma de pagamento prévia;
     - Ao carregar o PDV, restaurar automaticamente o rascunho.
     - Ao enviar o pedido com sucesso ou limpar explicitamente, remover o rascunho do `localStorage`.
  2. **Faixa visual destacada de modo offline:**
     - Quando a conexão cair (`window.addEventListener('offline')` ou falha de ping no Supabase), exibir uma faixa fina de topo (banner amarelo/âmbar): `⚡ Sem internet. Seus pedidos continuam funcionando e serão enviados automaticamente assim que reconectar.`
     - Ao reconectar, exibir brevemente em verde: `✓ Conexão restabelecida. Sincronizando pedidos...`
- **Por que é necessário:** 
  - Celulares em salão sofrem frequentes oscilações de sinal Wi-Fi e 4G/5G.
  - No iOS/Android, trocar de aplicativo (ex.: para checar mensagem ou receber ligação) faz o navegador matar a aba por falta de memória RAM. Ao voltar, a página recarrega e o garçom perde todos os 4 ou 5 itens que havia acabado de digitar na mesa do cliente.
  - O indicador de offline atual é apenas uma bolinha de 8px discreta no cabeçalho (`pedidos.html:54-57`), que não deixa claro para o garçom que o sistema continua funcionando offline com segurança.
- **Qual valor será agregado:** Zero perda de pedidos por recarregamento acidental e tranquilidade para o atendente operar mesmo em áreas de sombra de sinal do salão.
- **Para quem é destinado:** Garçons e baristas.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] No `js/pedidos.js`, criar funções `salvarRascunhoCarrinho()` e `restaurarRascunhoCarrinho()`.
- [x] Invocar `salvarRascunhoCarrinho()` em mutações de `cart`, `mesaId`, `obsGeral`, `nomeCliente`, `paraViagem`.
- [x] No início do carregamento de `pedidos.js`, verificar existência de rascunho e repovoar as variáveis e a interface do carrinho caso haja itens.
- [x] No envio bem-sucedido (seja online ou enfileirado na fila offline idempotente da CAF-000018), limpar o rascunho com `localStorage.removeItem('cafeteria_pdv_carrinho_rascunho')`.
- [x] Criar banner de alerta offline `#banner-offline-alert` no topo da tela do PDV:
  - Estilo discreto mas visível (fundo âmbar com texto escuro e ícone de raio/nuvem cortada);
  - Texto esclarecedor indicando que os pedidos estão seguros;
  - Desaparece automaticamente com animação suave ao voltar para o estado conectado.

### Requisitos não funcionais
- [x] **Desempenho:** Gravação assíncrona ou debounced em `localStorage` para evitar bloqueios de thread durante digitação rápida de observações.
- [x] **Limpeza de dados velhos:** Se o rascunho salvo tiver mais de 12 horas, descartar para não recuperar pedidos do dia anterior.

### Dependências técnicas
- Código relacionado: `js/pedidos.js`, `pedidos.html:37-62`, `css/pedidos.css`.
- Alinhamento com: CAF-000018 (Tolerância a queda de internet).
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Itens E1 e E2).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom adiciona 3 bebidas personalizadas e a tela do smartphone apaga ou a aba recarrega, **quando** ele reabre o PDV, **então** os 3 itens e a mesa continuam intactos no carrinho.
- [x] **Dado que** o garçom clica em "Enviar para Cozinha", **quando** o pedido é aceito (ou gravado na fila offline), **então** o carrinho é esvaziado e o rascunho é deletado do `localStorage`.
- [x] **Dado que** a cafeteria perde o sinal de internet, **quando** o garçom olha para a tela, **então** uma faixa superior informa claramente que o sistema continua operando offline e que os pedidos serão sincronizados.
