# [FEAT] Emissão de NFC-e no fechamento da conta via provedor fiscal

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Permitir emitir a nota fiscal de consumidor (NFC-e) a partir do fechamento de conta do PDV, usando um provedor fiscal, com cadastro fiscal dos produtos, cancelamento e contingência.
- **Problema e evidência:** O sistema já faz venda, pagamento, caixa, estoque, CMV e DRE, mas o cupom impresso é declaradamente não fiscal (CAF-000002) e não existe nenhum código de NFC-e no projeto (busca por `nfc-e`/`nfce` em `js/` e nos `.html` sem resultado). O `PLANO_CORRECOES_E_TESTES.md` registra NFC-e como item "fora deste plano" que "deve virar SDD própria", e a análise de concorrentes a deixou de fora por exigir certificado e provedor. Hoje a nota, quando emitida, é feita em outro sistema, com redigitação da venda.
- **Impacto de não fazer:** Trabalho dobrado (venda no PDV + nota em outro sistema), risco fiscal quando a nota não é emitida, e o DRE do sistema sem a linha de impostos sobre a venda.
- **Para quem é destinado:** Barista/caixa (emissão), administrador e contador.
- **História de usuário:** Como caixa, quero emitir a NFC-e no mesmo toque em que fecho a conta, para entregar a nota ao cliente sem usar outro sistema.
- **Como saberemos que deu certo:** NFC-e autorizada em até 10 s em 95% das emissões; 0 redigitação; relatório mensal de notas conferindo com o faturamento do período marcado como fiscal.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Cadastro fiscal do produto no Admin (NCM, CFOP, origem, situação tributária/CSOSN, unidade) com valores padrão por categoria | P0 | CA01 |
| RF02 | Configuração fiscal do emitente no Admin (dados da empresa, série, ambiente homologação/produção); certificado e token ficam no provedor/servidor | P0 | CA02 |
| RF03 | Edge Function `nfce-emitir` monta a nota a partir do fechamento (itens, descontos, formas de pagamento) e envia ao provedor | P0 | CA03, CA04 |
| RF04 | Tabela `notas_fiscais` (fechamento, número, série, chave, status, protocolo, link do DANFE/XML, motivo de rejeição) com RLS | P0 | CA03 |
| RF05 | No fechamento de conta: opção "Emitir NFC-e" (com CPF/CNPJ opcional do cliente); impressão do DANFE NFC-e com QR Code na térmica e envio por WhatsApp | P0 | CA05, CA06 |
| RF06 | Rejeição: mensagem clara ao operador, venda permanece fechada e a nota fica "pendente" para reemissão no Admin | P0 | CA07 |
| RF07 | Cancelamento da NFC-e dentro do prazo legal, exigindo permissão/PIN, vinculado ao cancelamento da venda | P0 | CA08 |
| RF08 | Contingência: sem internet ou SEFAZ fora do ar, a venda fecha e a nota entra em fila para emissão posterior | P1 | CA09 |
| RF09 | Relatório mensal de notas (autorizadas, canceladas, pendentes) e exportação dos XML para o contador | P1 | CA10 |
| RF10 | Fechamento parcial (CAF-000112): cada pagamento parcial pode gerar sua própria nota com os itens pagos | P1 | CA11 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Certificado digital e token do provedor nunca chegam ao navegador nem ao repositório | P0 | CA02 |
| RNF02 | Emissão idempotente: repetir o envio do mesmo fechamento não gera segunda nota | P0 | CA04 |
| RNF03 | Falha na emissão nunca impede nem desfaz o fechamento da conta | P0 | CA07, CA09 |
| RNF04 | Guarda dos XML pelo prazo legal (5 anos), no provedor e em cópia própria | P1 | CA10 |

### Dependências técnicas

- Provedor de emissão fiscal com API (ex.: Focus NFe, NFE.io, PlugNotas) e certificado A1 da empresa.
- Credenciamento da empresa para NFC-e na SEFAZ do estado e código de segurança do contribuinte (CSC).
- Supabase Edge Functions e secrets (mesma base da CAF-000123).
- `fechar_conta_mesa`, `fechamentos`, `pagamentos`, `js/pedido-print.js`, permissões por cargo/PIN (CAF-000081).
- CAF-000116 (backup) concluída antes: documentos fiscais exigem guarda.

### Recursos necessários

- Contador da cafeteria para definir regime tributário e a tributação por categoria de produto.
- Contratação do provedor fiscal e certificado A1.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um produto sem dados fiscais e sem padrão na categoria, quando tento emitir nota com ele, então o sistema avisa qual produto está incompleto antes de enviar.
- [ ] **CA02:** Dado o código publicado, quando procuro certificado ou token do provedor, então não aparecem em nenhum arquivo servido ao navegador.
- [ ] **CA03:** Dado um fechamento de R$ 40,00 com desconto de R$ 5,00 pago em Pix, quando emito, então a nota autorizada tem os mesmos itens, desconto, total e forma de pagamento, e fica registrada em `notas_fiscais`.
- [ ] **CA04:** Dado um fechamento com nota já autorizada, quando peço emissão de novo, então nenhuma nota nova é criada e a existente é exibida.
- [ ] **CA05:** Dado uma nota autorizada, quando imprimo, então a térmica imprime o DANFE NFC-e com QR Code e chave de acesso.
- [ ] **CA06:** Dado CPF informado, quando a nota é emitida, então o CPF consta na nota; sem CPF, a nota sai sem identificação.
- [ ] **CA07:** Dado uma rejeição da SEFAZ, quando ocorre, então o operador vê o motivo, a conta continua fechada e a nota aparece como pendente no Admin.
- [ ] **CA08:** Dado uma nota autorizada dentro do prazo, quando um usuário com permissão cancela informando o motivo, então a nota fica cancelada; sem permissão, o cancelamento é recusado.
- [ ] **CA09:** Dado o provedor indisponível, quando fecho a conta com "Emitir NFC-e", então a conta fecha, a nota entra na fila e é emitida quando o serviço voltar.
- [ ] **CA10:** Dado um mês com notas, quando abro o relatório, então vejo totais por status e consigo baixar os XML.
- [ ] **CA11:** Dado um fechamento parcial por item, quando emito, então a nota contém só os itens daquele pagamento.

## O que a atividade não inclui

- NF-e (modelo 55) para empresas e nota de serviço: motivo: outra iniciativa; a operação é venda ao consumidor.
- Entrada de estoque por XML do fornecedor: motivo: outra iniciativa (P2).
- Apuração de impostos e SPED: motivo: papel do contador.
- Emissão automática em toda venda: motivo: decisão do dono; nesta SDD a emissão é por escolha no fechamento (ver D03).

### Considerado para o futuro (P2)

- Importação de XML de compra para dar entrada no estoque (liga com CAF-000068/111).
- Linha de impostos no DRE (CAF-000113) a partir das notas emitidas.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual o regime tributário (Simples Nacional/MEI) e a tributação por categoria? | PO + contador | Sim | |
| D02 | Qual provedor fiscal e quem contrata o certificado A1? | PO | Sim | |
| D03 | A nota é emitida em toda venda, só quando o cliente pede, ou por configuração? | PO + contador | Sim | |
| D04 | Como a nota é emitida hoje (outro sistema, maquininha, não emite)? Define a migração | PO | Sim | |
| D05 | Vendas de fiado/crédito pré-pago (CAF-000034): a nota sai no consumo ou no pagamento? | contador | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Produto sem dados fiscais | unit + harness | CA01 | Emitir com produto incompleto | Aviso com o nome do produto |
| CT02 | Sem segredo no front | unit (varre `dist/`) | CA02 | Procurar padrões | Não encontrado |
| CT03 | Montagem da nota | unit (função pura de mapeamento) | CA03, CA11 | Fechamento com desconto e 2 pagamentos | Totais e itens idênticos |
| CT04 | Idempotência | pgTAP + integração (provedor simulado) | CA04 | Emitir duas vezes | 1 nota |
| CT05 | Impressão do DANFE | integração (harness de impressão) | CA05 | Gerar layout | QR e chave presentes |
| CT06 | CPF opcional | unit | CA06 | Com e sem CPF | Campo presente/ausente |
| CT07 | Rejeição | integração | CA07 | Provedor retorna rejeição | Conta fechada; nota pendente |
| CT08 | Cancelamento com permissão | pgTAP | CA08 | Com e sem PIN autorizado | Cancela / recusa |
| CT09 | Contingência | integração | CA09 | Provedor em timeout | Fila; emissão posterior |
| CT10 | Relatório mensal | integração | CA10 | Notas de vários status | Totais corretos; download |
| CT11 | Homologação SEFAZ | manual | CA03–CA09 | Emitir em ambiente de homologação | Nota autorizada |

## URL Complementar

- Documentação técnica: `js/pedido-print.js`, `js/utils/conta-mesa.js`, RPC `fechar_conta_mesa`
- Protótipo / mockup: —
- Discussões relacionadas: [PLANO_CORRECOES_E_TESTES.md](PLANO_CORRECOES_E_TESTES.md) (seção "Fora deste plano"), [ANALISE_CONCORRENTES_GESTAO.md](CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
