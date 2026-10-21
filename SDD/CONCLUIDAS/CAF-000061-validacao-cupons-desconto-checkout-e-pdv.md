# [FEAT] CAF-000061 — Validação e Aplicação de Cupons de Desconto no Autoatendimento e PDV

> **Status:** Concluída com ressalvas
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-21
> **Ressalvas:** Uso único por pedido e rastreio de cupom no fechamento corrigidos via CAF-000077.

## Detalhes da Atividade

- **O que precisa ser feito:** Permitir que clientes (no Cardápio Digital de Mesa/Online e no Totem) e operadores (no PDV em `pedidos.html`) informem um código de cupom promocional vinculado a uma campanha ativa (`campanhas.cupom_codigo`), aplicando o desconto correspondente ao pedido e contabilizando automaticamente o uso e a receita atribuída na campanha (`usos_registrados` e `receita_atribuida`).
- **Problema e evidência:** A tarefa `CAF-000041` criou a tabela `campanhas` com o campo `cupom_codigo` (ex.: `VOLTEI10`), mas a validação automática no checkout ficou fora do escopo inicial, exigindo lançamento manual pelo barista e preenchimento manual dos resultados da campanha no Admin.
- **Impacto de não fazer:** O cliente que recebe uma campanha no WhatsApp não consegue aplicar o próprio cupom no autoatendimento (Mesa, Retirada ou Totem), gerando atrito no balcão e subnotificação do ROI das campanhas no CRM.
- **Para quem é destinado:** Cliente final (autoatendimento no `cardapio.html` e `totem.html`), barista/caixa (`pedidos.html`) e gestor de marketing (`admin.html`).
- **História de usuário:** Como cliente que recebeu um cupom promocional, quero digitar o código do cupom ao fazer meu pedido ou fechar a conta, para receber o desconto imediatamente sem depender de ajuste manual no caixa.
- **Como saberemos que deu certo:** Aplicação de cupom válido em até 1 toque após digitar o código, cálculo exato do desconto no total do pedido e incremento automático de `usos_registrados` e `receita_atribuida` em `campanhas` com 0 erros no console.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Adicionar campos opcionais `tipo_desconto` (`percentual` \| `valor_fixo`), `valor_desconto` (`NUMERIC(10,2)`), `valor_minimo_pedido` (`NUMERIC(10,2)`) e `ativa` (`BOOLEAN DEFAULT true`) na tabela `campanhas`, além de `cupom_codigo` e `campanha_id` na tabela `pedidos` | P0 | CA01, CA02 |
| RF02 | Disponibilizar campo "Cupom de desconto" + botão "Aplicar" no modal de envio de pedido do `cardapio.html` (Mesa e Online) e do `totem.html` | P0 | CA02, CA03 |
| RF03 | Disponibilizar campo de cupom promocional no modal de Fechamento de Conta em `pedidos.html` que preenche automaticamente o desconto da conta | P0 | CA04 |
| RF04 | Ao confirmar/pagar um pedido com cupom válido, gravar `cupom_codigo`, `campanha_id` e `desconto` no pedido e incrementar `usos_registrados` (+1) e `receita_atribuida` (+total líquido do pedido) na tabela `campanhas` | P0 | CA05 |
| RF05 | Permitir configurar no formulário de Nova Campanha (`js/admin/clientes-admin.js`) o tipo e o valor de desconto do cupom (ex.: `10%` ou `R$ 5,00`) e o pedido mínimo | P1 | CA01 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A busca do cupom deve ser case-insensitive (`UPPER(TRIM(codigo))`) e responder em `< 500ms` | P0 | CA02, CA03 |
| RNF02 | Não expor dados sensíveis de campanhas ou lista de clientes na consulta pública de validação de cupom (usar RPC ou filtro restrito por `cupom_codigo` + `ativa = true`) | P0 | CA02, CA03 |

### Dependências técnicas

- Tabela `campanhas` criada na `CAF-000041` (`supabase/migration_caf_000041_crm_campanhas.sql`).
- Fluxos de checkout em `js/cardapio.js`, `js/totem.js`, `js/pedidos.js` e `js/admin/clientes-admin.js`.

### Recursos necessários

- Migration SQL no Supabase para adicionar colunas de configuração de desconto em `campanhas` e RPC de validação/aplicação de cupom.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o gestor cria uma campanha no CRM (`admin.html` → Clientes → Campanhas) informando o código `TEATRO10`, tipo `percentual` e valor `10`, quando salvar a campanha, então ela deve ficar ativa com esses parâmetros persistidos no banco.
- [x] **CA02:** Dado que o cliente no `cardapio.html` ou `totem.html` possui itens na sacola que atingem o valor mínimo e digita `teatro10`, quando tocar em "Aplicar", então o sistema deve exibir o desconto de 10% calculado sobre o subtotal e atualizar o valor final do pedido.
- [x] **CA03:** Dado que o cliente digita um cupom inexistente, inativo ou cujo pedido está abaixo do `valor_minimo_pedido`, quando tocar em "Aplicar", então o sistema não deve aplicar desconto e deve exibir mensagem clara informando o motivo.
- [x] **CA04:** Dado que o operador está fechando uma conta em `pedidos.html`, quando informar um cupom válido no fechamento, então o desconto da conta deve ser preenchido automaticamente com base na regra do cupom.
- [x] **CA05:** Dado que um pedido com cupom aplicado tem seu pagamento confirmado (ou é enviado com cupom), quando a operação concluir, então `usos_registrados` e `receita_atribuida` da campanha correspondente devem ser incrementados automaticamente apenas uma vez por pedido.

## O que a atividade não inclui

- Regras cumulativas de múltiplos cupons no mesmo pedido: motivo: complexidade desnecessária para a operação atual (1 cupom por pedido é suficiente).
- Restrição de cupom por produto específico (apenas desconto sobre o pedido inteiro): motivo: mantém o checkout simples e rápido.

### Considerado para o futuro (P2)

- Cupom de uso único por CPF/telefone do cliente.
- Cupom de "compre X ganhe Y" por categoria.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | A contabilização de `usos_registrados` e `receita_atribuida` deve ocorrer já no envio do pedido (com cupom) ou no fechamento/pagamento da conta? | PO | Não | Padrão proposto: contabilizar no fechamento pago no PDV (ou no envio quando já vier do autoatendimento com controle para não duplicar no fechamento). |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Criar campanha com cupom de 10% | Manual / Integração | CA01 | Abrir Admin → Clientes → Nova Campanha → criar `VOLTEI10` com 10% de desconto e mínimo R$ 20 | Campanha criada com sucesso e listada como ativa |
| CT02 | Aplicar cupom válido no cardápio digital | Manual / E2E | CA02 | Adicionar R$ 30 na sacola em `cardapio.html?modo=retirada`, digitar `voltei10` e clicar em Aplicar | Desconto de R$ 3,00 exibido e total atualizado para R$ 27,00 |
| CT03 | Rejeitar cupom inválido ou abaixo do mínimo | Manual | CA03 | Com R$ 12 na sacola, tentar aplicar `VOLTEI10` (mínimo R$ 20) ou `CUPOMFALSO` | Mensagem de erro exibida e desconto permanece R$ 0,00 |
| CT04 | Fechar conta com cupom e conferir ROI no CRM | Integração | CA04, CA05 | Fechar pedido com `VOLTEI10` em `pedidos.html` e abrir aba Campanhas em `admin.html` | `usos_registrados` sobe em +1 e `receita_atribuida` soma o total líquido do pedido |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000041-crm-segmentacao-e-tags.md`
- Requisitos originais: Item P2 da `CAF-000041`
