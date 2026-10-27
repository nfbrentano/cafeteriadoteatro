/**
 * Gerador Determinístico de Pedidos Aleatórios (PRNG com Seed)
 * CAF-000105 — Testes Automatizados de Fluxo Completo de Pedidos com Variações
 */

/**
 * Cria um gerador pseudo-aleatório baseado no algoritmo LCG (Linear Congruential Generator)
 * Garante reprodutibilidade idêntica em qualquer ambiente para uma mesma seed.
 * @param {number} seed Semente inicial (padrão: 42)
 * @returns {() => number} Função que retorna número entre 0 (inclusive) e 1 (exclusive)
 */
export function createPrng(seed = 42) {
  let s = Math.abs(Math.floor(seed)) || 42;
  return function next() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Escolhe um elemento aleatório de uma lista.
 */
export function randomChoice(arr, rng) {
  if (!arr || arr.length === 0) return null;
  const index = Math.floor(rng() * arr.length);
  return arr[index];
}

/**
 * Retorna um inteiro aleatório entre min e max (inclusivos).
 */
export function randomInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Catálogo expandido padrão para testes de pedidos aleatórios.
 */
export const CATALOGO_TESTE = {
  categorias: [
    { id: 'c1', nome: 'Cafés', ativo: true, ordem: 1 },
    { id: 'c2', nome: 'Doces', ativo: true, ordem: 2 },
    { id: 'c3', nome: 'Salgados', ativo: true, ordem: 3 },
    { id: 'c4', nome: 'Bebidas', ativo: true, ordem: 4 }
  ],
  produtos: [
    { id: 'p1', nome: 'Espresso', preco: 8.0, categoria_id: 'c1', ativo: true, disponivel: true, permite_adicionais: false },
    { id: 'p2', nome: 'Cappuccino Italiano', preco: 14.0, categoria_id: 'c1', ativo: true, disponivel: true, permite_adicionais: true },
    { id: 'p4', nome: 'Fatia de Torta Holandesa', preco: 18.0, categoria_id: 'c2', ativo: true, disponivel: true, permite_adicionais: false },
    { id: 'p5', nome: 'Pão de Queijo Mineiro', preco: 7.5, categoria_id: 'c3', ativo: true, disponivel: true, permite_adicionais: false },
    { id: 'p6', nome: 'Suco Natural Laranja', preco: 10.0, categoria_id: 'c4', ativo: true, disponivel: true, permite_adicionais: false }
  ],
  adicionais: [
    { id: 'ad1', nome: 'Chantilly', preco: 3.5, ativo: true },
    { id: 'ad2', nome: 'Canela em Pó', preco: 1.0, ativo: true }
  ],
  v_adicionais_produto: [
    { produto_id: 'p2', adicional_id: 'ad1', adicional_nome: 'Chantilly', nome: 'Chantilly', preco: 3.5, ordem: 1 },
    { produto_id: 'p2', adicional_id: 'ad2', adicional_nome: 'Canela em Pó', nome: 'Canela em Pó', preco: 1.0, ordem: 2 }
  ],
  mesas: [
    { id: 'm1', codigo: '01', status: 'livre', ativo: true },
    { id: 'm2', codigo: '02', status: 'livre', ativo: true },
    { id: 'm3', codigo: '03', status: 'livre', ativo: true },
    { id: 'm4', codigo: '04', status: 'livre', ativo: true },
    { id: 'm5', codigo: '05', status: 'livre', ativo: true }
  ],
  clientes: [
    {
      id: 'c_hab',
      nome: 'Carlos Habilitado',
      telefone: '11999990001',
      conta_habilitada: true,
      saldo_conta: 100.0,
      limite_fiado: 200.0
    },
    {
      id: 'c_des',
      nome: 'Daniela Desabilitada',
      telefone: '11999990002',
      conta_habilitada: false,
      saldo_conta: 0,
      limite_fiado: 0
    }
  ]
};

export const MOTIVOS_PRIORIDADE = ['Espetáculo', 'Refazer', 'Reclamação', 'Outro'];
export const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'conta_cliente'];

/**
 * Gera um pedido aleatório balanceado e calcula os valores esperados pelo oráculo.
 * @param {Object} options Configurações de restrição opcional
 * @param {() => number} rng Gerador de números pseudo-aleatórios
 */
export function gerarPedidoAleatorio(options = {}, rng = createPrng()) {
  const produtosDisponiveis = CATALOGO_TESTE.produtos.filter(p => p.disponivel && p.ativo);
  const mesasDisponiveis = CATALOGO_TESTE.mesas.filter(m => m.ativo);

  // 1. Destino (Levar vs. Mesa)
  const destinoTipo = options.forcarDestino || (rng() < 0.5 ? 'levar' : 'mesa');
  const mesaSorteada = destinoTipo === 'mesa' ? randomChoice(mesasDisponiveis, rng).codigo : null;

  // 2. Itens do pedido (1 a 3 itens diferentes)
  const qtdItens = options.qtdItens || randomInt(1, 2, rng);
  const itens = [];
  const produtosUsados = new Set();

  for (let i = 0; i < qtdItens; i++) {
    const prod = randomChoice(produtosDisponiveis.filter(p => !produtosUsados.has(p.id)), rng);
    if (!prod) break;
    produtosUsados.add(prod.id);

    const quantidade = randomInt(1, 2, rng);
    const adicionaisItem = [];

    if (prod.permite_adicionais && rng() < 0.6) {
      const adsDoProduto = CATALOGO_TESTE.v_adicionais_produto
        .filter(va => va.produto_id === prod.id)
        .map(va => CATALOGO_TESTE.adicionais.find(a => a.id === va.adicional_id))
        .filter(Boolean);

      if (adsDoProduto.length > 0) {
        // Escolhe 1 ou mais adicionais
        const adSorteado = randomChoice(adsDoProduto, rng);
        if (adSorteado) adicionaisItem.push(adSorteado);
      }
    }

    itens.push({
      produto: prod,
      quantidade,
      adicionais: adicionaisItem
    });
  }

  // 3. Prioridade (Normal, Prioritário com motivo, ou Intervalo)
  let prioridadeTipo = options.forcarPrioridade;
  if (!prioridadeTipo) {
    const sorteioPrioridade = rng();
    if (sorteioPrioridade < 0.5) {
      prioridadeTipo = 'normal';
    } else if (sorteioPrioridade < 0.8) {
      prioridadeTipo = 'prioritario';
    } else {
      prioridadeTipo = 'intervalo';
    }
  }

  const motivoPrioridade = prioridadeTipo === 'prioritario' 
    ? (options.motivoPrioridade || randomChoice(MOTIVOS_PRIORIDADE, rng))
    : (prioridadeTipo === 'intervalo' ? 'Espetáculo (Intervalo)' : null);

  // 4. Forma de Pagamento
  const formaPagamento = options.forcarPagamento || randomChoice(FORMAS_PAGAMENTO, rng);
  const pago = formaPagamento === 'conta_cliente' ? true : (rng() < 0.5);

  // 5. Cliente
  let cliente = null;
  if (formaPagamento === 'conta_cliente') {
    cliente = CATALOGO_TESTE.clientes.find(c => c.conta_habilitada);
  } else if (rng() < 0.3) {
    cliente = 'Cliente Avulso ' + randomInt(10, 99, rng);
  }

  // 6. Observação
  const obs = rng() < 0.3 ? 'Obs aleatória ' + randomInt(1, 50, rng) : '';

  // 7. Cálculo do Total Esperado (Oráculo)
  const totalEsperado = itens.reduce((acc, item) => {
    const precoUnitario = item.produto.preco + item.adicionais.reduce((s, a) => s + a.preco, 0);
    return acc + (precoUnitario * item.quantidade);
  }, 0);

  return {
    destinoTipo,
    mesaCodigo: destinoTipo === 'levar' ? 'BALCAO' : mesaSorteada,
    paraViagem: destinoTipo === 'levar',
    itens,
    prioridadeTipo,
    prioridadeFlag: prioridadeTipo !== 'normal' ? 1 : 0,
    motivoPrioridade,
    isIntervalo: prioridadeTipo === 'intervalo',
    formaPagamento,
    pago,
    statusPagamento: (formaPagamento === 'conta_cliente' || pago) ? 'pago' : 'pendente',
    cliente,
    observacao: obs,
    totalEsperado: Math.round(totalEsperado * 100) / 100
  };
}
