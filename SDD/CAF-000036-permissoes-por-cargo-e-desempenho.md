# CAF-000036 — [Admin] [Segurança] Permissões por cargo e relatório de desempenho por operador

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin + banco (RLS) + PDV | 🟢 Baixa | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Trocar os 3 papéis fixos (`barista`, `cozinha`, `admin` — `supabase/pedidos_schema.sql:9`) por **permissões granulares** agrupadas em cargos editáveis (ex.: "Caixa", "Atendente", "Gerente", "Cozinha", "Admin").
  2. Criar o relatório de **desempenho por operador** (vendas, ticket médio, cancelamentos, descontos e cortesias por usuário).
- **Por que é necessário:** hoje só existe uma exceção pontual, a flag de "pode dar desconto" do barista (`js/admin/usuarios-admin.js`). Qualquer barista abre e fecha caixa, faz sangria, cancela item e transfere mesa; ao mesmo tempo, dar a alguém acesso a relatórios exige torná-lo `admin` completo. Os pedidos já guardam `criado_por`, mas não há relatório por pessoa.
- **Qual valor será agregado:** menos risco (cancelamento e sangria só para quem pode), possibilidade de um gerente sem acesso total e visibilidade de quem vende mais ou cancela demais.
- **Para quem é destinado:** administração.

### Referência de mercado

- **Garfo:** "permissões por cargo" com 7 cargos pré-configurados e acesso granular; relatório de performance de garçons.
- **Kyte:** multiusuário com perfis individuais e acompanhamento de desempenho.
- **Jarbas:** multiusuário sem custo adicional e relatório de desempenho de vendedores.
- **Simpliza:** fechamento de caixa por usuário.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `cargos (id, nome, sistema BOOLEAN)` e `cargo_permissoes (cargo_id, permissao TEXT)`; `perfis.cargo_id` substitui `perfis.role` (migração: barista → "Atendente", cozinha → "Cozinha", admin → "Admin").
- [ ] Catálogo fixo de permissões (exemplo):
  `pdv.vender`, `pdv.cancelar_item`, `pdv.cancelar_pedido`, `pdv.desconto`, `pdv.cortesia`, `pdv.transferir_mesa`, `pdv.fechar_conta`, `caixa.abrir_fechar`, `caixa.sangria`, `kds.operar`, `admin.cardapio`, `admin.relatorios`, `admin.financeiro`, `admin.estoque`, `admin.clientes`, `admin.usuarios`, `admin.configuracoes`.
- [ ] Função `tem_permissao(p TEXT) RETURNS BOOLEAN` (SECURITY DEFINER, `STABLE`) usada em **todas** as policies e RPCs no lugar de `get_user_role() IN (...)`. `get_user_role()` continua existindo por compatibilidade até a migração terminar.
- [ ] Tela "Cargos" no admin: criar/editar cargo marcando permissões; cargos `sistema` (Admin) não podem perder `admin.usuarios`.
- [ ] Front: botões e abas escondidos conforme as permissões carregadas no login (a segurança real continua no banco).
- [ ] **Autorização pontual:** ação sem permissão (ex.: cancelar item) pode ser liberada na hora por um usuário com permissão, digitando o PIN dele; o log registra quem pediu e quem autorizou.
- [ ] Relatório "Desempenho por operador" em `js/admin/relatorios-admin.js`: pedidos, faturamento, ticket médio, itens cancelados, descontos concedidos, cortesias e diferença de caixa por usuário no período.

### Requisitos não funcionais
- [ ] **Segurança:** nenhuma policy pode ficar mais permissiva que hoje durante a migração; testes de RLS por cargo antes do deploy.
- [ ] **Desempenho:** permissões do usuário em cache na sessão (claim ou consulta única), sem uma consulta por policy por linha.
- [ ] **PIN:** 4–6 dígitos com hash no banco, bloqueio após 5 tentativas erradas.

### Dependências técnicas
- Todas as migrations com `get_user_role()` (ver `grep -r get_user_role supabase/`).
- Log de auditoria da [CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md).

### Recursos necessários
- Definição dos cargos com o cliente (quem pode cancelar, dar desconto, fazer sangria).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um usuário do cargo "Atendente" não tem `pdv.cancelar_item`, **quando** tenta cancelar um item, **então** o sistema pede o PIN de um gerente.
- [ ] **Dado que** o gerente digita o PIN, **quando** confirma, **então** o item é cancelado e o log mostra solicitante e autorizador.
- [ ] **Dado que** o cargo "Gerente" tem `admin.relatorios` mas não `admin.usuarios`, **quando** entra no admin, **então** vê os relatórios e não vê a aba de usuários (nem consegue criar usuário por RPC).
- [ ] **Dado que** a migração é aplicada, **quando** os usuários atuais entram, **então** continuam com exatamente os mesmos acessos de antes.
- [ ] **Dado que** o admin abre o desempenho da semana, **quando** filtra, **então** vê vendas, ticket, cancelamentos e descontos por operador.

---

## O que a atividade não inclui

- Controle de ponto / escala de funcionários.
- Comissão por vendedor ou taxa de serviço por garçom.
- Login por PIN no lugar de e-mail e senha.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Migração | Aplicar migration | Acessos iguais aos de antes |
| 2 | Sem permissão (UI) | Atendente sem sangria | Botão escondido |
| 3 | Sem permissão (API) | Chamar RPC direto | Negado pelo banco |
| 4 | PIN | Liberação com PIN correto | Ação executada + log |
| 5 | PIN errado | 5 tentativas | Bloqueio |
| 6 | Cargo novo | Criar "Gerente" | Permissões aplicadas no próximo login |
| 7 | Admin protegido | Remover `admin.usuarios` do Admin | Bloqueado |
| 8 | Relatório | Período com 3 operadores | Totais batem com o geral |

---

## URL Complementar

- Código relacionado: `supabase/pedidos_schema.sql:6-35` (`perfis`, `get_user_role`), `js/admin/usuarios-admin.js`, `js/admin/auth.js`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Garfo: https://garfo.app/llms.txt · Jarbas: https://www.jarbas.app
