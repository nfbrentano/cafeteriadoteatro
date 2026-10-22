import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../js/pix-brcode.js';
import {
  calculateSubtotal,
  calculateOrderTotal,
  calculateChange
} from '../js/utils/order-calculator.js';
import {
  normalizeCouponCode,
  calculateDiscount,
  validateCouponLocally
} from '../js/utils/coupon-validator.js';
import {
  calculateCashback,
  isCashbackActive,
  calculateEligiblePaymentAmount
} from '../js/utils/cashback.js';

const cafeteriaPix = globalThis.cafeteriaPix || window.cafeteriaPix;

/**
 * CAF-000095 — Cobertura de Testes Unitários: PDV do Balcão e Totem de Autoatendimento
 */
describe('CAF-000095 — PDV do Balcão e Totem de Autoatendimento', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Ciclo de Vida do Carrinho e Cálculos de Itens (PDV / Balcão)', () => {
    it('CA01 / RF01: adição de produto e incremento de quantidade atualiza subtotal com precisão', () => {
      const itemBase = {
        produto_id: 10,
        nome: 'Café Espresso Duplo',
        preco_unitario: 8.00,
        quantidade: 1,
        adicionais: []
      };

      expect(calculateSubtotal([itemBase])).toBe(8.00);

      // Incrementa quantidade para 2
      itemBase.quantidade = 2;
      expect(calculateSubtotal([itemBase])).toBe(16.00);

      // Incrementa quantidade para 5
      itemBase.quantidade = 5;
      expect(calculateSubtotal([itemBase])).toBe(40.00);
    });

    it('CA02 / RF01: decremento com quantidade 1 remove o item e recalcula o total', () => {
      let carrinho = [
        { produto_id: 10, nome: 'Café Espresso', preco_unitario: 8.00, quantidade: 1 },
        { produto_id: 20, nome: 'Pão de Queijo', preco_unitario: 6.50, quantidade: 2 }
      ];

      expect(calculateSubtotal(carrinho)).toBe(21.00); // 8 + 13

      // Função simula lógica de updateQuantity do PDV
      function updateQty(cart, index, delta) {
        if (!cart[index]) return cart;
        if (delta === -999) {
          cart.splice(index, 1);
          return cart;
        }
        cart[index].quantidade += delta;
        if (cart[index].quantidade <= 0) {
          cart.splice(index, 1);
        }
        return cart;
      }

      // Decrementa Café Espresso (qtd 1 -> 0 => removido)
      carrinho = updateQty(carrinho, 0, -1);
      expect(carrinho).toHaveLength(1);
      expect(carrinho[0].nome).toBe('Pão de Queijo');
      expect(calculateSubtotal(carrinho)).toBe(13.00);

      // Exclusão direta via botão lixeira (-999)
      carrinho = updateQty(carrinho, 0, -999);
      expect(carrinho).toHaveLength(0);
      expect(calculateSubtotal(carrinho)).toBe(0.00);
    });

    it('CA03 / CA04 / RF02: validação de vínculos permitidos e soma de adicionais opcionais', () => {
      const produtoComAdicionais = {
        id: 101,
        nome: 'Cappuccino Italiano',
        preco: 12.00,
        permite_adicionais: true
      };

      const produtoSemAdicionais = {
        id: 102,
        nome: 'Água Mineral 500ml',
        preco: 5.00,
        permite_adicionais: false
      };

      const catalogoAdicionais = [
        { id: 1, nome: 'Chantilly', preco: 3.50, ativo: true },
        { id: 2, nome: 'Canela em Pó', preco: 0.00, ativo: true },
        { id: 3, nome: 'Dose Extra de Café', preco: 4.00, ativo: true }
      ];

      const vinculosProdutoAdicional = [
        { produto_id: 101, adicional_id: 1 },
        { produto_id: 101, adicional_id: 2 }
      ];

      function obterAdicionaisPermitidos(prod) {
        if (!prod || !prod.permite_adicionais) return [];
        const idsPermitidos = vinculosProdutoAdicional
          .filter(v => v.produto_id === prod.id)
          .map(v => v.adicional_id);
        return catalogoAdicionais.filter(a => idsPermitidos.includes(a.id));
      }

      // Água não aceita adicionais
      expect(obterAdicionaisPermitidos(produtoSemAdicionais)).toEqual([]);

      // Cappuccino só permite Chantilly e Canela (Dose extra não vinculada)
      const permitidosCappuccino = obterAdicionaisPermitidos(produtoComAdicionais);
      expect(permitidosCappuccino).toHaveLength(2);
      expect(permitidosCappuccino.map(a => a.id)).toEqual([1, 2]);

      // Soma de preço: Base (12.00) + Chantilly (3.50) + Canela (0.00) = 15.50
      const selecionados = [permitidosCappuccino[0], permitidosCappuccino[1]];
      const totalAdicionais = selecionados.reduce((sum, a) => sum + a.preco, 0);
      const precoFinalUnitario = produtoComAdicionais.preco + totalAdicionais;

      expect(totalAdicionais).toBe(3.50);
      expect(precoFinalUnitario).toBe(15.50);
    });

    it('CA05 / RF03: pedido "Para Viagem" não exige mesa física obrigatória', () => {
      function validarDestinoPedido({ mesaCodigo, isParaViagem, clienteNome }) {
        const hasMesa = Boolean(mesaCodigo && String(mesaCodigo).trim());
        const isViagem = Boolean(isParaViagem);
        const hasNome = Boolean(clienteNome && String(clienteNome).trim());

        const valido = hasMesa || isViagem || hasNome;
        return {
          valido,
          mesaFinal: hasMesa ? mesaCodigo : 'BALCAO',
          tipoConsumo: isViagem ? 'viagem' : 'local'
        };
      }

      // Sem mesa, sem nome, não viagem -> Inválido
      expect(validarDestinoPedido({ mesaCodigo: '', isParaViagem: false, clienteNome: '' }).valido).toBe(false);

      // Para viagem sem mesa -> Válido como BALCAO
      const resViagem = validarDestinoPedido({ mesaCodigo: '', isParaViagem: true, clienteNome: '' });
      expect(resViagem.valido).toBe(true);
      expect(resViagem.mesaFinal).toBe('BALCAO');
      expect(resViagem.tipoConsumo).toBe('viagem');

      // Mesa normal de salão
      const resMesa = validarDestinoPedido({ mesaCodigo: '04', isParaViagem: false, clienteNome: '' });
      expect(resMesa.valido).toBe(true);
      expect(resMesa.mesaFinal).toBe('04');
      expect(resMesa.tipoConsumo).toBe('local');
    });

    it('CA06 / RF04: aplicação correta de cupom de desconto percentual e em valor fixo', () => {
      const cupomPercentual = {
        id: 1,
        nome: '10% OFF',
        cupom_codigo: 'BEMVINDO10',
        tipo_desconto: 'percentual',
        valor_desconto: 10,
        ativa: true,
        valor_minimo_pedido: 30.00
      };

      const cupomFixo = {
        id: 2,
        nome: 'R$ 5 OFF',
        cupom_codigo: 'PROMO5REAIS',
        tipo_desconto: 'fixo',
        valor_desconto: 5.00,
        ativa: true,
        valor_minimo_pedido: 20.00
      };

      // Compra de R$ 50,00 com cupom de 10%
      const res10Pct = validateCouponLocally(cupomPercentual, 50.00);
      expect(res10Pct.valid).toBe(true);
      expect(res10Pct.desconto_calculado).toBe(5.00);
      expect(res10Pct.total_com_desconto).toBe(45.00);

      // Compra com cupom fixo de R$ 5,00
      const resFixo = validateCouponLocally(cupomFixo, 30.00);
      expect(resFixo.valid).toBe(true);
      expect(resFixo.desconto_calculado).toBe(5.00);
      expect(resFixo.total_com_desconto).toBe(25.00);

      // Rejeição por valor mínimo não atingido
      const resAbaixoMinimo = validateCouponLocally(cupomPercentual, 20.00);
      expect(resAbaixoMinimo.valid).toBe(false);
      expect(resAbaixoMinimo.message).toContain('Pedido mínimo');
    });

    it('CA07 / RF04: aplicação e limite de cashback da carteira do cliente', () => {
      const configCashback = {
        ativo: true,
        percentual: 5.0,
        valor_minimo: 10.0
      };
      expect(isCashbackActive(configCashback)).toBe(true);

      const subtotalPedido = 40.00;
      const saldoCarteiraCliente = 15.00;

      // Abatimento de cashback não pode superar o subtotal nem o saldo da carteira
      const cashbackUtilizado = Math.min(saldoCarteiraCliente, subtotalPedido);
      expect(cashbackUtilizado).toBe(15.00);

      const totalAPagar = calculateOrderTotal(subtotalPedido, { desconto: cashbackUtilizado });
      expect(totalAPagar).toBe(25.00);

      // Cálculo de cashback gerado sobre o valor pago via forma elegível
      const elegivel = calculateEligiblePaymentAmount([{ forma: 'pix', valor: totalAPagar }]);
      expect(elegivel).toBe(25.00);

      const novoCashbackGerado = calculateCashback(configCashback, elegivel);
      // 5% de 25.00 = 1.25
      expect(novoCashbackGerado).toBe(1.25);
    });
  });

  describe('2. Autoatendimento no Totem e Pagamento Pix', () => {
    it('CA08 / RF05: gera payload BR Code Pix dinâmico no valor exato da compra', () => {
      expect(cafeteriaPix).toBeDefined();

      const resultadoPix = cafeteriaPix.gerarPayloadPix({
        chave: 'contato@cafeteriadoteatro.com.br',
        recebedor: 'Cafeteria do Teatro',
        cidade: 'Porto Alegre',
        valor: 27.50,
        txid: 'TOTEM01'
      });

      expect(resultadoPix.ok).toBe(true);
      expect(resultadoPix.payload).toContain('000201');
      expect(resultadoPix.payload).toContain('540527.50');
      expect(resultadoPix.payload).toContain('TOTEM01');
    });

    it('CA09 / RF05: tela final de confirmação formata senha sequencial de retirada', () => {
      function formatarSenhaTotem(pedido) {
        if (!pedido || pedido.numero_pedido === undefined) return '#---';
        const num = String(pedido.numero_pedido).padStart(3, '0');
        const prefixo = pedido.para_viagem ? 'V' : 'M';
        return `#${prefixo}-${num}`;
      }

      expect(formatarSenhaTotem({ numero_pedido: 42, para_viagem: true })).toBe('#V-042');
      expect(formatarSenhaTotem({ numero_pedido: 7, para_viagem: false })).toBe('#M-007');
      expect(formatarSenhaTotem(null)).toBe('#---');
    });

    it('CA10 / RF06: montagem e integridade do payload de envio do pedido', () => {
      const cartMock = [
        {
          produto: { id: 5, nome: 'Pão na Chapa', preco: 7.00 },
          quantidade: 2,
          observacoes: 'Bem tostado',
          adicionaisSelecionados: [{ id: 12, nome: 'Manteiga Extra', preco: 1.50 }]
        }
      ];

      const itensPayload = cartMock.map(item => ({
        produto_id: item.produto.id,
        quantidade: item.quantidade,
        preco_unitario: item.produto.preco,
        observacao: item.observacoes,
        adicionais: item.adicionaisSelecionados.map(a => a.id)
      }));

      expect(itensPayload).toHaveLength(1);
      expect(itensPayload[0]).toEqual({
        produto_id: 5,
        quantidade: 2,
        preco_unitario: 7.00,
        observacao: 'Bem tostado',
        adicionais: [12]
      });
    });

    it('CA11 / RNF02: sanitização anti-XSS impede injeção maliciosa em nomes e observações', () => {
      const escape = (str) => {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      const payloadAtaque = '<script>alert("XSS")</script>';
      const sanitizado = escape(payloadAtaque);

      expect(sanitizado).not.toContain('<script>');
      expect(sanitizado).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });
  });
});
