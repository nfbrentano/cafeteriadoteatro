# [FEAT] CAF-000062 — Modo "Dia de Espetáculo" e Reserva Antecipada para o Intervalo

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Criar o modo operacional **"Dia de Espetáculo / Intervalo"** para que o administrador possa cadastrar ou ativar o evento do dia no Teatro Univates (com nome do espetáculo e horário previsto do intervalo). Quando ativo, o Cardápio Digital (`cardapio.html`), o Totem (`totem.html`) e o PDV (`pedidos.html`) oferecem em destaque a opção **"Reservar para o Intervalo (Sem Fila)"**, agendando automaticamente o pedido para o horário do intervalo e destacando esses pedidos no KDS (`cozinha.html`) para preparo sincronizado antes do público sair do auditório.
- **Problema e evidência:** Conforme documentado em `ANALISE_CONCORRENTES_GESTAO.md` e `CAF-000038`, nos dias de evento no Teatro da Univates o maior gargalo ocorre nos 15 a 20 minutos de intervalo, quando centenas de pessoas saem ao mesmo tempo. Hoje já existe `horario_retirada` na tabela `pedidos`, mas o cliente precisa digitar manualmente um horário e não há incentivo visual nem fila dedicada de "Intervalo do Espetáculo".
- **Impacto de não fazer:** Filas longas no intervalo do teatro, desistência de compra por falta de tempo antes do segundo ato e sobrecarga repentina na cozinha durante 15 minutos em vez de produção antecipada e organizada.
- **Para quem é destinado:** Público do Teatro Univates (`cardapio.html` e `totem.html`), equipe de cozinha (`cozinha.html`), baristas (`pedidos.html`) e gestor (`admin.html`).
- **História de usuário:** Como espectador do Teatro Univates, quero fazer e deixar agendado meu pedido para o intervalo antes de entrar no espetáculo, para apenas retirar meu café e lanche prontos sem enfrentar fila no intervalo.
- **Como saberemos que deu certo:** Cliente seleciona "Retirar no Intervalo" com 1 toque (sem precisar digitar horário manualmente), e a cozinha consegue filtrar/visualizar em destaque todos os pedidos do intervalo com antecedência.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Permitir configurar no `admin.html` (Configurações Operacionais / Loja Online) o **"Modo Espetáculo Hoje"**: toggle ativo/inativo, nome do evento (ex.: *"Concerto Orquestra Univates"*) e horário previsto do intervalo (ex.: `21:15`) | P0 | CA01 |
| RF02 | Quando o Modo Espetáculo estiver ativo, exibir um banner/atalho de destaque no `cardapio.html` e no `totem.html`: *"🎭 Hoje tem [Nome do Evento]! Garanta seu pedido para o intervalo ([Horário]) sem fila"* | P0 | CA02 |
| RF03 | Ao clicar no atalho de intervalo (ou selecionar a opção no checkout), preencher automaticamente `horario_retirada` com o horário do intervalo do espetáculo e marcar o pedido com identificação de intervalo | P0 | CA02, CA03 |
| RF04 | No KDS (`cozinha.html`), exibir badge destacado `🎭 INTERVALO HH:MM` nos pedidos agendados para o intervalo e incluir filtro rápido na barra superior para visualizar os pedidos do intervalo e o consolidado de itens a produzir para esse horário | P0 | CA04 |
| RF05 | No PDV (`pedidos.html`), permitir marcar com 1 clique "🎭 Para o Intervalo (`HH:MM`)" ao lançar pedido no balcão antes do espetáculo começar | P1 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A configuração do espetáculo deve reutilizar a tabela `configuracoes` existente (ou campos em `configuracoes`), sem impactar o tempo de carregamento inicial do cardápio | P0 | CA01, CA02 |
| RNF02 | Quando o horário atual ultrapassar em mais de 2 horas o horário do intervalo configurado (ou no dia seguinte), o banner público de pré-venda do intervalo não deve mais ser exibido ao cliente | P1 | CA06 |

### Dependências técnicas

- Tabela `configuracoes` e colunas `tipo_pedido` / `horario_retirada` em `pedidos` (`CAF-000038`).
- KDS (`cozinha.html` / `js/cozinha.js`) e Visão Consolidada (`CAF-000026`).

### Recursos necessários

- Migration SQL (ou chaves em `configuracoes`) para armazenar `espetaculo_ativo`, `espetaculo_nome`, `espetaculo_data` e `espetaculo_horario_intervalo`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o gestor acessa o Admin, quando ativar "Modo Espetáculo Hoje", informar o nome *"Show de Stand-up"* e o intervalo às `21:00`, então a configuração deve ser salva e refletida imediatamente nas telas públicas e operacionais.
- [x] **CA02:** Dado que o Modo Espetáculo está ativo para hoje às `21:00`, quando o cliente abrir o `cardapio.html` ou o `totem.html` antes das `21:00`, então deve ver o banner do espetáculo com botão de ação rápida que já ativa o agendamento para `21:00`.
- [x] **CA03:** Dado que o cliente finaliza o pedido com a opção "Retirar no Intervalo (`21:00`)", quando o pedido for salvo, então deve ser gravado com `horario_retirada = '21:00'` e observação/marcador do intervalo.
- [x] **CA04:** Dado que existem pedidos agendados para o intervalo, quando a equipe abrir o `cozinha.html`, então cada card deve exibir o selo `🎭 INTERVALO 21:00` e o operador poderá filtrar apenas a fila do intervalo para preparar os lotes minutos antes das `21:00`.
- [x] **CA05:** Dado que o barista está lançando um pedido em `pedidos.html` em dia de espetáculo, quando marcar "🎭 Intervalo (21:00)", então o pedido será enviado já agendado para `21:00`.
- [x] **CA06:** Dado que o Modo Espetáculo foi configurado para uma data anterior à data de hoje, quando o cliente abrir o `cardapio.html`, então o banner do espetáculo passado não deve aparecer.

## O que a atividade não inclui

- Integração automática via API com a bilheteria da Univates: motivo: não há API pública disponível no momento; o cadastro do evento leva 10 segundos no Admin.
- Escolha de assento do auditório e entrega dentro da sala do teatro: motivo: o consumo ocorre no foyer/cafeteria durante o intervalo.

### Considerado para o futuro (P2)

- Cardápio expresso exclusivo de intervalo (ocultar itens de preparo demorado automaticamente para pedidos do intervalo).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Deseja permitir mais de um intervalo/sessão no mesmo dia (ex.: sessão das 19h e sessão das 21h)? | PO | Não | Inicialmente 1 horário ativo por vez (que pode ser trocado rapidamente entre sessões). |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Ativar Modo Espetáculo no Admin | Manual | CA01 | Ativar toggle no Admin, preencher nome e horário `21:00` e salvar | Configuração persistida com sucesso |
| CT02 | Fazer pedido para o intervalo pelo Cardápio/Totem | Manual / E2E | CA02, CA03 | Clicar no banner "Reservar para o Intervalo", adicionar itens e enviar | Pedido criado com `horario_retirada = '21:00'` |
| CT03 | Visualizar fila do intervalo no KDS | Manual | CA04 | Abrir `cozinha.html` e clicar no filtro `🎭 Intervalo` | Exibe os pedidos agendados para o intervalo com selo destacado |
| CT04 | Expiração automática por data | Unit / Manual | CA06 | Configurar data do espetáculo para ontem e abrir `cardapio.html` | Banner não é exibido |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md` e `SDD/CONCLUIDAS/CAF-000038-pedido-online-para-retirada.md`
