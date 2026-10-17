# CAF-000056 — [PDV] [Mobile] Diálogos próprios (bottom sheets e toasts com desfazer) substituindo alert/confirm

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + CSS + HTML) | 🟡 Média (P1) | M | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Substituir as 12 chamadas nativas de `window.alert()` e `window.confirm()` em `js/pedidos.js` por uma biblioteca/módulo interno de componentes modernos de interface móvel:
  1. **Toast com Ação de Desfazer:** Para ações reversíveis (como remover um item do carrinho ou limpar comanda), remover imediatamente sem travar o garçom com caixa de confirmação e exibir na base da tela um toast: `Item removido do carrinho. [Desfazer]`, ativo por 5 segundos.
  2. **Bottom Sheet de Confirmação:** Para ações críticas irreversíveis (cancelamento de comanda enviada, encerramento forçado sem pagamento, descarte de mesa), abrir uma folha deslizante vinda de baixo com botões claros e grandes:
     - Título descritivo em vermelho/âmbar;
     - Botão primário destrutivo (ex: "Sim, Cancelar Item");
     - Botão secundário neutro ("Voltar / Manter");
  3. **Toast de Notificação/Erro:** Para mensagens informativas ou de falha de conexão, usar toasts com cores semânticas (verde = sucesso, vermelho = erro, amarelo = atenção) que somem sozinhos após 3 segundos ou ao tocar.
- **Por que é necessário:** 
  - Caixas de diálogo nativas do navegador (`alert` e `confirm`) congelam o JavaScript, bloqueiam a tela inteira, exibem URLs feias do navegador (ex.: "nyretgvzbnbtiyeioeju.supabase.co diz...") e quebram a experiência visual de aplicativo instalado (PWA). Em celulares, os botões nativos "OK / Cancelar" são minúsculos e induzem toques errados.
- **Qual valor será agregado:** Experiência de app nativo elegante, fluxo de trabalho contínuo sem janelas bloqueantes e segurança para desfazer erros acidentais.
- **Para quem é destinado:** Garçons e baristas.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] Criar módulo leve de UI para feedback em `js/pedidos.js`:
  - `showToast(mensagem, tipo, acaoTexto, acaoCallback, duracaoMs)`
  - `showConfirmBottomSheet({ titulo, mensagem, textoConfirmar, textoCancelar, perigoso }) => Promise<boolean>`
- [x] Eliminar todas as ocorrências de `alert(...)` e `confirm(...)` de `js/pedidos.js`.
- [x] Na remoção de item do carrinho:
  - Remover o item da lista imediatamente;
  - Se houver clique em "Desfazer", reinserir o item com seus complementos e quantidades originais;
- [x] No cancelamento de itens ou mesas na cozinha, exibir o bottom sheet com motivo claro.

### Requisitos não funcionais
- [x] **Sem bibliotecas externas pesadas:** Implementado em Vanilla JS e CSS puro, mantendo o bundle leve e rápido.
- [x] **Acessibilidade:** Elementos com atributos `role="alert"` ou `role="dialog"` e suporte à tecla `Escape`.

### Dependências técnicas
- Código relacionado: `js/pedidos.js` (12 ocorrências de `alert`/`confirm`), `css/pedidos.css`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Item A4).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom clica na lixeira para remover um croissant do carrinho, **quando** clica, **então** o item é removido na hora e um toast surge dizendo "Croissant removido [Desfazer]".
- [x] **Dado que** o toast de desfazer está visível, **quando** o garçom clica em "Desfazer", **então** o croissant volta imediatamente para o carrinho.
- [x] **Dado que** o garçom solicita cancelar um item já enviado para a cozinha, **quando** clica, **então** abre um bottom sheet estilizado confirmando a ação destrutiva, sem usar pop-ups nativos do navegador.
- [x] **Dado que** ocorre uma falha temporária de rede, **quando** o sistema avisa, **então** o erro aparece em um toast flutuante sem interromper o que o usuário está digitando.
