# [FEAT] CAF-000064 — Tela Sempre Ligada (`Screen Wake Lock API`) nas Telas de Operação

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Implementar o gerenciamento automático de `Screen Wake Lock API` (`navigator.wakeLock.request('screen')`) nas telas operacionais contínuas — KDS da Cozinha (`cozinha.html`), Painel/TV de Retirada (`retirada.html`), Totem de Autoatendimento (`totem.html`) e PDV Mobile (`pedidos.html`, com botão/toggle de ativação na barra superior) — incluindo renovação automática do bloqueio quando a aba voltar ao foco (`visibilitychange`).
- **Problema e evidência:** Conforme mapeado no item `C4` de `ANALISE_PEDIDOS_MOBILE.md`, celulares de garçons, tablets de balcão/totem e telas de cozinha bloqueiam e apagam a tela após 30 a 60 segundos de inatividade do sistema operacional, obrigando o operador com a mão ocupada a desbloquear o aparelho com senha/biometria repetidas vezes durante o turno e interrompendo alertas em segundo plano.
- **Impacto de não fazer:** Atraso na visualização de novos pedidos na cozinha, totem aparentando estar "desligado" para os clientes e perda de agilidade do garçom no salão.
- **Para quem é destinado:** Equipe de cozinha (`cozinha.html`), baristas e garçons (`pedidos.html`) e operação de salão (`retirada.html` e `totem.html`).
- **História de usuário:** Como operador da cafeteria usando tablet ou celular durante o turno, quero que a tela permaneça acesa enquanto o sistema estiver aberto, para acompanhar e lançar pedidos instantaneamente sem precisar desbloquear o aparelho a cada minuto.
- **Como saberemos que deu certo:** Nas telas `cozinha.html`, `retirada.html`, `totem.html` e `pedidos.html` (quando ativo), o `WakeLockSentinel` permanece ativo durante toda a sessão visível e é readquirido automaticamente em `< 1s` ao retornar para a aba (`visibilitychange`), sem lançar erros em navegadores sem suporte.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar utilitário compartilhado `js/utils/wake-lock.js` que encapsula `navigator.wakeLock.request('screen')`, escuta `visibilitychange` para readquirir o lock quando a página volta a ficar visível e trata silenciosamente navegadores/ambientes sem suporte | P0 | CA01, CA02, CA04 |
| RF02 | Ativar o Wake Lock por padrão ao carregar `cozinha.html`, `retirada.html` e `totem.html` (ou no primeiro toque de interação caso o navegador exija gesto do usuário) | P0 | CA01 |
| RF03 | Em `pedidos.html`, adicionar indicador/toggle discreto no cabeçalho (`🔆 Tela acesa`) com preferência salva em `localStorage` (ativo por padrão em dispositivos móveis/touch), permitindo ao garçom ligar/desligar caso queira economizar bateria | P0 | CA03 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Degradação graciosa: se o navegador ou contexto não suportar `navigator.wakeLock` ou recusar por bateria fraca/economia de energia, não exibir nenhum erro bloqueante ao usuário (`0` exceções não tratadas no console) | P0 | CA04 |

### Dependências técnicas

- Páginas `cozinha.html`, `retirada.html`, `totem.html` e `pedidos.html`.

### Recursos necessários

- Nenhum recurso externo ou alteração de banco de dados (100% Web API nativa).

## Critérios de Aceitação / Entregas

- [x] **CA01:**** Dado que o operador abre `cozinha.html`, `retirada.html` ou `totem.html` em um navegador compatível, quando a página estiver visível, então o Wake Lock de tela deve ser ativado automaticamente para impedir o desligamento da tela.
- [x] **CA02:**** Dado que o Wake Lock estava ativo e o usuário minimizou o navegador ou trocou de aba (liberando o lock nativamente), quando o usuário voltar para a aba do sistema (`document.visibilityState === 'visible'`), então o Wake Lock deve ser readquirido automaticamente.
- [x] **CA03:**** Dado que o operador está em `pedidos.html`, quando clicar no botão de controle `🔆 Tela acesa`, então o sistema deve alternar entre manter a tela sempre ligada ou permitir o bloqueio padrão do aparelho, persistindo a escolha no `localStorage`.
- [x] **CA04:**** Dado que o usuário acessa o sistema em um navegador antigo ou com Modo de Pouca Energia que rejeita `navigator.wakeLock.request`, quando a página carregar ou o botão for acionado, então nenhum erro não tratado deve ocorrer no console e o restante da tela deve funcionar normalmente.

## O que a atividade não inclui

- Manter áudio silencioso em loop como hack para navegadores legados sem `WakeLock API`: motivo: Chrome, Edge e Safari (iOS 16.4+) já suportam nativamente a `Screen Wake Lock API`.

### Considerado para o futuro (P2)

- Desativar automaticamente o Wake Lock do `totem.html` fora do horário de funcionamento configurado da cafeteria.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Ativação automática no KDS, TV e Totem | Manual | CA01 | Abrir `cozinha.html`, `retirada.html` e `totem.html` e verificar status do Wake Lock | Lock adquirido sem erros |
| CT02 | Readquisição após troca de aba | Manual | CA02 | Trocar para outra aba do navegador e voltar para `cozinha.html` | Evento `visibilitychange` readquire o `WakeLockSentinel` automaticamente |
| CT03 | Toggle manual no PDV e persistência | Manual | CA03 | Clicar no botão `🔆` em `pedidos.html` e recarregar a página | Estado ativo/inativo é mantido no `localStorage` |
| CT04 | Ambiente sem suporte à API | Unit / Manual | CA04 | Simular `navigator.wakeLock = undefined` e abrir a página | Nenhum erro no console; botão em `pedidos.html` fica oculto ou informativo |

## URL Complementar

- Documentação técnica: Item `C4` em `SDD/CONCLUIDAS/ANALISE_PEDIDOS_MOBILE.md`
- Referências de design: [MDN Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
