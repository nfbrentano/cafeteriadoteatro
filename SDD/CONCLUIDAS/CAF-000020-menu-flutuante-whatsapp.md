# CAF-000020 — [UI] Menu Flutuante do WhatsApp

> **Propósito:** Criar um botão flutuante de WhatsApp fixo na tela para facilitar o contato, e remover os links de WhatsApp de locais onde não fazem sentido.

---

## Detalhes da Atividade

> **Propósito:** dar o contexto completo do trabalho. A descrição deve ser correta, precisa, completa, consistente e verificável.

- **O que precisa ser feito:** Adicionar um ícone flutuante do WhatsApp no canto inferior direito da tela (ou local apropriado) que acompanha a rolagem. Além disso, revisar os arquivos HTML (como `index.html`) e remover os botões/links de WhatsApp de lugares redundantes ou que não fazem sentido.
- **Por que é necessário:** Um botão flutuante melhora a experiência do usuário, tornando o contato rápido e acessível em qualquer ponto da página. Remover os links redundantes limpa a interface.
- **Qual valor será agregado:** Melhor conversão de contato de clientes e uma interface de usuário mais limpa.
- **Para quem é destinado:** Clientes que acessam o cardápio público ou a página inicial.

---

## Requisitos da Atividade

> **Propósito:** definir as condições e dependências necessárias para executar a tarefa, para que o time não comece sem tudo o que precisa.

### Requisitos funcionais
- [ ] Criar elemento HTML/CSS para o botão flutuante do WhatsApp.
- [ ] Configurar o link do WhatsApp para usar o número configurado do estabelecimento.
- [ ] Remover botões antigos de WhatsApp do `index.html` e outras páginas públicas onde eram exibidos estaticamente.

### Requisitos não funcionais
- [ ] O botão deve ser responsivo e não atrapalhar outros elementos importantes (ex: botão de carrinho).
- [ ] O botão deve usar as cores/identidade visual adequadas ou a cor oficial do WhatsApp.

### Dependências técnicas
- FontAwesome ou SVG para o ícone do WhatsApp.

### Recursos necessários
- Acesso ao código do frontend (`index.html`, arquivos de CSS e JS).

---

## Critérios de Aceitação / Entregas

> **Propósito:** definir quando a tarefa está concluída (Definition of Done).

- [ ] **Dado que** o cliente acessa a página inicial/cardápio, **quando** ele rola a página, **então** o botão do WhatsApp permanece visível no canto da tela.
- [ ] **Dado que** o cliente clica no botão flutuante, **quando** a ação é disparada, **então** ele é redirecionado para o WhatsApp do estabelecimento.
- [ ] **Dado que** existiam links estáticos do WhatsApp no meio do layout, **quando** a página é carregada, **então** esses links não devem mais aparecer.

---

## O que a atividade não inclui

- Alterações nas funcionalidades do painel administrativo (PDV).
- Implementação de chatbot de WhatsApp (é apenas um link de redirecionamento).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Teste visual Desktop | Acessar a página em um PC. | O botão flutuante aparece no canto e não sobrepõe conteúdo crítico. |
| 2 | Teste visual Mobile | Acessar a página em um smartphone. | O botão se adapta bem e convive pacificamente com o carrinho. |
| 3 | Teste de funcionalidade | Clicar no botão. | Abre a URL do `wa.me` correta. |
| 4 | Verificação de limpeza | Buscar por "whatsapp" no `index.html`. | Não devem haver botões no meio de sessões de contato estáticas, se redundante. |

---

## URL Complementar

- Documentação técnica:
- Protótipos ou mockups:
- Discussões relacionadas:
- Referências de design:
- Requisitos originais:
