# Análise — Pedidos e organização da cozinha × mercado (Set/2026)

Levantamento feito a partir do código atual (`js/cozinha.js`, `js/pedidos.js`, `js/pedido-print.js`, `cozinha.html` e migrations em `supabase/`), comparado com os recursos de KDS e de produção dos concorrentes.
Continua o [FEATURES_PENDENTES.md](CONCLUIDAS/FEATURES_PENDENTES.md), onde as CAF-000001 a 000020 já foram entregues.

> **Sobre os concorrentes:**
> - **SAIPOS** é a referência principal (maior base de restaurantes do Brasil). Os recursos citados vêm da central de ajuda e do site oficial.
> - **Padrão de mercado de KDS:** Food Sistemas, Teknisa, Consumer e OlaClick.
> - **Suitable** (https://suitable.com.br) também tem KDS com cores por etapa, visão por produto, ordenação por prioridade, teclado e roteamento de impressão por setor, o que confirma as CAF-000022, 026, 028 e 029.
> - A comparação com **Kyte, Jarbas, Garfo, Simpliza e Suitable** (gestão: estoque, clientes, financeiro, pedido pelo cliente) está em [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md) (CAF-000031 a 000044).

---

## O que já temos (pedidos + cozinha)

- **PDV:**
  - Montagem com adicionais vinculados, meio a meio e observação.
  - Promoções e cortesias validadas no banco.
  - Fila offline idempotente.
  - Adicionar itens, cancelar item, transferir e juntar mesas, fechar e dividir conta.
- **KDS:**
  - 3 colunas (Pendentes / Em preparo / Prontos), filtro de estação (bar × cozinha) e marcação item a item.
  - Barra de progresso, impressão automática, som, voz e aviso de cancelamento.
  - Indicador de conexão e abas no mobile.
- **Banco:** log de auditoria, `iniciado_em`/`concluido_em`/`entregue_em` e relatórios de tempo médio de preparo.

---

## Comparativo com o mercado

| Recurso | SAIPOS | Padrão de mercado (KDS) | Cafeteria do Teatro | Gap → CAF |
|---|:-:|:-:|:-:|---|
| KDS em tempo real por status | ✅ | ✅ | ✅ | — |
| Setores/estações de produção independentes | ✅ | ✅ | ⚠️ Só filtra: "Pronto!" conclui o pedido inteiro | [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) |
| Opcionais, sabores e observações na via de produção | ✅ | ✅ | ⚠️ A comanda automática omite o meio a meio | [CAF-000023](CAF-000023-correcoes-comanda-e-chamada-por-voz.md) |
| Destaque de item lançado após a venda | ✅ (amarelo) | ✅ | ❌ Cortesia cai em "Prontos" sem aviso | [CAF-000024](CAF-000024-itens-lancados-depois-voltam-para-a-fila.md) |
| Prazo de produção com alerta de cor | ✅ (laranja/vermelho) | ✅ (por categoria) | ⚠️ Fixo em 15 min para tudo | [CAF-000025](CAF-000025-tempo-alvo-de-preparo-e-semaforo.md) |
| Visão consolidada/agrupada da produção | ⚠️ | ✅ | ❌ | [CAF-000026](CAF-000026-visao-consolidada-de-producao.md) |
| Tela de expedição / painel de senha para o cliente | ✅ | ✅ | ❌ Só voz sintetizada | [CAF-000027](CAF-000027-painel-de-senhas-retirada.md) |
| Impressão por setor, sem duplicidade | ✅ | ✅ | ⚠️ Toda tela aberta imprime tudo | [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md) |
| Prioridade/urgência e bump bar | ⚠️ | ✅ | ❌ | [CAF-000029](CAF-000029-prioridade-e-operacao-por-teclado.md) |
| Expedição (*bump*) e recall de pedidos | ✅ | ✅ | ⚠️ "Prontos" acumula o dia todo; recarga completa a cada evento | [CAF-000030](CAF-000030-atualizacao-incremental-do-kds.md) |
| Integração com delivery (iFood etc.) | ✅ | ✅ | ❌ | Fora do escopo (ver abaixo) |
| Cardápio digital / autoatendimento por QR | ✅ | ✅ | ❌ | [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) |
| Ficha técnica, estoque e CMV | ✅ | ⚠️ | ❌ | [CAF-000031](CAF-000031-controle-de-estoque.md) / [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md) |
| NFC-e | ✅ | ✅ | ❌ | Fora do escopo (ver abaixo) |

Legenda: ✅ tem · ⚠️ parcial ou não confirmado · ❌ não tem

---

## Principais necessidades (sinalização)

### 🔴 Prioridade alta: defeitos que já afetam a operação

| ID | Feature | Por que agora | Esforço |
|---|---|---|---|
| [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) | Conclusão independente por estação | O bar conclui a baguete da cozinha e o pedido é chamado pela metade. A regra de conclusão está no navegador (condição de corrida). | M |
| [CAF-000023](CAF-000023-correcoes-comanda-e-chamada-por-voz.md) | Comanda sem meio a meio, voz sem nome e `onclick` com apóstrofo | A cozinha recebe comanda incompleta. Nome com `'` quebra o botão, e o campo permite injetar script. | P |
| [CAF-000024](CAF-000024-itens-lancados-depois-voltam-para-a-fila.md) | Itens lançados depois voltam para a fila | Cortesia lançada num pedido pronto não é vista nem impressa. | M |

### 🟡 Prioridade média: paridade com o mercado

| ID | Feature | Valor | Esforço |
|---|---|---|---|
| [CAF-000025](CAF-000025-tempo-alvo-de-preparo-e-semaforo.md) | Tempo alvo por categoria/produto + semáforo | Um espresso atrasado passa hoje sem destaque. | M |
| [CAF-000026](CAF-000026-visao-consolidada-de-producao.md) | Visão consolidada de produção | Produção em lote no intervalo do espetáculo. | P |
| [CAF-000027](CAF-000027-painel-de-senhas-retirada.md) | Painel de senhas / TV de retirada | A voz não é ouvida no salão cheio, e o cliente acompanha o pedido pela TV. | M |
| [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md) | Tela impressora + comanda por estação | Acaba com comanda duplicada e com pedido sem impressão. | P |

### 🟢 Prioridade baixa: eficiência e escala

| ID | Feature | Valor | Esforço |
|---|---|---|---|
| [CAF-000029](CAF-000029-prioridade-e-operacao-por-teclado.md) | Prioridade de pedido + teclado/bump bar | Atende clientes com horário de espetáculo e dá operação sem toque. | P |
| [CAF-000030](CAF-000030-atualizacao-incremental-do-kds.md) | Atualização incremental + "Prontos" enxuta | Menos consultas, sem piscadas e rolagem preservada. | M |

---

## Ordem sugerida

**023 → 022 → 024 → 028 → 025 → 027 → 026 → 030 → 029**

- **023** é pequena e corrige segurança e a comanda. **022** é a base de 024, 026, 027 e 028 (estação gravada no item e conclusão no banco).
- **028** reaproveita a trava de impressão para a comanda complementar da 024.
- **027** (painel de senhas) só deve entrar depois da 022, para não anunciar pedidos incompletos.

---

## Fora do escopo desta rodada (recursos fortes da SAIPOS)

Esses itens aparecem entre os principais diferenciais da SAIPOS, mas são projetos grandes e com dependências externas. Ficam registrados para decisão do cliente:

- **Integração com delivery (iFood, 99Food, cardápio próprio com entrega):** exige homologação e credenciais do parceiro.
- **Autoatendimento por QR Code na mesa:** especificado na [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md).
- **Ficha técnica, estoque e CMV:** especificados na [CAF-000031](CAF-000031-controle-de-estoque.md) e na [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md).
- **NFC-e:** exige certificado digital e integração com provedor fiscal.
- **Impressão ESC/POS direta** (sem o diálogo do navegador): exige um app ou ponte local.

---

## Fontes

- SAIPOS — Tela KDS (Sistema de Display para Cozinha): https://meajuda.saipos.com/hc/pt-br/articles/20211492079252-Tela-KDS-Sistema-de-Display-para-Cozinha
- SAIPOS — Filtros e movimentações na tela de pedidos: https://meajuda.saipos.com/hc/pt-br/articles/20211500841108-Filtros-e-movimenta%C3%A7%C3%B5es-na-tela-de-pedidos
- SAIPOS — Monitor KDS: https://saipos.com/sistema/restaurante/monitor-kds-para-restaurante
- Food Sistemas — KDS: https://foodsistemas.com.br/funcionalidades/kds/
- Food Sistemas — Painel de produção: https://foodsistemas.com.br/funcionalidades/painel-de-producao-para-restaurantes/
- Teknisa — Sistema KDS: https://www.teknisa.com/blog/sistema-kds/
- SULTS — Comparativo de sistemas para restaurante 2026: https://www.sults.com.br/solucoes/gestao/5-melhores-sistemas-gestao-restaurantes
