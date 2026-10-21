# [FEAT] CAF-000067 — Gesto de Deslizar (`Swipe`) para Entregar Pedido e Ditado por Voz na Observação

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Implementar duas melhorias de ergonomia com uma mão no PDV Mobile (`pedidos.html`) mapeadas em `ANALISE_PEDIDOS_MOBILE.md`:
  1. **Ditado por voz (`Web Speech API` / `SpeechRecognition` em `pt-BR`)** nos campos de observação do item e observação do pedido, permitindo ao garçom tocar no ícone de microfone e falar *"sem açúcar, bem quente"* em vez de digitar com uma mão.
  2. **Gesto de deslizar para a direita (`Swipe Right`)** nos cards de pedidos prontos na aba "Mesas & Pedidos" em telas touch para marcar como **Entregue** rapidamente, exibindo um toast com botão **"Desfazer"** por 5 segundos caso tenha esbarrado sem querer.
- **Problema e evidência:** Conforme documentado nos itens `B5` e `C3` de `ANALISE_PEDIDOS_MOBILE.md`: (1) digitar observações longas no teclado virtual segurando bandeja ou com pressa é lento; (2) na aba de Mesas, marcar pedidos como entregues no fluxo de salão pode ser feito com gesto natural de swipe com retorno visual e opção de desfazer.
- **Impacto de não fazer:** Maior tempo de digitação em pedidos personalizados e ausência de proteção "Desfazer" ao marcar um pedido como entregue no celular.
- **Para quem é destinado:** Garçons e baristas operando o `pedidos.html` pelo celular.
- **História de usuário:** Como garçom atendendo no salão pelo celular com apenas uma mão livre, quero ditar observações por voz e deslizar os cards de pedidos prontos para marcá-los como entregues (com opção de desfazer), para ganhar velocidade sem medo de errar.
- **Como saberemos que deu certo:** O ditado em `pt-BR` transcreve a fala diretamente para o campo de observação com feedback visual de gravação, e o gesto de swipe horizontal (`> 90px`) marca o pedido como entregue exibindo toast com ação funcional de `"Desfazer"`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Adicionar botão de microfone (`🎤`) ao lado do campo de observação do pedido e nos campos de observação do modal de item em `pedidos.html` quando o navegador suportar `SpeechRecognition` ou `webkitSpeechRecognition` | P0 | CA01, CA02 |
| RF02 | Ao tocar no botão `🎤`, iniciar reconhecimento de voz com `lang = 'pt-BR'`, exibir estado visual pulsante ("Ouvindo...") e concatenar o texto reconhecido no campo de observação | P0 | CA01 |
| RF03 | Na aba Mesas de `pedidos.html` (em dispositivos touch), permitir deslizar o card de um pedido (`status = 'pronto'` ou em andamento) para a direita (`> 90px` horizontal sem scroll vertical) revelando fundo verde `"✓ Entregar"` e executando a entrega ao soltar | P0 | CA03 |
| RF04 | Sempre que um pedido for marcado como entregue (por swipe ou botão), exibir toast com botão **"Desfazer"** durante 5 segundos que reverte o status do pedido caso acionado | P0 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | O gesto de swipe horizontal não deve conflitar com a rolagem vertical da lista (`touch-action: pan-y`; cancelar o swipe se `|deltaY| > |deltaX|` nos primeiros `20px`) | P0 | CA05 |
| RNF02 | Se o navegador não suportar `SpeechRecognition` (ou se a permissão de microfone for negada), ocultar o botão ou exibir toast amigável sem quebrar o formulário | P0 | CA02 |

### Dependências técnicas

- Componentes de toast com ação (`showUndoToast` criado na `CAF-000056` em `js/pedidos.js`).
- Aba Mesas e formulário de pedido em `pedidos.html` / `js/pedidos.js`.

### Recursos necessários

- Nenhum recurso externo ou alteração de banco de dados.

## Critérios de Aceitação / Entregas

- [x] **CA01:**** Dado que o operador está em `pedidos.html` em um navegador compatível com `SpeechRecognition`, quando tocar no botão `🎤` do campo de observação e falar *"sem gelo e com limão"*, então o texto deve ser preenchido automaticamente no campo de observação.
- [x] **CA02:**** Dado que o navegador não suporta `SpeechRecognition` ou o usuário nega a permissão de microfone, quando interagir com o campo de observação, então a digitação manual deve continuar funcionando normalmente e sem erros não tratados.
- [x] **CA03:**** Dado que um pedido está na aba Mesas no celular, quando o garçom deslizar o card para a direita além do limiar (`90px`) e soltar, então o pedido deve ser marcado como entregue com vibração tátil curta.
- [x] **CA04:**** Dado que o garçom acabou de marcar um pedido como entregue, quando tocar em **"Desfazer"** no toast exibido nos 5 segundos seguintes, então o pedido deve voltar imediatamente ao status anterior na lista e no banco.
- [x] **CA05:**** Dado que o garçom está rolando a lista de mesas verticalmente no celular, quando o movimento do dedo for predominantemente vertical, então o card não deve disparar o swipe de entrega acidentalmente.

## O que a atividade não inclui

- Comandos de voz para adicionar produtos ao carrinho: motivo: ruído ambiente de cafeteria pode gerar falsos positivos no lançamento de itens; o ditado restrito ao campo de observação sob demanda (push-to-talk) é seguro e previsível.

### Considerado para o futuro (P2)

- Gesto de swipe para a esquerda para abrir ações rápidas da mesa (ver itens / fechar conta).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Ditado por voz no campo de observação | Manual | CA01 | Tocar em `🎤`, falar uma frase em português e aguardar fim da fala | Texto inserido no input de observação |
| CT02 | Fallback sem suporte a voz | Unit / Manual | CA02 | Testar com `window.SpeechRecognition = undefined` | Botão `🎤` não é renderizado; input funciona normalmente |
| CT03 | Swipe right para entregar + Desfazer | Manual | CA03, CA04 | Deslizar card para a direita até entregar e clicar em "Desfazer" no toast | Pedido é marcado como entregue e depois restaurado ao clicar em Desfazer |
| CT04 | Scroll vertical sem disparo acidental | Manual | CA05 | Rolar a lista de mesas para cima e para baixo tocando sobre os cards | Lista rola suavemente sem acionar entrega |

## URL Complementar

- Documentação técnica: Itens `B5` e `C3` em `SDD/CONCLUIDAS/ANALISE_PEDIDOS_MOBILE.md`
