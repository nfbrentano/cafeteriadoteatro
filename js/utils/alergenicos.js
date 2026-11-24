/**
 * CAF-000152: Alergênicos e Restrições Alimentares
 * Módulo compartilhado para Cardápio (QR/Online), Totem, PDV, KDS e Impressão
 */

export const CATALOGO_ALERGENICOS = {
  gluten: { id: 'gluten', nome: 'Glúten', icone: '🌾', descricao: 'Presente em trigo, cevada, centeio e aveia.' },
  leite: { id: 'leite', nome: 'Leite / Lactose', icone: '🥛', descricao: 'Leite e derivados lácteos (lactose).' },
  ovos: { id: 'ovos', nome: 'Ovos', icone: '🥚', descricao: 'Ovos e derivados.' },
  amendoim: { id: 'amendoim', nome: 'Amendoim', icone: '🥜', descricao: 'Amendoim e derivados.' },
  castanhas: { id: 'castanhas', nome: 'Castanhas / Nozes', icone: '🌰', descricao: 'Castanhas, nozes, amêndoas e avelãs.' },
  soja: { id: 'soja', nome: 'Soja', icone: '🌱', descricao: 'Soja e derivados.' },
  peixes: { id: 'peixes', nome: 'Peixes', icone: '🐟', descricao: 'Peixes e derivados.' },
  crustaceos: { id: 'crustaceos', nome: 'Crustáceos', icone: '🦐', descricao: 'Camarão, siri, caranguejo e lagosta.' }
};

export const CATALOGO_RESTRICOES = {
  sem_gluten: {
    id: 'sem_gluten',
    nome: 'Sem Glúten',
    icone: '🚫🌾',
    descricao: 'Apto para celíacos ou pessoas sensíveis a glúten.',
    alergenicosEvitados: ['gluten']
  },
  sem_lactose: {
    id: 'sem_lactose',
    nome: 'Sem Lactose',
    icone: '🚫🥛',
    descricao: 'Apto para intolerantes à lactose.',
    alergenicosEvitados: ['leite']
  },
  vegano: {
    id: 'vegano',
    nome: 'Vegano',
    icone: '🌱',
    descricao: 'Sem ingredientes de origem animal.',
    alergenicosEvitados: ['leite', 'ovos', 'peixes', 'crustaceos']
  },
  vegetariano: {
    id: 'vegetariano',
    nome: 'Vegetariano',
    icone: '🥗',
    descricao: 'Livre de carnes e peixes.',
    alergenicosEvitados: ['peixes', 'crustaceos']
  }
};

export const AVISO_CONTAMINACAO_PADRAO =
  'Aviso: Nosso ambiente de preparo manipula alimentos contendo glúten, leite, ovos e castanhas. Não garantimos a ausência total de contaminação cruzada.';

export const CHAVE_STORAGE_FILTRO = 'cafeteria_filtro_alergias';

/**
 * Verifica se um produto teve seus alergênicos revisados.
 */
export function isProdutoRevisado(produto) {
  if (!produto || typeof produto !== 'object') return false;
  return Boolean(produto.alergenicos_revisado_em);
}

/**
 * Mensagem padrão quando o produto ainda não possui revisão formal de alergênicos.
 */
export function getMensagemNaoRevisado() {
  return 'Informação de alergênicos não disponível. Pergunte ao atendente.';
}

/**
 * Lê do storage local os filtros de alergênicos/restrições ativos no aparelho.
 */
export function getFiltroAlergiasSalvo() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CHAVE_STORAGE_FILTRO);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Salva no storage local os filtros de alergênicos/restrições ativos.
 */
export function salvarFiltroAlergias(filtros = []) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const arraySalvar = Array.isArray(filtros) ? filtros : [];
    window.localStorage.setItem(CHAVE_STORAGE_FILTRO, JSON.stringify(arraySalvar));
  } catch (e) {
    // Falha silenciosa no storage
  }
}

/**
 * Verifica se um produto atende a uma lista de filtros ativos ("sem X").
 * Se um produto contém ou pode conter qualquer um dos alergênicos a evitar, retorna false.
 * Produtos não revisados não passam no filtro "sem X" por segurança (RNF01 / CA03).
 */
export function produtoAtendeFiltro(produto, alergItemLista = [], filtrosAtivos = []) {
  if (!Array.isArray(filtrosAtivos) || filtrosAtivos.length === 0) return true;

  // Se não revisado, não pode garantir que é "sem X"
  if (!isProdutoRevisado(produto)) {
    return false;
  }

  // Coleta os IDs de alergênicos que devem ser estritamente evitados
  const alergenicosBloqueados = new Set();
  for (const f of filtrosAtivos) {
    if (!f) continue;
    const key = String(f).toLowerCase().trim();
    if (CATALOGO_RESTRICOES[key]) {
      CATALOGO_RESTRICOES[key].alergenicosEvitados.forEach(a => alergenicosBloqueados.add(a));
    } else if (CATALOGO_ALERGENICOS[key]) {
      alergenicosBloqueados.add(key);
    } else {
      alergenicosBloqueados.add(key);
    }
  }

  if (alergenicosBloqueados.size === 0) return true;

  // Verifica se o produto tem alergênicos vinculados ('contem' ou 'pode_conter')
  const lista = Array.isArray(alergItemLista) ? alergItemLista : [];
  for (const item of lista) {
    if (!item) continue;
    const aId = String(item.alergenico_id || item.id || '').toLowerCase().trim();
    if (alergenicosBloqueados.has(aId)) {
      return false; // Bloqueia o produto
    }
  }

  return true;
}

/**
 * Combina os alergênicos de um produto base com os alergênicos de adicionais selecionados.
 */
export function calcularAlergenicosCombinados(alergenicosBase = [], adicionaisSelecionados = []) {
  const mapa = new Map();

  const normalizar = (item, origemPadrao = 'base') => {
    if (!item) return null;
    const id = String(item.alergenico_id || item.id || '').toLowerCase().trim();
    if (!id) return null;
    const info = CATALOGO_ALERGENICOS[id] || {};
    const nome = item.alergenico_nome || item.nome || info.nome || id;
    const icone = item.alergenico_icone || item.icone || info.icone || '⚠️';
    const tipo = item.tipo === 'pode_conter' ? 'pode_conter' : 'contem';
    const origem = item.origem || origemPadrao;
    return { alergenico_id: id, nome, icone, tipo, origem };
  };

  (Array.isArray(alergenicosBase) ? alergenicosBase : []).forEach(it => {
    const norm = normalizar(it, 'produto');
    if (norm) mapa.set(norm.alergenico_id, norm);
  });

  (Array.isArray(adicionaisSelecionados) ? adicionaisSelecionados : []).forEach(adic => {
    const adicAlergs = adic.alergenicos || adic.v_adicional_alergenicos || [];
    (Array.isArray(adicAlergs) ? adicAlergs : []).forEach(it => {
      const norm = normalizar(it, 'adicional');
      if (norm) {
        // Se já existe e é 'pode_conter', mas o adicional 'contem', sobrepõe para 'contem'
        if (!mapa.has(norm.alergenico_id) || norm.tipo === 'contem') {
          mapa.set(norm.alergenico_id, norm);
        }
      }
    });
  });

  return Array.from(mapa.values());
}

/**
 * Renderiza os badges visuais de alergênicos (WCAG AA e semânticos).
 */
export function renderSelosHtml(alergenicos = [], options = {}) {
  const { modoResumido = false, escapeFn = (t) => t } = options;
  if (!Array.isArray(alergenicos) || alergenicos.length === 0) return '';

  const esc = typeof escapeFn === 'function' ? escapeFn : (t) => t;

  const badges = alergenicos.map(a => {
    const id = String(a.alergenico_id || a.id || '');
    const meta = CATALOGO_ALERGENICOS[id] || {};
    const nome = a.nome || a.alergenico_nome || meta.nome || id;
    const icone = a.icone || a.alergenico_icone || meta.icone || '⚠️';
    const isPodeConter = a.tipo === 'pode_conter';

    const textoBadge = isPodeConter ? `Pode conter ${nome}` : `Contém ${nome}`;
    const classeCss = isPodeConter ? 'selo-alergenico selo-pode-conter' : 'selo-alergenico selo-contem';

    return `
      <span class="${classeCss}" role="listitem" aria-label="${esc(textoBadge)}" data-alergenico="${esc(id)}">
        <span class="selo-icone" aria-hidden="true">${icone}</span>
        <span class="selo-texto">${esc(modoResumido ? nome : textoBadge)}</span>
      </span>
    `.trim();
  });

  return `<div class="container-selos-alergenicos" role="list">${badges.join(' ')}</div>`;
}

/**
 * Renderiza o aviso de contaminação cruzada para detalhes do produto.
 */
export function renderAvisoContaminacaoHtml(avisoCustomizado = '', options = {}) {
  const { escapeFn = (t) => t } = options;
  const esc = typeof escapeFn === 'function' ? escapeFn : (t) => t;
  const texto = (avisoCustomizado && String(avisoCustomizado).trim()) || AVISO_CONTAMINACAO_PADRAO;

  return `
    <div class="aviso-contaminacao-cruzada" role="note" aria-label="Aviso de contaminação cruzada">
      <span class="aviso-icone" aria-hidden="true">⚠️</span>
      <span class="aviso-texto">${esc(texto)}</span>
    </div>
  `.trim();
}

/**
 * Formata lista de alergias informadas pelo cliente.
 */
export function formatarAlergiasTexto(alergias = []) {
  if (!Array.isArray(alergias) || alergias.length === 0) return '';
  const nomes = alergias.map(a => {
    const k = String(a).toLowerCase().trim();
    if (CATALOGO_ALERGENICOS[k]) return CATALOGO_ALERGENICOS[k].nome;
    if (CATALOGO_RESTRICOES[k]) return CATALOGO_RESTRICOES[k].nome;
    return a;
  });
  return nomes.join(', ');
}

/**
 * Gera alerta visual para KDS (Destaque em vermelho vibrante de alto contraste).
 */
export function gerarHtmlAlertaKds(alergias = [], options = {}) {
  const { escapeFn = (t) => t } = options;
  const esc = typeof escapeFn === 'function' ? escapeFn : (t) => t;
  const texto = formatarAlergiasTexto(alergias);
  if (!texto) return '';

  return `
    <div class="kds-alerta-alergia" role="alert" style="background:#d32f2f;color:#ffffff;padding:6px 10px;border-radius:4px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
      <span aria-hidden="true">⚠️</span>
      <span>ALERGIA: ${esc(texto.toUpperCase())}</span>
    </div>
  `.trim();
}

/**
 * Gera texto para impressão de comanda e etiqueta de copo.
 */
export function gerarTextoAlertaPrint(alergias = []) {
  const texto = formatarAlergiasTexto(alergias);
  if (!texto) return '';
  return `ALERGIA: ${texto.toUpperCase()}`;
}

// Suporte para execução via script tag no browser
if (typeof window !== 'undefined') {
  window.AlergenicosUtils = {
    CATALOGO_ALERGENICOS,
    CATALOGO_RESTRICOES,
    AVISO_CONTAMINACAO_PADRAO,
    CHAVE_STORAGE_FILTRO,
    isProdutoRevisado,
    getMensagemNaoRevisado,
    getFiltroAlergiasSalvo,
    salvarFiltroAlergias,
    produtoAtendeFiltro,
    calcularAlergenicosCombinados,
    renderSelosHtml,
    renderAvisoContaminacaoHtml,
    formatarAlergiasTexto,
    gerarHtmlAlertaKds,
    gerarTextoAlertaPrint
  };
}

export default {
  CATALOGO_ALERGENICOS,
  CATALOGO_RESTRICOES,
  AVISO_CONTAMINACAO_PADRAO,
  CHAVE_STORAGE_FILTRO,
  isProdutoRevisado,
  getMensagemNaoRevisado,
  getFiltroAlergiasSalvo,
  salvarFiltroAlergias,
  produtoAtendeFiltro,
  calcularAlergenicosCombinados,
  renderSelosHtml,
  renderAvisoContaminacaoHtml,
  formatarAlergiasTexto,
  gerarHtmlAlertaKds,
  gerarTextoAlertaPrint
};
