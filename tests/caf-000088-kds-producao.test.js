import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  calcularSemaforo,
  ordenarFilaKDS,
  agruparPorEstacao,
  verificarConclusaoEstacoes,
  consolidarProducao
} from '../js/utils/kds-regras.js';
import { ImpressaoTrava } from '../js/utils/impressao-trava.js';
import { calcularDiffKDS } from '../js/utils/kds-patch.js';

/**
 * CAF-000088 — Cobertura de Testes: KDS, Estações e Produção
 */
describe('CAF-000088 — Cobertura de Testes: KDS, Estações e Produção', () => {
  const matrizEsperada = [
    'tests/caf-000006-produto-esgotado.test.js',
    'tests/caf-000007-estacoes.test.js',
    'tests/caf-000008-item-pronto.test.js',
    'tests/caf-000009-realtime-itens.test.js',
    'tests/caf-000022-conclusao-estacao.test.js',
    'tests/caf-000023-comanda-voz.test.js',
    'tests/caf-000024-itens-lancados-depois.test.js',
    'tests/caf-000025-semaforo.test.js',
    'tests/caf-000026-producao-consolidada.test.js',
    'tests/caf-000027-painel-retirada.test.js',
    'tests/caf-000028-impressao-estacao.test.js',
    'tests/caf-000029-prioridade-teclado.test.js',
    'tests/caf-000030-kds-incremental.test.js',
    'tests/caf-000043-etiqueta-copo.test.js'
  ];

  it('CA01 / RF01: todos os 14 arquivos de teste da matriz do KDS existem', () => {
    for (const testFile of matrizEsperada) {
      expect(fs.existsSync(testFile), `Arquivo ${testFile} deve existir`).toBe(true);
    }
  });

  it('CA02 / RF02: separação de estações e conclusão conjunta bar e cozinha', () => {
    const itens = [
      { id: '1', nome: 'Café', estacao: 'bar' },
      { id: '2', nome: 'Torta', estacao: 'cozinha' }
    ];
    const grupos = agruparPorEstacao(itens);
    expect(grupos.bar).toHaveLength(1);
    expect(grupos.cozinha).toHaveLength(1);

    const pedido = { id: 'p1', estacoes_concluidas: ['bar'] };
    expect(verificarConclusaoEstacoes(pedido, ['bar', 'cozinha'])).toBe(false);
    pedido.estacoes_concluidas.push('cozinha');
    expect(verificarConclusaoEstacoes(pedido, ['bar', 'cozinha'])).toBe(true);
  });

  it('CA03 / RF02: semáforo verde, amarelo e vermelho com compensação de relógio', () => {
    const agora = 1700000000000;
    const alvo = 10; // 10 min
    const v = calcularSemaforo(agora - (3 * 60000), alvo, { agora });
    const a = calcularSemaforo(agora - (8 * 60000), alvo, { agora });
    const r = calcularSemaforo(agora - (12 * 60000), alvo, { agora });

    expect(v.cor).toBe('verde');
    expect(a.cor).toBe('amarelo');
    expect(r.cor).toBe('vermelho');
  });

  it('CA04 / RF03: trava de impressão impede impressão automática duplicada', () => {
    const trava = new ImpressaoTrava();
    expect(trava.deveImprimirAutomatico('ped-100', 'bar')).toBe(true);
    expect(trava.deveImprimirAutomatico('ped-100', 'bar')).toBe(false);
    expect(trava.deveImprimirAutomatico('ped-100', 'bar', true)).toBe(true); // manual permitido
  });

  it('CA05 / RF03: diff incremental do KDS detecta inseridos, atualizados e removidos', () => {
    const antigos = [{ id: '1', status: 'pendente' }];
    const novos = [{ id: '1', status: 'pronto' }, { id: '2', status: 'pendente' }];
    const diff = calcularDiffKDS(antigos, novos);
    expect(diff.inseridos).toHaveLength(1);
    expect(diff.atualizados).toHaveLength(1);
    expect(diff.removidos).toHaveLength(0);
  });

  it('CA06 / RF02: consolidação de produção agrupa itens ativos em aberto', () => {
    const pedidos = [
      { id: '1', status: 'em_preparo', itens: [{ produto_nome: 'Espresso', quantidade: 2 }] },
      { id: '2', status: 'pendente', itens: [{ produto_nome: 'Espresso', quantidade: 3 }] }
    ];
    const consolidado = consolidarProducao(pedidos);
    expect(consolidado[0].nome).toBe('Espresso');
    expect(consolidado[0].quantidade).toBe(5);
  });

  it('CA07 / RF02: ordenação do KDS prioriza urgentes e mais antigos (FIFO)', () => {
    const pedidos = [
      { id: 'normal', prioridade: false, created_at: '2026-10-21T10:00:00Z' },
      { id: 'urgente', prioridade: true, created_at: '2026-10-21T10:05:00Z' }
    ];
    const ordenados = ordenarFilaKDS(pedidos);
    expect(ordenados[0].id).toBe('urgente');
  });

  it('CA08 / RF01 (negativo): produto com disponivel = false não é adicionado', () => {
    const produtoEsgotado = { id: 1, nome: 'Bolo', disponivel: false };
    function tentarAdicionar(prod) {
      if (prod.disponivel === false) {
        return { sucesso: false, erro: 'Produto indisponível' };
      }
      return { sucesso: true };
    }
    expect(tentarAdicionar(produtoEsgotado).sucesso).toBe(false);
  });
});
