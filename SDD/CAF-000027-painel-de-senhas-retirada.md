# CAF-000027 — [Salão] [Cozinha] Painel de senhas / TV de retirada para o cliente

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Nova tela pública (TV) + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar uma tela `retirada.html`, pensada para uma TV ou tablet virado para o salão, com duas colunas: **"Preparando"** e **"Pronto — retire no balcão"**. Ela mostra o número do pedido e o primeiro nome do cliente, e toca um sinal quando um pedido fica pronto.
- **Por que é necessário:** hoje a chamada depende só da voz sintetizada no celular do barista ou no tablet da cozinha (`js/pedidos.js:2797`, `js/cozinha.js:209`). No intervalo de um espetáculo, com o salão cheio e barulhento, a voz não é ouvida, e o barista precisa ir até o cliente. Pedidos para viagem com nome ([CAF-000010](CONCLUIDAS/CAF-000010-nome-do-cliente-pedido-para-viagem.md)) já existem, mas nada os mostra ao cliente.
- **Qual valor será agregado:** o cliente acompanha o próprio pedido, a fila no balcão diminui, o barista para de ser interrompido com "o meu já saiu?" e o fluxo de retirada ganha cara profissional.
- **Para quem é destinado:** clientes no balcão e para viagem, e baristas.

### Referência de mercado

- **SAIPOS:** o KDS integra com uma **tela de expedição que exibe a senha do pedido para retirada no balcão**.
- **Padrão de mercado (fast food e cafeterias):** o *order status board* com "Preparando / Pronto", que vira um espaço de comunicação da casa quando está ocioso.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Nova página `retirada.html` + `js/retirada.js` + `css/retirada.css`, em tela cheia e sem interação obrigatória.
- [ ] Colunas:
  - **Preparando:** pedidos `pendente` e `em_preparo` do dia.
  - **Pronto:** pedidos `concluido` dos últimos N minutos (configurável, padrão 10). Somem ao virar `entregue` ou quando o tempo expira.
- [ ] Identificação: `#numero_pedido` e o **primeiro nome** de `cliente_nome` (nunca o nome completo). Pedidos de mesa podem ser ocultados por configuração (padrão: mostrar só balcão e viagem).
- [ ] Pedido que acabou de ficar pronto aparece em destaque (animação de entrada, fonte maior por 15 s) e toca `assets/audio/ding.wav`.
- [ ] Dados via **view pública mínima** `v_painel_retirada (numero_pedido, primeiro_nome, status, pronto_em)`, restrita aos pedidos do dia, com `SELECT` permitido para `anon`. Nenhum outro campo do pedido (itens, valores, mesa, operador) fica exposto.
- [ ] Atualização por realtime, com *polling* de reserva a cada 15 s se o canal cair.
- [ ] Rodapé opcional com mensagem ou logo configurável no admin (ex.: "Hoje no Teatro: …").
- [ ] Botão "📺 Abrir painel de retirada" no admin (Configurações), com instruções para deixar a TV em tela cheia.

### Requisitos não funcionais
- [ ] **Privacidade (LGPD):** exibir só o primeiro nome, apenas no dia e sem dados de consumo.
- [ ] **Segurança:** a view não expõe `id` interno nem permite filtros além do dia. RLS da tabela `pedidos` inalterada.
- [ ] **Robustez:** recarregar sozinha uma vez por dia (madrugada) e continuar funcionando após queda de rede, com aviso discreto de "reconectando".
- [ ] **Legibilidade:** números com ≥ 64 px numa TV de 32", contraste AA e sem rolagem (excedentes em rodízio).
- [ ] Não entrar no `sitemap.xml` e ter `noindex`.

### Dependências técnicas
- `numero_pedido`, `cliente_nome` e `para_viagem` em `pedidos`.
- Depende da conclusão correta do pedido ([CAF-000022](CAF-000022-conclusao-independente-por-estacao.md)), para não mostrar "Pronto" com metade do pedido.
- Build: incluir `retirada.html` nas entradas do `vite.config.js`.

### Recursos necessários
- TV ou tablet no salão com navegador (Chromecast, Fire TV ou smart TV com browser).
- Decisão do cliente: mostrar pedidos de mesa ou só balcão e viagem?

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido para viagem da "Ana Paula Souza" está em preparo, **quando** a TV está aberta, **então** aparece "#45 Ana" em "Preparando".
- [ ] **Dado que** a cozinha conclui o pedido, **quando** o evento chega, **então** "#45 Ana" vai para "Pronto" com destaque e som em até 3 s.
- [ ] **Dado que** o barista marca como entregue, **quando** o evento chega, **então** o pedido some do painel.
- [ ] **Dado que** alguém consulta `v_painel_retirada` como `anon`, **quando** tenta ler valores, itens ou pedidos de outro dia, **então** não consegue.
- [ ] **Dado que** a internet cai por 1 min, **quando** volta, **então** o painel se atualiza sem recarregar manualmente.

---

## O que a atividade não inclui

- Aviso ao cliente por WhatsApp ou SMS.
- Autoatendimento ou pedido pelo QR Code.
- Chamada por voz na TV (a voz continua no PDV e na cozinha).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Preparando | Lançar pedido viagem com nome | Aparece em Preparando |
| 2 | Pronto | Concluir na cozinha | Move para Pronto + som |
| 3 | Entregue | Marcar entregue no PDV | Some |
| 4 | Expiração | Esperar N minutos sem entregar | Some de Pronto |
| 5 | Privacidade | Nome completo | Só o primeiro nome |
| 6 | Mesa | Pedido de mesa com a config padrão | Não aparece |
| 7 | Segurança | `select *` na view como anon | Só as colunas mínimas |
| 8 | Queda de rede | Desligar e religar o Wi-Fi | Atualiza sozinho |
| 9 | Muitos pedidos | 30 prontos | Rodízio, sem rolagem |

---

## URL Complementar

- Código relacionado: `js/cozinha.js:209-238` e `js/pedidos.js:2797-2828` (chamada por voz), `supabase/migration_caf_000021_cliente_viagem.sql`
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- SAIPOS — Tela KDS e tela de expedição com senha: https://meajuda.saipos.com/hc/pt-br/articles/20211492079252-Tela-KDS-Sistema-de-Display-para-Cozinha
