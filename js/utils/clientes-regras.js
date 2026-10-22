/**
 * CAF-000097 — Regras de Negócio e Validações de Clientes, Fiado e Catálogo de Produtos
 */

/**
 * Valida os dados de cadastro de um cliente.
 */
export function validarCadastroCliente(dados = {}) {
  const erros = [];
  const nome = String(dados.nome || '').trim();
  const telefoneLimpo = String(dados.telefone || '').replace(/\D/g, '');

  if (!nome) {
    erros.push('Nome do cliente é obrigatório.');
  }

  if (!telefoneLimpo || telefoneLimpo.length < 10) {
    erros.push('Telefone inválido ou não informado (mínimo 10 dígitos com DDD).');
  }

  const limiteCredito = Math.max(0, Number(dados.limite_credito) || 0);

  return {
    valido: erros.length === 0,
    erros,
    dadosFormatados: {
      nome,
      telefone: telefoneLimpo,
      limite_credito: limiteCredito,
      saldo_inicial: 0.00
    }
  };
}

/**
 * Calcula o limite de crédito disponível para fiado.
 * Saldo negativo representa dívida em aberto.
 */
export function calcularLimiteDisponivel(limiteCredito = 0, saldo = 0) {
  const limite = Math.max(0, Number(limiteCredito) || 0);
  const s = Number(saldo) || 0;
  // Ex: limite = 100, saldo = -60 => disponível = 100 + (-60) = 40
  // Ex: limite = 100, saldo = +20 => disponível = 100 + 20 = 120
  const disponivel = Math.max(0, Math.round((limite + s + Number.EPSILON) * 100) / 100);
  return disponivel;
}

/**
 * Valida se uma compra pode ser lançada na conta fiado do cliente.
 */
export function validarLancamentoFiado(limiteCredito = 0, saldoAtual = 0, valorCompra = 0) {
  const valor = Math.max(0, Number(valorCompra) || 0);
  if (valor <= 0) {
    return {
      autorizado: false,
      motivo: 'Valor da compra deve ser superior a R$ 0,00'
    };
  }

  const limiteDisp = calcularLimiteDisponivel(limiteCredito, saldoAtual);
  if (valor > limiteDisp) {
    return {
      autorizado: false,
      motivo: `Limite de fiado excedido. Disponível: R$ ${limiteDisp.toFixed(2).replace('.', ',')}, Compra: R$ ${valor.toFixed(2).replace('.', ',')}`,
      limiteDisponivel: limiteDisp
    };
  }

  const novoSaldo = Math.round((saldoAtual - valor + Number.EPSILON) * 100) / 100;
  return {
    autorizado: true,
    novoSaldo,
    novoLimiteDisponivel: calcularLimiteDisponivel(limiteCredito, novoSaldo)
  };
}

/**
 * Calcula o novo saldo após um pagamento (quitação total ou parcial de fiado).
 */
export function calcularNovoSaldoAposPagamento(saldoAtual = 0, valorPago = 0) {
  const s = Number(saldoAtual) || 0;
  const p = Math.max(0, Number(valorPago) || 0);
  const novoSaldo = Math.round((s + p + Number.EPSILON) * 100) / 100;

  return {
    saldoAnterior: s,
    valorPago: p,
    novoSaldo,
    totalmenteQuitado: novoSaldo >= 0
  };
}

/**
 * Valida o cadastro e edição de produtos no catálogo.
 */
export function validarCadastroProduto(dados = {}) {
  const erros = [];
  const nome = String(dados.nome || '').trim();
  const categoriaId = dados.categoria_id || dados.categoriaId;
  const preco = Number(dados.preco);

  if (!nome) {
    erros.push('Nome do produto é obrigatório.');
  }

  if (!categoriaId) {
    erros.push('Categoria do produto é obrigatória.');
  }

  if (isNaN(preco) || preco <= 0) {
    erros.push('Preço de venda deve ser maior que zero.');
  }

  return {
    valido: erros.length === 0,
    erros,
    produtoFormatado: {
      nome,
      categoria_id: categoriaId,
      preco: isNaN(preco) ? 0 : Math.round((preco + Number.EPSILON) * 100) / 100,
      ativo: dados.ativo !== false,
      disponivel: dados.disponivel !== false
    }
  };
}

/**
 * Altera status de disponibilidade de um produto (pausar / reativar).
 */
export function toggleDisponibilidadeProduto(produto = {}) {
  const novoStatusAtivo = !produto.ativo;
  return {
    ...produto,
    ativo: novoStatusAtivo,
    disponivel: novoStatusAtivo
  };
}

// Suporte browser global
if (typeof window !== 'undefined') {
  window.cafeteriaClientesRegras = {
    validarCadastroCliente,
    calcularLimiteDisponivel,
    validarLancamentoFiado,
    calcularNovoSaldoAposPagamento,
    validarCadastroProduto,
    toggleDisponibilidadeProduto
  };
}
