# CAF-000054 — [PDV] [Mobile] Fechamento de conta em etapas adaptado para telas mobile

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + HTML + CSS) | 🔴 Alta (P0) | G | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Reformular o fechamento de conta (`#modal-fechar-conta`) no celular para um fluxo de tela cheia dividido em **3 etapas lineares e focadas**:
  1. **Etapa 1: Resumo do Consumo:** Itens pedidos, quantidades, cancelamentos e subtotal da mesa.
  2. **Etapa 2: Ajustes de Conta:** Taxa de serviço (opcional/desmarcável), descontos com motivo e opção de divisão de conta (individual, por pessoa ou partes iguais).
  3. **Etapa 3: Pagamento:** Seleção da forma de pagamento (Pix, Dinheiro, Débito, Crédito, etc.), registro de pagamentos parciais e cálculo de troco instantâneo.
  - **Barra de ação fixa no rodapé:** Em todas as etapas, o valor total/restante e o botão de avançar/confirmar ficam fixos na parte inferior da tela, sem rolagem, ao alcance do polegar.
  - **Remoção de estilos inline rígidos:** Substituir declarações como `width: 150px`, `max-width: 200px` por layouts flexíveis de 100% da largura.
- **Por que é necessário:** 
  - Hoje o modal de fechamento (`pedidos.html:315-447`) empilha resumo, 3 tipos de divisão, descontos, taxas, painel de formas de pagamento, troco e impressão em uma única janela vertical cheia de rolagem e campos estreitos. Em telas de 375px (iPhone padrão), os botões de confirmação ficam escondidos após várias rolagens e campos ficam cortados.
- **Qual valor será agregado:** Encerramento de contas no salão com agilidade de 30 segundos, sem confusão de valores e com ergonomia perfeita para fechar na mesa do cliente.
- **Para quem é destinado:** Garçons e baristas realizando cobrança móvel.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] No mobile (`@media (max-width: 900px)`), renderizar o fechamento de conta em modal full-screen ou drawer vertical com cabeçalho de navegação (indicador de passos 1/3, 2/3, 3/3 e botão voltar).
- [x] **Passo 1 (Consumo):**
  - Lista clara de itens agrupados, com destaque para adicionais;
  - Subtotal calculado;
  - Botão de avançar: "Avançar para Ajustes ➔".
- [x] **Passo 2 (Ajustes):**
  - Toggle simples e visível para Taxa de Serviço (10%);
  - Opção expansível de Desconto (com tipo % ou R$ e motivo obrigatório);
  - Seletor de Divisão: "Conta Única" | "Dividir por X Pessoas" | "Por Itens/Partes";
  - Botão de avançar: "Ir para Pagamento ➔".
- [x] **Passo 3 (Pagamento):**
  - Grid de botões com as formas de pagamento (Pix, Dinheiro, Cartão Crédito, Cartão Débito);
  - Saldo a pagar e pagamentos já computados em destaque;
  - Em dinheiro: campo de valor recebido com cálculo automático do troco;
  - Checkbox para imprimir cupom ou comprovante;
  - Botão de ação final verde: "Confirmar Pagamento e Liberar Mesa".
- [x] Em desktop, manter a visualização compacta já aprovada na CAF-000002 / CAF-000012 / CAF-000013.

### Requisitos não funcionais
- [x] **Ergonomia e polegar:** Barra de avanço e valor final colados na parte inferior com respeito a `env(safe-area-inset-bottom)`.
- [x] **Sem scroll horizontal:** 100% responsivo em viewports de 320px a 480px.

### Dependências técnicas
- Código relacionado: `pedidos.html:315-447`, `js/pedidos.js:abrirModalFecharConta`, `css/pedidos.css`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Item D1).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom está fechando a comanda da Mesa 02 no celular (375px), **quando** o fluxo abre, **então** os passos são apresentados sequencialmente (Consumo → Ajustes → Pagamento).
- [x] **Dado que** a tela do celular é pequena, **quando** qualquer etapa é visualizada, **então** o botão de avançar/confirmar permanece fixo e visível na parte inferior sem necessidade de rolar até o fim.
- [x] **Dado que** o cliente paga em dinheiro, **quando** o garçom insere o valor recebido, **então** o troco é calculado e exibido em fonte grande legível.
- [x] **Dado que** o pagamento atinge o valor total, **quando** clica em "Confirmar", **então** a mesa é encerrada e liberada com sucesso.
