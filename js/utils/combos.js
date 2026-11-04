/**
 * CAF-000110: Utilitário de Combos e Kits Configuráveis (Admin, Cardápio, Totem, PDV e KDS)
 */

export function normalizarGruposCombo(grupos = []) {
  if (!Array.isArray(grupos)) return [];
  return grupos
    .map((g, idx) => ({
      id: g.id || `grp_${idx + 1}`,
      produto_combo_id: g.produto_combo_id || null,
      nome: String(g.nome || '').trim(),
      ordem: Number(g.ordem) || idx + 1,
      min_escolhas: Math.max(0, parseInt(g.min_escolhas ?? 1, 10) || 0),
      max_escolhas: Math.max(1, parseInt(g.max_escolhas ?? 1, 10) || 1),
      opcoes: Array.isArray(g.opcoes)
        ? g.opcoes.map((op, opIdx) => ({
            id: op.id || `op_${idx + 1}_${opIdx + 1}`,
            grupo_id: g.id || `grp_${idx + 1}`,
            produto_item_id: String(op.produto_item_id || op.produto_id || '').trim(),
            preco_adicional: Math.max(0, Number(op.preco_adicional) || 0),
            ativo: op.ativo !== false,
            ordem: Number(op.ordem) || opIdx + 1
          }))
        : []
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

export function validarConfigComboAdmin(grupos = []) {
  const norm = normalizarGruposCombo(grupos);
  if (norm.length === 0) {
    return { valido: false, erro: 'Um produto do tipo Combo deve possuir ao menos 1 grupo de escolha.' };
  }
  for (const g of norm) {
    if (!g.nome) {
      return { valido: false, erro: 'Todos os grupos do combo devem ter um nome (ex: Bebida, Salgado).' };
    }
    if (g.max_escolhas < g.min_escolhas) {
      return { valido: false, erro: `No grupo "${g.nome}", o máximo de escolhas não pode ser menor que o mínimo.` };
    }
    const opcoesAtivas = g.opcoes.filter(o => o.ativo && o.produto_item_id);
    if (opcoesAtivas.length < Math.max(1, g.min_escolhas)) {
      return {
        valido: false,
        erro: `O grupo "${g.nome}" exige ao menos ${Math.max(1, g.min_escolhas)} produto(s) vinculado(s).`
      };
    }
  }
  return { valido: true, grupos: norm };
}

function getProdutoFromMapa(mapaOuListaProdutos, produtoId) {
  if (!mapaOuListaProdutos || !produtoId) return null;
  if (mapaOuListaProdutos instanceof Map) {
    return mapaOuListaProdutos.get(String(produtoId)) || null;
  }
  if (Array.isArray(mapaOuListaProdutos)) {
    return mapaOuListaProdutos.find(p => String(p.id) === String(produtoId)) || null;
  }
  if (typeof mapaOuListaProdutos === 'object') {
    return mapaOuListaProdutos[String(produtoId)] || null;
  }
  return null;
}

export function verificarDisponibilidadeCombo(grupos = [], mapaProdutos = []) {
  const norm = normalizarGruposCombo(grupos);
  if (norm.length === 0) return { disponivel: false, gruposIndisponiveis: [] };

  const gruposIndisponiveis = [];
  const gruposDetalhados = norm.map(g => {
    const opcoesEnriquecidas = g.opcoes
      .filter(op => op.ativo !== false)
      .map(op => {
        const prod = getProdutoFromMapa(mapaProdutos, op.produto_item_id);
        const prodDisponivel = prod ? (prod.ativo !== false && prod.disponivel !== false) : false;
        return {
          ...op,
          nome_produto: prod?.nome || op.nome_produto || op.produto_item_id,
          estacao: prod?.estacao || op.estacao || 'bar',
          disponivel: prodDisponivel
        };
      });

    const qtdDisponiveis = opcoesEnriquecidas.filter(o => o.disponivel).length;
    if (g.min_escolhas > 0 && qtdDisponiveis < g.min_escolhas) {
      gruposIndisponiveis.push(g.nome);
    }

    return {
      ...g,
      opcoes: opcoesEnriquecidas
    };
  });

  return {
    disponivel: gruposIndisponiveis.length === 0,
    gruposIndisponiveis,
    grupos: gruposDetalhados
  };
}

export function validarEscolhasCombo({
  comboProduto,
  grupos = [],
  escolhas = [],
  mapaProdutos = []
} = {}) {
  const precoBase = Math.max(0, Number(comboProduto?.preco) || 0);
  const disp = verificarDisponibilidadeCombo(grupos, mapaProdutos);
  const listaEscolhas = Array.isArray(escolhas) ? escolhas : [];

  const gruposPendentes = [];
  const erros = [];
  let precoAdicionalTotal = 0;
  const componentes = [];

  for (const g of disp.grupos) {
    const escolhasGrupo = listaEscolhas.filter(
      e => String(e.grupo_id) === String(g.id) || String(e.grupo_nome) === String(g.nome)
    );
    const qtdEscolhida = escolhasGrupo.reduce((acc, e) => acc + (Math.max(1, parseInt(e.quantidade, 10) || 1)), 0);

    if (qtdEscolhida < g.min_escolhas) {
      gruposPendentes.push({
        grupo_id: g.id,
        nome: g.nome,
        faltam: g.min_escolhas - qtdEscolhida
      });
    }
    if (qtdEscolhida > g.max_escolhas) {
      erros.push(`Máximo de ${g.max_escolhas} escolha(s) permitido em "${g.nome}".`);
    }

    for (const esc of escolhasGrupo) {
      const prodId = String(esc.produto_id || esc.produto_item_id || '');
      const opcaoCfg = g.opcoes.find(o => String(o.produto_item_id) === prodId);
      if (!opcaoCfg) {
        erros.push(`Opção "${prodId}" não pertence ao grupo "${g.nome}".`);
        continue;
      }
      if (!opcaoCfg.disponivel) {
        erros.push(`A opção "${opcaoCfg.nome_produto}" está esgotada e não pode ser selecionada.`);
        continue;
      }
      const qtd = Math.max(1, parseInt(esc.quantidade, 10) || 1);
      const adicionalUnit = Math.max(0, Number(opcaoCfg.preco_adicional) || 0);
      precoAdicionalTotal += adicionalUnit * qtd;

      componentes.push({
        grupo_id: g.id,
        grupo_nome: g.nome,
        produto_id: opcaoCfg.produto_item_id,
        nome_produto: opcaoCfg.nome_produto,
        estacao: opcaoCfg.estacao || 'bar',
        preco_adicional: adicionalUnit,
        quantidade: qtd
      });
    }
  }

  const valido = gruposPendentes.length === 0 && erros.length === 0 && disp.grupos.length > 0;
  const precoUnitario = Math.round((precoBase + precoAdicionalTotal) * 100) / 100;

  return {
    valido,
    gruposPendentes,
    erros,
    erro: erros[0] || (gruposPendentes[0] ? `Selecione "${gruposPendentes[0].nome}" para continuar.` : null),
    precoBase,
    precoAdicionalTotal: Math.round(precoAdicionalTotal * 100) / 100,
    precoUnitario,
    componentes
  };
}

/**
 * CAF-000110 (CA05): Separa os itens de um pedido (incluindo componentes de Combos)
 * por estação do KDS ('bar' vs 'cozinha') e calcula as baixas de ficha técnica no estoque.
 */
export function rotearComboPorEstacaoKds(itemPedido, estacaoFiltro = 'todas') {
  if (!itemPedido || itemPedido.cancelado) return [];
  const escolhas = itemPedido.combo_escolhas || itemPedido.pedido_item_combo_escolhas || [];

  if (!Array.isArray(escolhas) || escolhas.length === 0) {
    const estItem = itemPedido.estacao || 'bar';
    if (estacaoFiltro === 'todas' || estItem === estacaoFiltro) {
      return [itemPedido];
    }
    return [];
  }

  const qtdCombo = Math.max(1, Number(itemPedido.quantidade) || 1);
  return escolhas
    .filter(esc => estacaoFiltro === 'todas' || (esc.estacao || 'bar') === estacaoFiltro)
    .map(esc => ({
      ...esc,
      id: esc.id || `${itemPedido.id}_${esc.produto_id}`,
      pedido_item_id: itemPedido.id,
      produto_id: esc.produto_id,
      nome_produto: `${esc.nome_produto} [Combo: ${itemPedido.nome_produto || 'Combo'}]`,
      quantidade: (Number(esc.quantidade) || 1) * qtdCombo,
      estacao: esc.estacao || 'bar',
      is_combo_componente: true,
      combo_nome: itemPedido.nome_produto || 'Combo'
    }));
}

export function calcularBaixaFichaTecnicaCombo(componentesCombo = [], fichasTecnicas = [], quantidadeCombos = 1) {
  const qtdPai = Math.max(1, Number(quantidadeCombos) || 1);
  const baixasPorInsumo = new Map();

  for (const comp of componentesCombo) {
    const qtdComp = (Number(comp.quantidade) || 1) * qtdPai;
    const itensFicha = fichasTecnicas.filter(ft => String(ft.produto_id) === String(comp.produto_id));
    for (const ft of itensFicha) {
      const insumoId = ft.estoque_item_id;
      const consumo = (Number(ft.quantidade) || 0) * qtdComp;
      baixasPorInsumo.set(insumoId, (baixasPorInsumo.get(insumoId) || 0) + consumo);
    }
  }

  return Array.from(baixasPorInsumo.entries()).map(([estoque_item_id, quantidade_baixa]) => ({
    estoque_item_id,
    quantidade_baixa: Math.round(quantidade_baixa * 10000) / 10000
  }));
}

const combosApi = {
  normalizarGruposCombo,
  validarConfigComboAdmin,
  verificarDisponibilidadeCombo,
  validarEscolhasCombo,
  rotearComboPorEstacaoKds,
  calcularBaixaFichaTecnicaCombo
};

if (typeof window !== 'undefined') {
  window.cafeteriaCombos = combosApi;
}

export default combosApi;
