# [CHORE] CAF-000093 — Cobertura de Testes Unitários da Camada de Dados, Cache Local e Fila Offline

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** PO (Natanael) · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-22

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar suíte de testes unitários e funcionais cobrindo a camada de dados (`js/db.js`), os mecanismos de cache seguro (mitigação de cleartext CWE-312 e sanitização de chaves permitidas) e a persistência/sincronização da fila offline de pedidos do PDV (`js/pedidos.js` / IndexedDB com fallback em `localStorage`). As rotinas devem ser modularizadas/exportadas de modo que os testes importem o código real da aplicação (não verificação estática via regex).

- **Problema e evidência:**
  O relatório oficial de cobertura do Vitest (`npm run test:coverage`) aponta **0% de cobertura** para `js/db.js` e `js/pedidos.js`. Testes legados da CAF-000018 verificam apenas padrões regex em texto cru (`fs.readFileSync`), sem exercitar a gravação em armazenamento, deserialização de cache, tratamento de erros ou a sincronização da fila offline em cenários de queda de conexão.

- **Impacto de não fazer:**
  Sem testes unitários reais, alterações em `js/db.js` ou nos fluxos de pedido podem quebrar silenciosamente o funcionamento offline do PDV, corromper o cache do navegador dos clientes ou descartar pedidos realizados em momentos de instabilidade de internet na cafeteria.

- **Para quem é destinado:**
  Baristas, operadores de caixa e desenvolvedores do sistema.

- **História de usuário:**
  Como operador de atendimento ou barista, quero ter a garantia de que o sistema armazena pedidos com segurança localmente em caso de instabilidade de rede e mantém o cache consistente, para que nenhuma venda seja perdida e o PDV continue operando de forma confiável.

- **Como saberemos que deu certo:**
  1. Suíte automatizada `tests/caf-000093-camada-dados-cache-offline.test.js` criada e executando código real da aplicação.
  2. 100% dos testes passando em `npm test` e `npm run test:coverage`.
  3. Cobertura da camada de cache e gestão de fila offline atingindo o threshold estabelecido.
  4. `npm run build` executando com 100% de sucesso sem quebrar scripts para o navegador.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RF01 | Testar o módulo de cache (`db.cache.set` e `db.cache.get`), garantindo persistência apenas de chaves permitidas (`ALLOWED_CACHE_KEYS`) e codificação em base64 para mitigação de cleartext (CWE-312). | P0 | CA01, CA02 |
| RF02 | Testar a resiliência do cache contra dados corrompidos ou JSON malformado no `localStorage`, assegurando retorno seguro de `null` sem disparar uncaught exceptions. | P0 | CA03 |
| RF03 | Testar o isolamento do painel administrativo, impedindo gravação de cache público quando executado em telas de admin. | P1 | CA04 |
| RF04 | Testar as operações de persistência da fila offline de pedidos (`dbSalvarPedidoOffline`, `dbObterFilaOffline`, `dbRemoverPedidoOffline` e `dbAtualizarStatusPedidoOffline`), incluindo mecanismo de fallback em `localStorage` quando IndexedDB não estiver disponível. | P0 | CA05, CA06, CA07 |
| RF05 | Testar o fluxo de processamento e sincronização da fila offline (`processarFilaOffline`), validando despacho correto para o backend e atualização de contadores de pendências. | P0 | CA08, CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RNF01 | Os testes devem executar em ambiente simulado `happy-dom` sem necessidade de conexão real com a internet ou servidor externo Supabase. | P0 | CA10 |
| RNF02 | O código em `js/db.js` e `js/pedidos.js` deve manter compatibilidade universal (IIFE no browser e exportação modular limpa para Node/Vitest). | P0 | CA11 |
| RNF03 | O tempo de execução da nova suíte no Vitest deve ser inferior a 1,5 segundos. | P1 | CA10 |

### Dependências técnicas

- `js/db.js`
- `js/pedidos.js`
- `tests/setup.js` e configuração do Vitest (`vitest.config.js`)

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o sistema tenta gravar um dado em `db.cache.set`, quando a chave é permitida (ex: `cafeteria_settings_cache`), então o valor é sanitizado, serializado em JSON, codificado em base64 e armazenado no `localStorage`.
- [x] **CA02:** Dado que o sistema tenta gravar um dado em `db.cache.set`, quando a chave não pertence à lista de chaves permitidas (`ALLOWED_CACHE_KEYS`), então a gravação é rejeitada e nada é salvo no `localStorage`.
- [x] **CA03:** Dado que o `localStorage` contém um valor corrompido (base64 inválido ou JSON malformado), quando `db.cache.get` é invocado, então a função retorna `null` de forma segura e emite aviso controlado no logger, sem lançar exceção não tratada.
- [x] **CA04:** Dado que o código está sendo executado em uma rota administrativa (`admin.html`), quando `db.cache.set` for chamado, então a gravação deve ser bloqueada para não misturar estado de administração com cache público.
- [x] **CA05:** Dado que o PDV está operando e um pedido é gerado sem conexão, quando `dbSalvarPedidoOffline` é chamado, então o pedido é persistido na fila local com seu `client_id` único, timestamp e status de pendente.
- [x] **CA06:** Dado que existem pedidos gravados na fila offline, quando `dbObterFilaOffline` é chamado, então retorna a lista ordenada de pedidos pendentes para sincronização.
- [x] **CA07:** Dado que o ambiente não dispõe de IndexedDB (ou a abertura falha), quando pedidos offline são manipulados, então o sistema utiliza automaticamente o fallback de persistência em `localStorage` sem perda de integridade.
- [x] **CA08:** Dado que um pedido offline foi sincronizado com sucesso pelo backend, quando `dbRemoverPedidoOffline` é chamado, então ele é removido da fila local e o contador de itens pendentes é decrementado.
- [x] **CA09:** Dado que um pedido offline falha na sincronização por erro temporário de rede, quando `dbAtualizarStatusPedidoOffline` é executado, então o erro é registrado no item da fila sem descartar o pedido.
- [x] **CA10:** Todos os 9 cenários acima devem ser validados através da suíte automatizada `tests/caf-000093-camada-dados-cache-offline.test.js` importando as funções reais da aplicação.
- [x] **CA11:** Os comandos `npm test` e `npm run build` devem rodar com 100% de sucesso sem quebras.

---

## O que a atividade não inclui

- Alteração da estrutura de tabelas no banco de dados Supabase (foco exclusivo em infraestrutura de testes e modularização da camada cliente).
- Refatoração dos arquivos de tela do PDV para frameworks modernos (mantido Vanilla JS / Vite).
