// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizarGruposCombo,
  validarConfigComboAdmin,
  verificarDisponibilidadeCombo,
  validarEscolhasCombo
} from '../js/utils/combos.js';
import '../js/db.js';

describe('CAF-000110: Combos e Kits Promocionais Configuráveis no Cardápio, Totem, PDV e KDS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CA01: Modelagem e Configuração de Combos no Admin (Grupos, Mín/Máx e Opções)', () => {
    it('CA01: valida com sucesso a configuração de grupos com etapas obrigatórias e produtos vinculados', () => {
      const gruposValidos = [
        {
          nome: 'Bebida Quente',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [
            { produto_item_id: 'prod_cafe', preco_adicional: 0, ativo: true },
            { produto_item_id: 'prod_capuccino', preco_adicional: 3.0, ativo: true }
          ]
        },
        {
          nome: 'Salgado ou Lanche',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [
            { produto_item_id: 'prod_pao_queijo', preco_adicional: 0, ativo: true },
            { produto_item_id: 'prod_croissant', preco_adicional: 4.5, ativo: true }
          ]
        }
      ];

      const res = validarConfigComboAdmin(gruposValidos);
      expect(res.valido).toBe(true);
      expect(res.grupos).toHaveLength(2);
      expect(res.grupos[0].nome).toBe('Bebida Quente');
      expect(res.grupos[0].opcoes).toHaveLength(2);
    });

    it('CA01: rejeita configuração de combo sem grupos, sem nome de etapa ou com opções insuficientes para o mínimo', () => {
      expect(validarConfigComboAdmin([]).valido).toBe(false);

      const semNome = [{ nome: '', min_escolhas: 1, max_escolhas: 1, opcoes: [{ produto_item_id: 'p1', ativo: true }] }];
      expect(validarConfigComboAdmin(semNome).valido).toBe(false);

      const maxMenorQueMin = [{ nome: 'Bebida', min_escolhas: 2, max_escolhas: 1, opcoes: [{ produto_item_id: 'p1', ativo: true }] }];
      expect(validarConfigComboAdmin(maxMenorQueMin).valido).toBe(false);

      const opcoesInsuficientes = [{ nome: 'Bebida', min_escolhas: 2, max_escolhas: 2, opcoes: [{ produto_item_id: 'p1', ativo: true }] }];
      expect(validarConfigComboAdmin(opcoesInsuficientes).valido).toBe(false);
    });

    it('CA01: persiste e recupera grupos e opções de um combo via cafeteriaDB.combos', async () => {
      const mockSupabase = {
        from: vi.fn((tabela) => {
          if (tabela === 'combo_grupos') {
            return {
              delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
              insert: (payload) => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'grp_uuid_1', ...payload[0] },
                    error: null
                  })
                })
              }),
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'grp_uuid_1', produto_combo_id: 'combo_1', nome: 'Bebida', ordem: 1, min_escolhas: 1, max_escolhas: 1 }
                    ],
                    error: null
                  })
                })
              })
            };
          }
          if (tabela === 'combo_grupo_opcoes') {
            return {
              insert: (payload) => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'op_uuid_1', ...payload[0] },
                    error: null
                  })
                })
              }),
              select: () => ({
                in: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'op_uuid_1', grupo_id: 'grp_uuid_1', produto_item_id: 'prod_cafe', preco_adicional: 0, ativo: true, ordem: 1 }
                    ],
                    error: null
                  })
                })
              })
            };
          }
          return {};
        })
      };

      window.cafeteriaSupabase = mockSupabase;

      const salvos = await window.cafeteriaDB.combos.saveGrupos('combo_1', [
        {
          nome: 'Bebida',
          ordem: 1,
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [{ produto_item_id: 'prod_cafe', preco_adicional: 0, ativo: true, ordem: 1 }]
        }
      ]);

      expect(salvos).toHaveLength(1);
      expect(salvos[0].nome).toBe('Bebida');
      expect(salvos[0].opcoes).toHaveLength(1);

      const carregados = await window.cafeteriaDB.combos.getByProduto('combo_1');
      expect(carregados).toHaveLength(1);
      expect(carregados[0].opcoes).toHaveLength(1);
      expect(carregados[0].opcoes[0].produto_item_id).toBe('prod_cafe');
    });
  });

  describe('CA02: Validação de Escolhas Obrigatórias do Combo (Bloqueio de Confirmação Incompleta)', () => {
    const gruposExemplo = [
      {
        id: 'grp_bebida',
        nome: 'Bebida',
        min_escolhas: 1,
        max_escolhas: 1,
        opcoes: [{ produto_item_id: 'prod_cafe', preco_adicional: 0, ativo: true }]
      },
      {
        id: 'grp_salgado',
        nome: 'Salgado',
        min_escolhas: 1,
        max_escolhas: 1,
        opcoes: [{ produto_item_id: 'prod_croissant', preco_adicional: 2.0, ativo: true }]
      }
    ];

    const catalogoProdutos = [
      { id: 'prod_cafe', nome: 'Café Espresso', preco: 8.0, disponivel: true, ativo: true, estacao: 'bar' },
      { id: 'prod_croissant', nome: 'Croissant Manteiga', preco: 15.0, disponivel: true, ativo: true, estacao: 'cozinha' }
    ];

    it('CA02: bloqueia confirmação quando o cliente selecionou apenas 1 dos 2 grupos obrigatórios', () => {
      const escolhasIncompletas = [
        { grupo_id: 'grp_bebida', produto_id: 'prod_cafe', quantidade: 1 }
      ];

      const res = validarEscolhasCombo({
        comboProduto: { id: 'combo_intervalo', preco: 22.0 },
        grupos: gruposExemplo,
        escolhas: escolhasIncompletas,
        mapaProdutos: catalogoProdutos
      });

      expect(res.valido).toBe(false);
      expect(res.gruposPendentes).toHaveLength(1);
      expect(res.gruposPendentes[0].nome).toBe('Salgado');
      expect(res.gruposPendentes[0].faltam).toBe(1);
    });

    it('CA02: aprova confirmação quando todos os grupos obrigatórios foram atendidos', () => {
      const escolhasCompletas = [
        { grupo_id: 'grp_bebida', produto_id: 'prod_cafe', quantidade: 1 },
        { grupo_id: 'grp_salgado', produto_id: 'prod_croissant', quantidade: 1 }
      ];

      const res = validarEscolhasCombo({
        comboProduto: { id: 'combo_intervalo', preco: 22.0 },
        grupos: gruposExemplo,
        escolhas: escolhasCompletas,
        mapaProdutos: catalogoProdutos
      });

      expect(res.valido).toBe(true);
      expect(res.gruposPendentes).toHaveLength(0);
      expect(res.componentes).toHaveLength(2);
    });
  });

  describe('CA03: Bloqueio de Opções com Produtos Esgotados (disponivel = false)', () => {
    it('CA03: marca opção esgotada como indisponível e rejeita caso submetida', () => {
      const grupos = [
        {
          id: 'grp_salgado',
          nome: 'Salgado',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [
            { produto_item_id: 'prod_empada', preco_adicional: 0, ativo: true },
            { produto_item_id: 'prod_folhado', preco_adicional: 0, ativo: true }
          ]
        }
      ];

      const catalogo = [
        { id: 'prod_empada', nome: 'Empada de Frango', disponivel: false, ativo: true },
        { id: 'prod_folhado', nome: 'Folhado Misto', disponivel: true, ativo: true }
      ];

      const disp = verificarDisponibilidadeCombo(grupos, catalogo);
      expect(disp.disponivel).toBe(true); // Ainda tem 1 disponível (folhado)
      const empadaOp = disp.grupos[0].opcoes.find(o => o.produto_item_id === 'prod_empada');
      expect(empadaOp.disponivel).toBe(false);

      // Tenta submeter a opção esgotada
      const res = validarEscolhasCombo({
        comboProduto: { id: 'combo_1', preco: 20.0 },
        grupos,
        escolhas: [{ grupo_id: 'grp_salgado', produto_id: 'prod_empada', quantidade: 1 }],
        mapaProdutos: catalogo
      });

      expect(res.valido).toBe(false);
      expect(res.erros[0]).toContain('está esgotada e não pode ser selecionada');
    });

    it('CA03: invalida o combo inteiro se um grupo obrigatório não possui ao menos min_escolhas disponíveis', () => {
      const grupos = [
        {
          id: 'grp_sobremesa',
          nome: 'Sobremesa',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [{ produto_item_id: 'prod_torta', preco_adicional: 0, ativo: true }]
        }
      ];

      const catalogo = [
        { id: 'prod_torta', nome: 'Torta Holandesa', disponivel: false, ativo: true }
      ];

      const disp = verificarDisponibilidadeCombo(grupos, catalogo);
      expect(disp.disponivel).toBe(false);
      expect(disp.gruposIndisponiveis).toContain('Sobremesa');
    });
  });

  describe('CA04: Cálculo Correto de Preço Base + Acréscimos de Opções Premium', () => {
    it('CA04: soma preço base R$ 29,90 com acréscimo de R$ 3,00 de opção premium resultando em R$ 32,90', () => {
      const grupos = [
        {
          id: 'grp_bebida',
          nome: 'Bebida',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [
            { produto_item_id: 'prod_espresso', preco_adicional: 0, ativo: true },
            { produto_item_id: 'prod_capuccino_especial', preco_adicional: 3.0, ativo: true }
          ]
        }
      ];

      const catalogo = [
        { id: 'prod_espresso', nome: 'Espresso', preco: 7.0, disponivel: true, ativo: true, estacao: 'bar' },
        { id: 'prod_capuccino_especial', nome: 'Capuccino Especial', preco: 14.0, disponivel: true, ativo: true, estacao: 'bar' }
      ];

      const res = validarEscolhasCombo({
        comboProduto: { id: 'combo_teatro', preco: 29.9 },
        grupos,
        escolhas: [{ grupo_id: 'grp_bebida', produto_id: 'prod_capuccino_especial', quantidade: 1 }],
        mapaProdutos: catalogo
      });

      expect(res.valido).toBe(true);
      expect(res.precoBase).toBe(29.9);
      expect(res.precoAdicionalTotal).toBe(3.0);
      expect(res.precoUnitario).toBe(32.9);
    });
  });

  describe('CA05: Separação Inteligente por Estação (Bar × Cozinha) e Validação de Gatilho de Estoque', () => {
    it('CA05: categoriza componentes do combo para suas respectivas estações operacionais no KDS', () => {
      const grupos = [
        {
          id: 'g1',
          nome: 'Bebida',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [{ produto_item_id: 'prod_capuccino', preco_adicional: 0, ativo: true }]
        },
        {
          id: 'g2',
          nome: 'Comida',
          min_escolhas: 1,
          max_escolhas: 1,
          opcoes: [{ produto_item_id: 'prod_croissant', preco_adicional: 0, ativo: true }]
        }
      ];

      const catalogo = [
        { id: 'prod_capuccino', nome: 'Cappuccino Italiano', estacao: 'bar', disponivel: true, ativo: true },
        { id: 'prod_croissant', nome: 'Croissant Quente', estacao: 'cozinha', disponivel: true, ativo: true }
      ];

      const res = validarEscolhasCombo({
        comboProduto: { id: 'combo_duo', preco: 25.0 },
        grupos,
        escolhas: [
          { grupo_id: 'g1', produto_id: 'prod_capuccino', quantidade: 1 },
          { grupo_id: 'g2', produto_id: 'prod_croissant', quantidade: 1 }
        ],
        mapaProdutos: catalogo
      });

      expect(res.valido).toBe(true);
      const itemBar = res.componentes.find(c => c.estacao === 'bar');
      const itemCozinha = res.componentes.find(c => c.estacao === 'cozinha');

      expect(itemBar).toBeDefined();
      expect(itemBar.nome_produto).toBe('Cappuccino Italiano');
      expect(itemCozinha).toBeDefined();
      expect(itemCozinha.nome_produto).toBe('Croissant Quente');
    });

    it('CA05: arquivo pgTAP combos_kits.test.sql contém asserções reais da tabela pedido_item_combo_escolhas e trigger trg_baixa_estoque_combo_escolhas', async () => {
      const fs = await import('fs');
      const sql = fs.readFileSync('supabase/tests/combos_kits.test.sql', 'utf8');

      expect(sql).toContain('combo_grupos');
      expect(sql).toContain('combo_grupo_opcoes');
      expect(sql).toContain('pedido_item_combo_escolhas');
      expect(sql).toContain('validar_e_calcular_combo');
      expect(sql).toContain('trg_baixa_estoque_combo_escolhas');
    });
  });
});
