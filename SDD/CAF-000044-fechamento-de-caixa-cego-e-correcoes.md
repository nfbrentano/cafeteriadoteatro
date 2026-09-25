# CAF-000044 — [Bug] [Caixa] Fechamento de caixa cego e correção do contrato entre tela e banco

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin (caixa) + banco | 🔴 Alta | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Corrigir as incompatibilidades entre `js/admin/caixa-admin.js` e `supabase/migration_caf_000025_caixa.sql`, que impedem o caixa da [CAF-000015](CONCLUIDAS/CAF-000015-fechamento-de-caixa-do-dia.md) de funcionar como especificado.
  2. Tornar a conferência **cega**: o operador informa quanto contou **sem ver** o valor esperado. O sistema calcula a diferença no banco e só mostra o resultado depois de confirmado.
- **Por que é necessário:**
  - A tela mostra o valor esperado e **já preenche o campo "contado" com ele** (`js/admin/caixa-admin.js:256-262`). Confirmar sem contar grava diferença zero, e a conferência perde o sentido.
  - O valor esperado é calculado **no navegador** e enviado pronto (`valor_sistema`, `diferenca` — `js/admin/caixa-admin.js:302-311`), então pode ser adulterado.
  - Front e migration do repositório não batem (ver análise abaixo). Se a produção estiver igual ao arquivo, a tela não carrega os totais e não fecha o caixa.
- **Qual valor será agregado:** a diferença de caixa fica confiável e auditável, e o caixa volta a funcionar de ponta a ponta.
- **Para quem é destinado:** baristas (quem fecha) e administração.

### Análise da causa

Comparando o arquivo `supabase/migration_caf_000025_caixa.sql` com o front:

1. **`get_totais_caixa` tem erro de SQL:** `FROM public.caixas WHERE c.id = p_caixa_id` usa o alias `c` sem declará-lo.
2. **Formato da resposta:** a RPC devolve **um objeto** JSONB (`{fundo_troco, sangrias, suprimentos, pagamentos:{forma: total}}`), mas o front faz `data.forEach(row => row.metodo / row.total)`, como se fosse uma lista (`js/admin/caixa-admin.js:84-95`, `:242-245`).
3. **`get_caixa_atual` não devolve `total_entradas` nem `total_saidas`**, que o front usa (`:63-64`, `:249-252`). O resultado vira `NaN`/R$ 0.
4. **Nomes das formas de pagamento:** o front usa `credito`/`debito` (`:239`), mas o banco usa `cartao_credito`/`cartao_debito` (`supabase/pedidos_schema.sql:102`). `outros` nunca aparece.
5. **Conferência:** o front insere `metodo_pagamento` direto em `caixa_conferencia` (`:319`), mas a coluna se chama `forma_pagamento`.
6. **`fechar_caixa`:** o front chama com `p_fechado_por` (`:323-327`), mas a assinatura é `(p_caixa_id, p_valores_informados, p_observacoes)`, e a própria RPC já grava a conferência. Resultado: função não encontrada, ou conferência gravada duas vezes.
7. **Vendas de balcão fora do total:** a soma considera só `fechamento_pagamentos` (fechamento de mesa). Pedidos de balcão pagos na criação (`pedidos.status_pagamento = 'pago'` sem fechamento) não entram no esperado.

> ⚠️ Antes de implementar, confirme no Supabase de produção se as funções estão iguais ao arquivo (`\df+ get_totais_caixa`). Se foram corrigidas direto no banco, a migration do repositório precisa ser atualizada do mesmo jeito.

### Referência de mercado

- **Suitable:** controle de caixa com abertura e fechamento organizados e **auditoria cega** para reduzir divergências; vários caixas com visão individual e consolidada.
- **Garfo:** caixa com sangria, suprimento e auditoria.
- **Simpliza:** fechamento por dia, hora e usuário.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Reescrever `get_totais_caixa(p_caixa_id)` corrigindo o alias e somando:
  - `fechamento_pagamentos` do período do caixa;
  - pedidos pagos na criação e sem fechamento, no período, por `forma_pagamento`;
  - sangrias e suprimentos.
  Devolver uma lista `[{forma, total_vendas}]` mais `fundo_troco`, `sangrias`, `suprimentos` e `dinheiro_esperado`, com os nomes de forma do banco.
- [ ] `get_caixa_atual` passa a devolver `total_suprimentos` e `total_sangrias` (ou o front passa a usar `get_totais_caixa`, mas só um dos dois).
- [ ] Nova assinatura `fechar_caixa(p_caixa_id UUID, p_contagem JSONB, p_observacoes TEXT)`, com `p_contagem = [{forma, valor_informado}]`:
  - calcula `valor_sistema` e `diferenca` **no banco**, com a mesma lógica de `get_totais_caixa`;
  - grava `caixa_conferencia` e fecha o caixa na mesma transação;
  - devolve o resultado da conferência para a tela.
  O front deixa de inserir em `caixa_conferencia` direto e a policy de `INSERT` da tabela é removida.
- [ ] **Conferência cega** na tela "Fechar caixa":
  - campos de contagem vazios, sem valor esperado e sem diferença visível;
  - para dinheiro, contagem opcional por cédula e moeda (quantidade × valor, somada automaticamente);
  - depois de confirmar, mostra esperado × contado × diferença por forma e imprime o resumo.
- [ ] Configuração `caixa_conferencia_cega` (padrão **sim**). Com "não", mantém a tela atual, mas também com o cálculo no banco.
- [ ] Diferença acima de um limite configurável (ex.: R$ 5,00) exige observação e fica destacada no admin e no log de auditoria ([CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md)).
- [ ] Histórico de caixas no admin: data, operador de abertura e fechamento, esperado, contado e diferença por forma.

### Requisitos não funcionais
- [ ] **Segurança:** o valor esperado nunca sai do banco antes da confirmação quando a conferência é cega. A RPC que o expõe (`get_totais_caixa`) fica restrita a `admin` nesse modo; o operador usa uma versão sem os totais por forma.
- [ ] **Compatibilidade:** migration nova (`migration_caf_000044_caixa_fix.sql`) com `CREATE OR REPLACE` e `DROP FUNCTION` da assinatura antiga, rodando sem erro tanto num banco igual ao arquivo quanto num banco corrigido à mão.

### Dependências técnicas
- `caixas`, `caixa_movimentos`, `caixa_conferencia`, `fechamentos`, `fechamento_pagamentos`, `pedidos`.
- A [CAF-000034](CAF-000034-conta-do-cliente-fiado-e-creditos.md) (conta do cliente) e a [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md) (taxas) vão usar este cálculo, então esta entra antes delas.

### Recursos necessários
- Acesso ao SQL Editor do Supabase de produção para conferir as funções atuais.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o caixa foi aberto com R$ 100 de troco, houve R$ 250 em vendas em dinheiro (mesa + balcão), R$ 50 de sangria e R$ 20 de suprimento, **quando** o admin consulta os totais, **então** o dinheiro esperado é R$ 320.
- [ ] **Dado que** a conferência cega está ligada, **quando** o barista abre "Fechar caixa", **então** os campos estão vazios e nenhum valor esperado aparece na tela nem na resposta da rede.
- [ ] **Dado que** o barista informa R$ 315 em dinheiro, **quando** confirma, **então** o banco grava esperado R$ 320 e diferença −R$ 5, e a tela mostra o resultado.
- [ ] **Dado que** alguém envia `valor_sistema` ou `diferenca` pela API, **quando** a RPC processa, **então** esses campos são ignorados.
- [ ] **Dado que** houve vendas no crédito e no débito, **quando** os totais são exibidos, **então** aparecem nas linhas certas (sem se perder por causa do nome da forma de pagamento).

---

## O que a atividade não inclui

- Vários caixas abertos ao mesmo tempo (o índice `uk_caixa_aberto` continua permitindo só um).
- Integração com banco ou maquininha para conciliação automática.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Totais | Abrir, vender em várias formas, sangria e suprimento | Esperado correto por forma |
| 2 | Balcão | Pedido de balcão pago na criação | Entra no total |
| 3 | Cego | Abrir o fechamento como barista | Sem valores esperados na tela nem na rede |
| 4 | Diferença | Contar a menos | Diferença negativa gravada pelo banco |
| 5 | Adulteração | Enviar `diferenca: 0` via API | Ignorado |
| 6 | Limite | Diferença de R$ 10 sem observação | Bloqueado |
| 7 | Cédulas | Contagem por cédula | Soma correta |
| 8 | Migration | Rodar em banco igual ao arquivo e em banco já corrigido | Sem erro nos dois |
| 9 | Modo aberto | Conferência cega desligada | Tela atual com cálculo no banco |

---

## URL Complementar

- Código relacionado: `js/admin/caixa-admin.js:25-110`, `:234-330`; `supabase/migration_caf_000025_caixa.sql:52-172`; `supabase/pedidos_schema.sql:102`
- Especificação original: [CAF-000015](CONCLUIDAS/CAF-000015-fechamento-de-caixa-do-dia.md)
- Suitable — financeiro: https://suitable.com.br/produto/financeiro/ · Garfo: https://garfo.app/llms.txt
