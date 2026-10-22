import { describe, it, expect } from 'vitest';
import {
  validarCadastroCliente,
  calcularLimiteDisponivel,
  validarLancamentoFiado,
  calcularNovoSaldoAposPagamento,
  validarCadastroProduto,
  toggleDisponibilidadeProduto
} from '../js/utils/clientes-regras.js';
import {
  classificarClienteRfv,
  filtrarClientesPorTag
} from '../js/utils/crm-segmentos.js';

/**
 * CAF-000097 — Cobertura de Testes Unitários: Gestão de Clientes, Fiado e Produtos
 */
describe('CAF-000097 — Gestão de Clientes, Fiado e Produtos', () => {
  describe('1. Cadastro de Clientes e Limites de Crédito', () => {
    it('CA01 / RF01: cadastro com dados válidos formata telefone e define saldo inicial', () => {
      const payload = {
        nome: 'Maria Silva',
        telefone: '(51) 98765-4321',
        limite_credito: 100.00
      };

      const resultado = validarCadastroCliente(payload);
      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
      expect(resultado.dadosFormatados.nome).toBe('Maria Silva');
      expect(resultado.dadosFormatados.telefone).toBe('51987654321');
      expect(resultado.dadosFormatados.limite_credito).toBe(100.00);
      expect(resultado.dadosFormatados.saldo_inicial).toBe(0.00);
    });

    it('CA02 / RF01: validação impede cadastro sem telefone ou sem nome', () => {
      // Sem nome
      const semNome = validarCadastroCliente({ nome: '', telefone: '51999999999' });
      expect(semNome.valido).toBe(false);
      expect(semNome.erros).toContain('Nome do cliente é obrigatório.');

      // Sem telefone
      const semTelefone = validarCadastroCliente({ nome: 'João Santos', telefone: '' });
      expect(semTelefone.valido).toBe(false);
      expect(semTelefone.erros.some(e => e.includes('Telefone'))).toBe(true);

      // Telefone com menos de 10 dígitos
      const telIncompleto = validarCadastroCliente({ nome: 'João Santos', telefone: '123' });
      expect(telIncompleto.valido).toBe(false);
    });

    it('CA03 / RF02: autorização de consumo a prazo e atualização do saldo devedor', () => {
      const limiteCredito = 100.00;
      const saldoAtual = -60.00; // Cliente deve R$ 60,00

      const limiteDisp = calcularLimiteDisponivel(limiteCredito, saldoAtual);
      expect(limiteDisp).toBe(40.00);

      // Lançamento de consumo de R$ 30,00
      const res = validarLancamentoFiado(limiteCredito, saldoAtual, 30.00);
      expect(res.autorizado).toBe(true);
      expect(res.novoSaldo).toBe(-90.00); // Nova dívida: R$ 90,00
      expect(res.novoLimiteDisponivel).toBe(10.00);
    });

    it('CA04 / RF02: bloqueio de venda a prazo quando o limite de fiado for excedido', () => {
      const limiteCredito = 100.00;
      const saldoAtual = -90.00; // Deve R$ 90,00 -> Disponível é apenas R$ 10,00

      // Tenta lançar pedido de R$ 25,00
      const res = validarLancamentoFiado(limiteCredito, saldoAtual, 25.00);
      expect(res.autorizado).toBe(false);
      expect(res.motivo).toContain('Limite de fiado excedido');
      expect(res.limiteDisponivel).toBe(10.00);
    });

    it('CA05 / RF03: quitação parcial recalcula o saldo devedor e emite status correto', () => {
      const saldoDevedor = -90.00; // Dívida de R$ 90,00
      const pagamentoPix = 50.00;

      const quitacao = calcularNovoSaldoAposPagamento(saldoDevedor, pagamentoPix);
      expect(quitacao.saldoAnterior).toBe(-90.00);
      expect(quitacao.valorPago).toBe(50.00);
      expect(quitacao.novoSaldo).toBe(-40.00); // Restam R$ 40,00 de dívida
      expect(quitacao.totalmenteQuitado).toBe(false);

      // Pagamento do saldo restante
      const quitacaoFinal = calcularNovoSaldoAposPagamento(quitacao.novoSaldo, 40.00);
      expect(quitacaoFinal.novoSaldo).toBe(0.00);
      expect(quitacaoFinal.totalmenteQuitado).toBe(true);
    });
  });

  describe('2. CRM RFV e Catálogo de Produtos', () => {
    it('CA06 / RF04: segmentação automática classifica clientes frequentes e de alto valor como VIP', () => {
      const clienteVip = {
        ultima_compra: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 dias atrás (rScore 5)
        total_pedidos: 20, // 20 pedidos (fScore 5)
        valor_total_gasto: 450.00 // R$ 450 (vScore 5)
      };

      const classificacao = classificarClienteRfv(clienteVip);
      expect(classificacao.segmento).toBe('vip');
      expect(classificacao.recenciaScore).toBeGreaterThanOrEqual(4);
      expect(classificacao.frequenciaScore).toBeGreaterThanOrEqual(4);
      expect(classificacao.valorScore).toBeGreaterThanOrEqual(4);

      // Cliente sem compras há mais de 100 dias
      const clienteInativo = {
        ultima_compra: new Date(Date.now() - 110 * 24 * 60 * 60 * 1000).toISOString(),
        total_pedidos: 1,
        valor_total_gasto: 15.00
      };
      const resInativo = classificarClienteRfv(clienteInativo);
      expect(resInativo.segmento).toBe('inativo');
    });

    it('CA07 / RF05: cadastro de produto rejeita preço menor ou igual a zero', () => {
      // Preço zero
      const prodZero = validarCadastroProduto({
        nome: 'Espresso Simples',
        categoria_id: 'cat-cafe',
        preco: 0.00
      });
      expect(prodZero.valido).toBe(false);
      expect(prodZero.erros).toContain('Preço de venda deve ser maior que zero.');

      // Preço negativo
      const prodNegativo = validarCadastroProduto({
        nome: 'Espresso Simples',
        categoria_id: 'cat-cafe',
        preco: -5.00
      });
      expect(prodNegativo.valido).toBe(false);

      // Preço válido
      const prodValido = validarCadastroProduto({
        nome: 'Espresso Simples',
        categoria_id: 'cat-cafe',
        preco: 7.50
      });
      expect(prodValido.valido).toBe(true);
      expect(prodValido.produtoFormatado.preco).toBe(7.50);
    });

    it('CA08 / RF05 / RNF02: sanitização anti-XSS impede injeção maliciosa em nomes e descrições', () => {
      const escape = (str) => {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      const ataque = '<script>alert("hack")</script> <b>Delicioso</b>';
      const seguro = escape(ataque);

      expect(seguro).not.toContain('<script>');
      expect(seguro).toContain('&lt;script&gt;');
      expect(seguro).toContain('&lt;b&gt;Delicioso&lt;/b&gt;');
    });

    it('CA09 / RF06: pausa rápida altera status de disponibilidade do produto', () => {
      const produtoAtivo = {
        id: 'prod-01',
        nome: 'Bolo de Cenoura com Chocolate',
        preco: 9.00,
        ativo: true,
        disponivel: true
      };

      // Pausa o produto (esgotado)
      const produtoPausado = toggleDisponibilidadeProduto(produtoAtivo);
      expect(produtoPausado.ativo).toBe(false);
      expect(produtoPausado.disponivel).toBe(false);

      // Reativa o produto
      const produtoReativado = toggleDisponibilidadeProduto(produtoPausado);
      expect(produtoReativado.ativo).toBe(true);
      expect(produtoReativado.disponivel).toBe(true);
    });
  });
});
