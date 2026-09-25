# CAF-000039 — [PDV] [Financeiro] Pix com QR Code no fechamento e taxas por forma de pagamento

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + admin + banco | 🟡 Média | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Mostrar um **QR Code Pix com o valor exato** (BR Code "copia e cola" gerado a partir da chave Pix da loja) no fechamento da conta, no pedido de balcão e na prévia impressa da conta.
  2. Cadastrar a **taxa de cada forma de pagamento** (ex.: débito 1,2%, crédito 3,1%, Pix 0%) e calcular o **valor líquido** nos relatórios e no caixa.
- **Por que é necessário:** hoje "Pix" é só um rótulo em `forma_pagamento`. O barista mostra a chave num papel ou dita, o cliente digita o valor e erros de valor aparecem só no fechamento do caixa. As taxas de maquininha não aparecem em nenhum relatório, então o faturamento parece maior do que o dinheiro que entra.
- **Qual valor será agregado:** pagamento Pix mais rápido e sem erro de valor, e faturamento líquido real para a gestão.
- **Para quem é destinado:** baristas, clientes e administração.

### Referência de mercado

- **Kyte:** pagamentos com Pix por QR Code, cartão e carteira digital.
- **Garfo:** múltiplas formas de pagamento com **cálculo automático de taxas**.
- **Simpliza:** taxas de cartão de crédito no financeiro e TEF integrado.
- **Jarbas:** link de pagamento.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Configurações (`js/admin/settings.js`): chave Pix, nome do recebedor (≤ 25 caracteres) e cidade (≤ 15), usados no payload EMV.
- [ ] Gerador de BR Code estático **com valor** (padrão EMV do Bacen: campos 26/52/53/54/58/59/60/62 com `txid` = `CAF<numero_pedido>`, CRC16-CCITT), em módulo JS local, sem serviço externo.
- [ ] Exibir o QR + botão "Copiar código" em:
  - fechamento de mesa ([CAF-000002](CONCLUIDAS/CAF-000002-fechamento-de-conta-da-mesa.md)) quando a forma escolhida for Pix (valor da parcela Pix, inclusive em conta dividida — [CAF-000012](CONCLUIDAS/CAF-000012-dividir-conta.md));
  - pedido de balcão com Pix;
  - prévia impressa da conta (`js/pedido-print.js`), opcional por configuração.
- [ ] Modo "Mostrar ao cliente": QR em tela cheia no celular/tablet do barista.
- [ ] A confirmação do recebimento continua **manual** ("Recebi o Pix"), porque o Pix estático não avisa o sistema.
- [ ] Tabela `formas_pagamento_taxas (forma, taxa_percentual NUMERIC(5,2), taxa_fixa NUMERIC(10,2), prazo_recebimento_dias, vigente_desde)` editável no admin.
- [ ] Gravar a taxa no momento do pagamento em `fechamento_pagamentos.taxa_valor` (e no pedido de balcão), para o histórico não mudar quando a taxa mudar.
- [ ] Relatórios e caixa: faturamento bruto, taxas e **líquido** por forma de pagamento; opção de lançar as taxas do mês como despesa ([CAF-000035](CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md)).

### Requisitos não funcionais
- [ ] **Correção:** o código gerado deve ser lido corretamente pelos apps dos principais bancos (testar em pelo menos 3) e ter CRC válido.
- [ ] **Segurança:** a chave Pix é configuração pública (vai no QR), mas só `admin` altera; mudança registrada no log.
- [ ] **Offline:** o QR é gerado localmente e funciona sem internet (o pagamento do cliente, obviamente, não).

### Dependências técnicas
- `fechamento_pagamentos` (`supabase/migration_caf_000002.sql`), `caixa_conferencia` (`supabase/migration_caf_000025_caixa.sql`), `get_admin_reports`.
- Biblioteca de QR Code via CDN permitido (cdnjs/jsdelivr) ou a mesma da [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md).

### Recursos necessários
- Chave Pix da empresa e tabela de taxas da maquininha contratada.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a conta da Mesa 2 é R$ 47,50 em Pix, **quando** o barista escolhe Pix no fechamento, **então** aparece um QR que, lido no app do banco, já traz R$ 47,50 e o nome da cafeteria.
- [ ] **Dado que** a conta é dividida em 2 no Pix, **quando** o barista avança, **então** cada parte tem seu QR com o valor da parte.
- [ ] **Dado que** o crédito tem taxa de 3,1%, **quando** uma venda de R$ 100 é paga no crédito, **então** o relatório mostra bruto R$ 100, taxa R$ 3,10 e líquido R$ 96,90.
- [ ] **Dado que** a taxa muda no mês seguinte, **quando** o admin consulta o mês anterior, **então** as taxas antigas continuam as mesmas.

---

## O que a atividade não inclui

- Pix dinâmico com confirmação automática (exige PSP/gateway e webhook).
- TEF / integração com maquininha.
- Link de pagamento com cartão.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | QR com valor | Gerar para R$ 47,50 | Banco lê valor e recebedor |
| 2 | CRC | Validar payload gerado | CRC16 correto |
| 3 | Caracteres especiais | Nome com acento/"ç" | Normalizado, lido pelo banco |
| 4 | Divisão | Conta dividida em 3 | 3 QRs com valores corretos |
| 5 | Copia e cola | "Copiar código" e colar no app | Pagamento reconhecido |
| 6 | Sem chave | Pix sem chave configurada | Aviso para configurar |
| 7 | Taxa | Venda no crédito | Líquido correto no relatório |
| 8 | Histórico | Alterar taxa | Relatório antigo inalterado |

---

## URL Complementar

- Código relacionado: `js/pedidos.js` (fechamento de conta), `js/pedido-print.js`, `js/admin/settings.js`, `js/admin/caixa-admin.js`
- Manual de padrões para iniciação do Pix (BR Code) — Banco Central: https://www.bcb.gov.br/estabilidadefinanceira/pix
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Kyte: https://www.kyteapp.com/pt · Garfo: https://garfo.app/llms.txt
