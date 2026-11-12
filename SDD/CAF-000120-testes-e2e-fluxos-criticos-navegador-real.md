# [CHORE] Testes ponta a ponta em navegador real dos fluxos críticos (pedido → cozinha → fechamento → caixa)

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Criar uma suíte pequena de testes que abre as telas em um navegador de verdade, contra um banco local com as migrations aplicadas, e percorre o caminho do dinheiro de ponta a ponta.
- **Problema e evidência:** A suíte atual tem dois lados que nunca se encontram: os testes de front (`tests/`, 120+ arquivos) rodam em Happy DOM com o Supabase simulado por `tests/helpers/supabase-mock.js`, e os testes de banco (`supabase/tests/*.test.sql`) rodam as RPCs isoladas. O teste de contrato (CAF-000086) confere nomes de colunas e parâmetros contra um snapshot, mas o commit `94d6b99` mostra que uma RPC ainda chegou em produção usando colunas que não existiam. Não há Playwright nem ferramenta equivalente no projeto. Realtime entre PDV e KDS, impressão e service worker não são exercitados por nenhum teste.
- **Impacto de não fazer:** A classe de defeito "front e banco corretos isoladamente, quebrados juntos" continua só sendo encontrada em produção.
- **Para quem é destinado:** Desenvolvedor.
- **História de usuário:** Como desenvolvedor, quero um teste que faça um pedido real e feche a conta em um banco de teste, para saber antes do deploy que o fluxo principal funciona.
- **Como saberemos que deu certo:** 6 cenários ponta a ponta rodando no CI em menos de 5 min, bloqueando o deploy quando falham.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Ambiente local reproduzível: Supabase local (CLI/Docker) com todas as migrations e um seed mínimo (categorias, produtos, mesas, usuário admin e barista de teste) | P0 | CA01 |
| RF02 | Cenário 1: barista faz login, lança pedido na mesa, o pedido aparece no KDS em outra aba sem recarregar | P0 | CA02 |
| RF03 | Cenário 2: cozinha marca itens como prontos e o PDV mostra o pedido pronto | P0 | CA03 |
| RF04 | Cenário 3: fechamento de conta com duas formas de pagamento; mesa fica livre; total bate com o banco | P0 | CA04 |
| RF05 | Cenário 4: fechamento parcial por item (CAF-000112) seguido de fechamento do restante | P0 | CA05 |
| RF06 | Cenário 5: abertura e fechamento de caixa com o valor esperado igual à soma dos pagamentos do cenário 3 | P0 | CA06 |
| RF07 | Cenário 6: cliente faz pedido pelo cardápio/QR, barista aprova e o pedido entra na fila | P1 | CA07 |
| RF08 | Job no CI que sobe o ambiente, roda a suíte e guarda vídeo/trace em caso de falha | P0 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhum teste roda contra o banco de produção (regra do `PLANO_CORRECOES_E_TESTES.md`): a URL do Supabase é injetada por variável de ambiente no ambiente de teste | P0 | CA01 |
| RNF02 | Suíte completa em menos de 5 min no CI | P1 | CA08 |
| RNF03 | Credenciais de teste só em seed/fixtures do repositório, nunca credenciais reais | P0 | CA01 |

### Dependências técnicas

- `js/supabase-client.js` precisa aceitar URL/chave por configuração de ambiente (hoje aponta fixo para o projeto de produção).
- Manifesto de migrations da CAF-000116 (ordem única para subir o banco).
- Playwright como `devDependency`.

### Recursos necessários

- Docker no CI (já usado para o Postgres do pgTAP).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um clone limpo, quando rodo `npm run test:e2e`, então o ambiente sobe com migrations e seed e nenhuma requisição sai para o projeto de produção.
- [ ] **CA02:** Dado o PDV e o KDS abertos, quando o barista envia um pedido, então o card aparece no KDS em até 5 s sem recarregar.
- [ ] **CA03:** Dado um pedido na fila, quando a cozinha marca todos os itens como prontos, então o PDV mostra o pedido como pronto.
- [ ] **CA04:** Dado uma mesa com pedidos, quando fecho com Pix + dinheiro, então a mesa fica livre e a soma dos pagamentos no banco é igual ao total da conta.
- [ ] **CA05:** Dado uma mesa com 3 itens, quando pago 1 item e depois o restante, então a mesa só fica livre após o segundo pagamento e não há item pago duas vezes.
- [ ] **CA06:** Dado o caixa aberto e os pagamentos do CA04, quando fecho o caixa, então o valor esperado por forma de pagamento bate com os pagamentos.
- [ ] **CA07:** Dado um pedido feito pelo cliente via QR, quando o barista aprova, então o pedido aparece no KDS; quando recusa, não aparece.
- [ ] **CA08:** Dado uma falha em qualquer cenário, quando o CI termina, então o deploy é bloqueado e o trace fica disponível como artefato.

## O que a atividade não inclui

- Substituir os testes de Happy DOM: motivo: continuam sendo a base rápida; o e2e cobre só o caminho crítico.
- Teste de impressão física: motivo: depende de hardware.
- Testes visuais (comparação de screenshot): motivo: prematuro.

### Considerado para o futuro (P2)

- Cenário de queda de rede (fila offline) e de dois baristas na mesma mesa.
- Execução em viewport de celular e tablet.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Supabase local completo (Auth + Realtime via CLI) ou só Postgres + PostgREST? Realtime é necessário para o CA02 | dev | Sim | |
| D02 | Como injetar URL/chave em `js/supabase-client.js` sem mudar o comportamento de produção (variável do Vite ou arquivo de config substituído no teste)? | dev | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Ambiente isolado | e2e | CA01 | Subir e interceptar rede | 0 requisições ao host de produção |
| CT02 | Pedido chega ao KDS | e2e | CA02 | Duas abas, enviar pedido | Card no KDS em até 5 s |
| CT03 | Pronto volta ao PDV | e2e | CA03 | Marcar itens prontos | PDV mostra pronto |
| CT04 | Fechamento com 2 formas | e2e | CA04 | Fechar com Pix + dinheiro | Mesa livre; soma correta |
| CT05 | Fechamento parcial | e2e | CA05 | Pagar 1 item, depois o resto | Sem duplicidade |
| CT06 | Caixa confere | e2e | CA06 | Abrir, vender, fechar | Esperado = pagamentos |
| CT07 | Pedido do cliente | e2e | CA07 | QR → aprovar/recusar | Entra/não entra na fila |
| CT08 | Falha bloqueia deploy | integração (CI) | CA08 | Forçar falha em branch de teste | Deploy não roda; trace salvo |

## URL Complementar

- Documentação técnica: `tests/helpers/supabase-mock.js`, `js/supabase-client.js`, `.github/workflows/deploy.yml`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000099](CONCLUIDAS/CAF-000099-suite-de-testes-efetiva-codigo-real-contrato-e-pgtap.md), [CAF-000105](CONCLUIDAS/CAF-000105-testes-fluxo-completo-pedidos-aleatorios.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: commit `94d6b99`
