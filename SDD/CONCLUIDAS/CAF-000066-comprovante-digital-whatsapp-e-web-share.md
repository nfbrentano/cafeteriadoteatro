# [FEAT] CAF-000066 — Compartilhamento de Comprovante Digital via WhatsApp e Web Share API

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Adicionar no modal de Fechamento de Conta do PDV (`pedidos.html`) as ações **"📲 Enviar Comprovante no WhatsApp"** e **"📤 Compartilhar (`Web Share API`)"**, gerando um resumo formatado com cabeçalho da Cafeteria do Teatro, número da mesa/pedido, itens agrupados (com preços unitários e subtotais), desconto aplicado, divisão por pessoa (quando preenchida), formas de pagamento registradas (ou código/chave Pix caso a conta ainda esteja em conferência) e link de avaliação (`avaliar.html?pedido=...`).
- **Problema e evidência:** Conforme mapeado no item `D3` de `ANALISE_PEDIDOS_MOBILE.md`, quando o garçom fecha ou confere uma conta direto na mesa pelo celular, muitas vezes não há impressora térmica portátil por perto ou o cliente prefere receber o resumo no WhatsApp (especialmente grupos que dividem a conta ou clientes corporativos/professores que precisam de comprovante simples).
- **Impacto de não fazer:** O garçom precisa ir até o caixa imprimir a pré-conta em papel térmico e voltar até a mesa, ou ditar valores verbalmente para o grupo dividir.
- **Para quem é destinado:** Garçons, baristas e operadores de caixa (`pedidos.html`) e clientes no momento do fechamento da conta.
- **História de usuário:** Como garçom atendendo uma mesa pelo celular, quero enviar o resumo detalhado da conta pelo WhatsApp ou compartilhar pelo menu nativo do celular em 1 toque, para que o cliente veja os itens, a divisão por pessoa e o link de avaliação sem depender da impressora térmica.
- **Como saberemos que deu certo:** Em até 1 toque no modal de fechamento, o comprovante completo é aberto no WhatsApp (pré-endereçado ao telefone do cliente se já estiver vinculado, ou livre para escolher contato) ou compartilhado via `navigator.share` / área de transferência.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Gerar texto formatado para WhatsApp/compartilhamento com: nome da cafeteria, data/hora, mesa/identificação, lista de itens consolidada (`Qtd x Produto — R$ Subtotal`), subtotal, desconto (se houver), total líquido, valor por pessoa (se o divisor de pessoas for `> 1`) e link de avaliação do pedido | P0 | CA01, CA02 |
| RF02 | No modal de Fechamento de Conta em `pedidos.html` (tanto na etapa de conferência quanto após confirmar ou em conjunto com o botão Imprimir), exibir botão **"📲 WhatsApp"** que abre `https://wa.me/[telefone]?text=...` (usando o telefone do cliente vinculado ao pedido ou permitindo digitar/escolher no WhatsApp) | P0 | CA01, CA03 |
| RF03 | Oferecer botão secundário **"📤 Compartilhar / Copiar"**: se o dispositivo suportar `navigator.share`, aciona o menu de compartilhamento nativo do celular; caso contrário, copia o comprovante formatado para a área de transferência (`navigator.clipboard.writeText`) com toast de confirmação | P1 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Formatação limpa em texto puro compatível com markdown do WhatsApp (`*negrito*`), sem caracteres quebrados de encoding na URL (`encodeURIComponent`) | P0 | CA01 |

### Dependências técnicas

- Modal de fechamento de conta em `pedidos.html` e `js/pedidos.js` (`CAF-000054` e `CAF-000042`).

### Recursos necessários

- Nenhum recurso externo ou alteração de banco de dados.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado que o operador abre o Fechamento de Conta de uma mesa com itens lançados em `pedidos.html`, quando tocar em "📲 Comprovante WhatsApp", então deve abrir o WhatsApp com o texto formatado contendo todos os itens, quantidades, preços, total final e o link para `avaliar.html`.
- [ ] **CA02:** Dado que o operador informou divisão da conta para `3 pessoas` e um desconto de `R$ 5,00` no modal de fechamento, quando gerar o comprovante digital, então o texto deve incluir o subtotal, o desconto de `R$ 5,00`, o total líquido e o valor por pessoa (`÷ 3`).
- [ ] **CA03:** Dado que a conta possui um cliente vinculado com telefone cadastrado (ex.: `51999998888`), quando o operador clicar em "📲 WhatsApp", então o link `wa.me/5551999998888?text=...` deve direcionar diretamente para a conversa daquele cliente.
- [ ] **CA04:** Dado que o operador clica em "📤 Compartilhar / Copiar", quando o navegador suportar `navigator.share`, então o sheet nativo do sistema operacional deve abrir; em desktops sem `navigator.share`, o texto deve ser copiado para a área de transferência exibindo um toast `"Comprovante copiado!"`.

## O que a atividade não inclui

- Emissão de NFC-e / Cupom Fiscal Eletrônico SEFAZ: motivo: fora do escopo tributário atual do sistema (trata-se de comprovante de conferência/recibo não-fiscal de consumo).

### Considerado para o futuro (P2)

- Geração de imagem PNG estilizada do recibo para compartilhamento via `navigator.share({ files })`.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Gerar comprovante simples no WhatsApp | Manual | CA01 | Abrir fechamento de uma mesa e clicar em "📲 WhatsApp" | Abre URL do WhatsApp com itens, total e link de avaliação |
| CT02 | Comprovante com desconto e divisão por pessoas | Unit / Manual | CA02 | Definir desconto R$ 10 e dividir por 4 pessoas; acionar compartilhamento | Texto reflete desconto e valor por pessoa (`÷ 4`) |
| CT03 | Cliente com telefone vinculado | Manual | CA03 | Vincular cliente com telefone ao pedido e clicar em "📲 WhatsApp" | URL inclui o DDI+DDD+número do cliente (`55...`) |
| CT04 | Fallback para copiar no desktop | Manual | CA04 | Clicar em "📤 Compartilhar / Copiar" no desktop | Texto copiado para o clipboard e toast exibido |

## URL Complementar

- Documentação técnica: Item `D3` em `SDD/CONCLUIDAS/ANALISE_PEDIDOS_MOBILE.md`
