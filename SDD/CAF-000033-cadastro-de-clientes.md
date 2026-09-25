# CAF-000033 — [PDV] [Admin] Cadastro de clientes com histórico de consumo

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + admin + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar um cadastro de clientes (nome, telefone/WhatsApp, e-mail opcional, observações) que possa ser **vinculado ao pedido** no PDV, e uma ficha do cliente no admin com histórico de pedidos, total gasto, frequência e produtos preferidos.
- **Por que é necessário:** hoje o pedido guarda só `cliente_nome` em texto livre ([CAF-000010](CONCLUIDAS/CAF-000010-nome-do-cliente-pedido-para-viagem.md)). Não é possível saber quem são os clientes frequentes (professores e funcionários da Univates, público recorrente do teatro), nem falar com eles. É também o pré-requisito da conta do cliente / fiado ([CAF-000034](CAF-000034-conta-do-cliente-fiado-e-creditos.md)) e do pedido online ([CAF-000038](CAF-000038-pedido-online-para-retirada.md)).
- **Qual valor será agregado:** atendimento personalizado ("o de sempre?"), base para ações de relacionamento pelo WhatsApp e relatórios de recorrência.
- **Para quem é destinado:** baristas e administração.

### Referência de mercado

- **Jarbas:** cadastro de clientes com histórico de compras e "conta cliente em tempo real"; relatório de análise de clientes.
- **Kyte:** "novos compradores" com contato direto pelo WhatsApp.
- **Simpliza:** cadastro de clientes e correntistas.
- **Suitable:** CRM com visão 360° do cliente (gasto, frequência e comportamento). A segmentação e as campanhas ficam na [CAF-000041](CAF-000041-crm-segmentacao-e-tags.md). Fonte: https://suitable.com.br/marketing/crm/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `clientes (id UUID, nome, telefone TEXT UNIQUE (só dígitos, com DDI), email, data_nascimento, observacoes, aceita_contato BOOLEAN DEFAULT false, ativo, created_at)`.
- [ ] Coluna `pedidos.cliente_id UUID NULL REFERENCES clientes`. `cliente_nome` continua sendo preenchido (texto da chamada e da comanda).
- [ ] PDV (`js/pedidos.js`): no campo de nome do cliente, busca por nome ou telefone com sugestões; opção "+ Cadastrar" rápida (nome + telefone). Vincular é opcional: o balcão continua funcionando só com o nome.
- [ ] Nova aba "Clientes" no admin: lista com busca, total gasto, nº de visitas e última visita; ficha com histórico de pedidos (link para os detalhes existentes) e top 5 produtos.
- [ ] Botão "💬 WhatsApp" na ficha (`https://wa.me/<telefone>`), só se `aceita_contato = true`.
- [ ] Mesclar clientes duplicados (admin), movendo os pedidos para o cadastro que fica.
- [ ] Relatório: clientes novos × recorrentes por período e ranking de clientes.
- [ ] Exportação CSV da lista ([CAF-000016](CONCLUIDAS/CAF-000016-exportar-csv.md)), apenas para `admin`.

### Requisitos não funcionais
- [ ] **LGPD:** consentimento explícito para contato (`aceita_contato`), exclusão/anonimização do cliente a pedido (mantém os pedidos, apaga os dados pessoais) e acesso restrito: `SELECT` só para `barista` e `admin`; nada exposto ao `anon`.
- [ ] **Desempenho:** busca com índice em `lower(nome)` e `telefone`, respondendo em < 300 ms com 5 mil clientes.
- [ ] **Offline:** pedido criado offline pode levar `cliente_id` de cliente já carregado; cadastro novo só online.

### Dependências técnicas
- RPC `criar_pedido` (aceitar `cliente_id` no payload), log de auditoria da [CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md).

### Recursos necessários
- Texto de consentimento revisado pelo cliente (dono da cafeteria).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a "Ana Souza" já está cadastrada, **quando** o barista digita "ana" ou "5199" no PDV, **então** ela aparece nas sugestões e é vinculada ao pedido.
- [ ] **Dado que** o cliente não quer se cadastrar, **quando** o barista digita só o nome, **então** o pedido é criado normalmente sem `cliente_id`.
- [ ] **Dado que** a Ana tem 12 pedidos, **quando** o admin abre a ficha, **então** vê total gasto, visitas, última visita e produtos preferidos.
- [ ] **Dado que** um cliente pede exclusão, **quando** o admin anonimiza, **então** nome e telefone somem e os pedidos continuam nos relatórios.

---

## O que a atividade não inclui

- Envio automático de mensagens (campanhas, aniversário) — só o link manual para o WhatsApp.
- Login do cliente / área do cliente.
- Programa de pontos.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Busca | Buscar por parte do nome e do telefone | Sugestões corretas |
| 2 | Cadastro rápido | "+ Cadastrar" no PDV | Cliente criado e vinculado |
| 3 | Telefone duplicado | Cadastrar telefone existente | Bloqueado com sugestão do existente |
| 4 | Sem cadastro | Pedido só com nome | Funciona |
| 5 | Mesclar | Mesclar duplicados | Pedidos no cadastro mantido |
| 6 | Anonimizar | Excluir dados | Pedidos mantidos, dados pessoais apagados |
| 7 | Permissão | Usuário `cozinha` consulta `clientes` | Negado |

---

## URL Complementar

- Código relacionado: `js/pedidos.js` (campo do nome do cliente), `supabase/migration_caf_000021_cliente_viagem.sql`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Jarbas: https://www.jarbas.app · Kyte: https://www.kyteapp.com/pt
