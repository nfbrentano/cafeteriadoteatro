# CAF-000028 — [Cozinha] [Impressão] Tela responsável pela impressão e comanda por estação (sem impressão duplicada)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + impressão + banco | 🟡 Média | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir escolher, em cada dispositivo com o KDS aberto, **se ele imprime** e **quais estações** imprime, e garantir que cada comanda seja impressa **uma única vez**, mesmo com várias telas abertas.
- **Por que é necessário:** todo KDS aberto imprime automaticamente cada pedido novo (`js/cozinha.js:707-713`). Com um tablet no bar e outro na cozinha, ambos no filtro "Todas", ou com a tela aberta também no computador do admin, a mesma comanda sai duas ou três vezes. Se a tela que deveria imprimir estiver fechada ou dormindo, a comanda não sai e ninguém percebe.
- **Qual valor será agregado:** menos papel desperdiçado, menos confusão com comanda duplicada (que vira item preparado duas vezes) e visibilidade do que ficou sem imprimir.
- **Para quem é destinado:** cozinha, bar e administração.

### Referência de mercado

- **SAIPOS:** impressão por **setor de produção**. Cada produto é vinculado a um setor e cada setor tem a sua impressora, então a comanda do bar sai no bar e a da cozinha na cozinha.
- **Padrão de mercado:** fila de impressão com status (impresso / pendente / erro) e reimpressão pela fila.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Menu "⚙ Esta tela" no KDS, salvo em `localStorage` por dispositivo:
  - "Imprimir comandas automaticamente": sim/não. Padrão **não**; a primeira tela configurada vira a impressora.
  - "Estações que esta tela imprime": bar, cozinha ou as duas. Independe do filtro de visualização.
- [ ] Controle no banco: tabela `pedido_impressoes (pedido_id, estacao, tipo ['comanda','adicional'], impresso_em, dispositivo)` com `UNIQUE (pedido_id, estacao, tipo)`.
  - Antes de imprimir, a tela faz `INSERT … ON CONFLICT DO NOTHING RETURNING` e **só imprime se conseguiu inserir**.
- [ ] A comanda automática de cada estação traz só os itens dela e o cabeçalho "COMANDA — BAR" ou "COMANDA — COZINHA".
- [ ] Indicador no card: "🖨 impressa 14:32" ou "⚠ não impressa". Pedidos com mais de 1 min sem impressão na estação ganham selo de alerta.
- [ ] A reimpressão manual continua sempre disponível e **não** é bloqueada pela trava (registra `tipo = 'reimpressao'` sem `UNIQUE`).
- [ ] Botão "Testar impressão" mostra também a configuração atual da tela.

### Requisitos não funcionais
- [ ] **Idempotência:** com N telas configuradas para imprimir a mesma estação, sai exatamente 1 comanda.
- [ ] **Resiliência:** se a tela impressora estiver offline quando o pedido chega, ela imprime os pendentes do dia ao reconectar (consulta pedidos sem registro em `pedido_impressoes`).
- [ ] **Permissão:** `INSERT` em `pedido_impressoes` só para `cozinha` e `admin`.

### Dependências técnicas
- [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) (estação gravada no item) e [CAF-000023](CAF-000023-correcoes-comanda-e-chamada-por-voz.md) (consulta completa para impressão).
- A trava também é usada pela comanda complementar da [CAF-000024](CAF-000024-itens-lancados-depois-voltam-para-a-fila.md).

### Recursos necessários
- Impressoras térmicas configuradas como impressora padrão em cada dispositivo (o navegador continua mostrando o diálogo, a menos que se use o modo quiosque do Chrome, `--kiosk-printing`).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** 2 tablets estão configurados para imprimir a cozinha, **quando** um pedido chega, **então** só um deles imprime.
- [ ] **Dado que** o tablet do bar imprime só o bar, **quando** chega um pedido misto, **então** ele imprime a comanda com os cafés e o tablet da cozinha imprime a da cozinha.
- [ ] **Dado que** nenhuma tela está configurada para imprimir o bar, **quando** passa 1 min de um pedido com cafés, **então** o card mostra "⚠ não impressa".
- [ ] **Dado que** a tela impressora ficou 5 min offline, **quando** reconecta, **então** imprime as comandas pendentes do período.
- [ ] **Dado que** a comanda já foi impressa, **quando** alguém toca em "🖨 Comanda", **então** reimprime normalmente.

---

## O que a atividade não inclui

- Impressão direta ESC/POS ou por rede (IP) sem o diálogo do navegador.
- Cadastro de impressoras no admin.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Duplicidade | 2 telas imprimindo a cozinha + novo pedido | 1 comanda |
| 2 | Por estação | Pedido misto | 1 comanda por estação, só com seus itens |
| 3 | Padrão desligado | Tela nova sem config | Não imprime |
| 4 | Alerta | Nenhuma tela imprime o bar | "⚠ não impressa" após 1 min |
| 5 | Offline | Tela impressora offline → pedido → online | Imprime o pendente |
| 6 | Reimpressão | Reimprimir comanda já impressa | Imprime |
| 7 | Permissão | Barista insere em `pedido_impressoes` | Recusado |

---

## URL Complementar

- Código: `js/cozinha.js:693-745` (realtime e impressão automática), `js/cozinha.js:633-651` (filtro e reimpressão), `js/pedido-print.js:35-46` (`executePrint`)
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- Ideia relacionada (fora do escopo): impressão ESC/POS em [FEATURES_PENDENTES.md](CONCLUIDAS/FEATURES_PENDENTES.md) · "Ideias para o futuro"
