/**
 * js/cardapio-cliente-pedido.js
 * Autoatendimento na Mesa via QR Code (CAF-000037).
 * Ativa quando acessado via ?mesa=CODIGO&t=TOKEN.
 */
(function () {
  'use strict';

  const urlParams = new URLSearchParams(window.location.search);
  const mesaCodigoParam = urlParams.get('mesa');
  const qrTokenParam = urlParams.get('t');

  if (!mesaCodigoParam || !qrTokenParam) {
    // Acesso normal ao cardápio — não faz nada
    return;
  }

  let currentMesa = null;
  let allAdicionais = [];
  let allVinculosProduto = [];
  let allProdutos = [];
  let carrinho = [];
  let activePedidoToken = localStorage.getItem('cafeteria_pedido_cliente_token');
  let trackingInterval = null;

  // Inicialização
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await inicializarAutoatendimento();
    } catch (err) {
      console.error('Erro ao inicializar autoatendimento:', err);
    }
  });

  async function inicializarAutoatendimento() {
    // 1. Valida mesa e token
    if (!window.cafeteriaDB || !window.cafeteriaDB.mesas) {
      setTimeout(inicializarAutoatendimento, 300);
      return;
    }

    const mesa = await window.cafeteriaDB.mesas.getByQrToken(qrTokenParam);
    if (!mesa || mesa.codigo.toUpperCase() !== mesaCodigoParam.toUpperCase()) {
      exibirAvisoInvalido('QR Code da mesa não reconhecido ou expirado. Você está no modo somente consulta.');
      return;
    }

    currentMesa = mesa;

    // 2. Verifica se autoatendimento está ativo no sistema
    try {
      const { data: config } = await window.cafeteriaSupabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'pedido_cliente_ativo')
        .maybeSingle();

      if (config && (config.valor === false || config.valor?.ativo === false)) {
        exibirAvisoInvalido('O autoatendimento por QR Code está temporariamente pausado pela equipe.');
        return;
      }
    } catch (e) {
      console.warn('Erro ao verificar status do autoatendimento:', e);
    }

    // 3. Carrega dados de apoio (produtos, adicionais e vínculos)
    await carregarDadosApoio();

    // 4. Carrega carrinho salvo no cache local
    carregarCarrinhoCache();

    // 5. Injeta estrutura de UI (Banner, Barra de Carrinho, Modais)
    injetarUIAutoatendimento();

    // 6. Monitora renderização de produtos no cardápio dinâmico
    conectarBotoesProdutos();

    // 7. Se já tiver pedido ativo salvo, inicia tracking
    if (activePedidoToken) {
      iniciarTrackingPedido(activePedidoToken);
    }
  }

  function exibirAvisoInvalido(msg) {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:sticky; top:0; z-index:9999; background:#fffbeb; color:#92400e; padding:10px 16px; font-size:13px; font-weight:600; text-align:center; border-bottom:1px solid #fef3c7;';
    banner.textContent = msg;
    document.body.prepend(banner);
  }

  async function carregarDadosApoio() {
    try {
      const [{ data: adic }, { data: vinc }, { data: prods }] = await Promise.all([
        window.cafeteriaSupabase.from('adicionais').select('*').eq('ativo', true).order('ordem'),
        window.cafeteriaSupabase.from('v_adicionais_produto').select('*'),
        window.cafeteriaSupabase.from('produtos').select('*').eq('ativo', true)
      ]);
      allAdicionais = adic || [];
      allVinculosProduto = vinc || [];
      allProdutos = prods || [];
    } catch (err) {
      console.warn('Erro ao carregar dados de apoio para pedidos:', err);
    }
  }

  function carregarCarrinhoCache() {
    try {
      const raw = localStorage.getItem(`cafeteria_carrinho_${currentMesa.codigo}`);
      if (raw) carrinho = JSON.parse(raw);
    } catch (e) {
      carrinho = [];
    }
  }

  function salvarCarrinhoCache() {
    try {
      localStorage.setItem(`cafeteria_carrinho_${currentMesa.codigo}`, JSON.stringify(carrinho));
    } catch (e) {}
    atualizarBarraCarrinho();
  }

  // Injeção de componentes HTML
  function injetarUIAutoatendimento() {
    // 1. Banner Superior da Mesa
    const banner = document.createElement('div');
    banner.className = 'mesa-qr-banner';
    banner.id = 'mesa-qr-banner';
    banner.innerHTML = `
      <div class="mesa-qr-banner__info">
        <span class="mesa-qr-banner__badge">Mesa ${currentMesa.codigo}</span>
        <span class="mesa-qr-banner__text">Autoatendimento pelo celular</span>
      </div>
      <div class="mesa-qr-banner__actions">
        <button type="button" class="mesa-qr-btn-action" id="btn-chamar-atendente-topo" title="Chamar um atendente até a sua mesa">
          🙋 Chamar Atendente
        </button>
        <button type="button" class="mesa-qr-btn-action" id="btn-pedir-conta-topo" title="Pedir fechamento da conta">
          🧾 Pedir a Conta
        </button>
        <button type="button" class="mesa-qr-btn-action hidden" id="btn-ver-tracking-topo" style="background:#c59b27; color:#1c1008; border-color:#c59b27;">
          📱 Ver Pedido
        </button>
      </div>
    `;
    document.body.prepend(banner);

    // Eventos de chamada de mesa
    document.getElementById('btn-chamar-atendente-topo')?.addEventListener('click', () => dispararChamado('atendente'));
    document.getElementById('btn-pedir-conta-topo')?.addEventListener('click', () => dispararChamado('conta'));
    document.getElementById('btn-ver-tracking-topo')?.addEventListener('click', () => abrirModalTracking());

    // 2. Barra Flutuante do Carrinho
    const barra = document.createElement('div');
    barra.className = 'barra-carrinho-cliente hidden';
    barra.id = 'barra-carrinho-cliente';
    barra.innerHTML = `
      <div class="barra-carrinho-cliente__info">
        <span class="barra-carrinho-cliente__count" id="carrinho-count-lbl">0 itens</span>
        <span class="barra-carrinho-cliente__total" id="carrinho-total-lbl">R$ 0,00</span>
      </div>
      <button type="button" class="barra-carrinho-cliente__btn" id="btn-abrir-carrinho">
        <span>Ver Pedido</span>
        <span>→</span>
      </button>
    `;
    document.body.appendChild(barra);
    document.getElementById('btn-abrir-carrinho')?.addEventListener('click', abrirModalCarrinho);

    // 3. Modal de Customização de Item
    const modalCustomizar = document.createElement('div');
    modalCustomizar.className = 'modal-cliente-overlay hidden';
    modalCustomizar.id = 'modal-customizar-item';
    modalCustomizar.innerHTML = `
      <div class="modal-cliente-card">
        <div class="modal-cliente-header">
          <h3 id="modal-cust-titulo">Adicionar Item</h3>
          <button type="button" class="modal-cliente-close" id="modal-cust-close">✕</button>
        </div>
        <div class="modal-cliente-body" id="modal-cust-body">
          <!-- Injetado dinamicamente -->
        </div>
        <div class="modal-cliente-footer">
          <div class="qty-control">
            <button type="button" id="btn-cust-qty-dec">−</button>
            <span id="cust-qty-val">1</span>
            <button type="button" id="btn-cust-qty-inc">+</button>
          </div>
          <button type="button" class="btn btn--primary" id="btn-cust-adicionar" style="flex:1; height:44px; font-weight:700;">
            Adicionar ao Pedido
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modalCustomizar);
    document.getElementById('modal-cust-close')?.addEventListener('click', fecharModalCustomizar);

    // 4. Modal Carrinho
    const modalCarrinho = document.createElement('div');
    modalCarrinho.className = 'modal-cliente-overlay hidden';
    modalCarrinho.id = 'modal-carrinho-cliente';
    modalCarrinho.innerHTML = `
      <div class="modal-cliente-card">
        <div class="modal-cliente-header">
          <h3>Seu Pedido — Mesa ${currentMesa.codigo}</h3>
          <button type="button" class="modal-cliente-close" id="modal-carrinho-close">✕</button>
        </div>
        <div class="modal-cliente-body">
          <div id="carrinho-itens-lista"></div>
          
          <div style="margin-top:16px; padding-top:16px; border-top:1px solid #cbd5e1;">
            <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:4px;">
              Seu Nome (para identificação) *
            </label>
            <input type="text" id="input-cliente-nome" class="form-control" placeholder="Ex: Lucas, Mariana..." style="width:100%; padding:10px; font-size:14px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:12px;" required />

            <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:4px;">
              Observações Gerais (opcional)
            </label>
            <input type="text" id="input-cliente-obs" class="form-control" placeholder="Ex: Trazer tudo junto, copos extras..." style="width:100%; padding:10px; font-size:14px; border:1px solid #cbd5e1; border-radius:8px;" />
          </div>

          <div style="margin-top:16px; padding:12px; background:#fff; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:#475569;">Total do Pedido:</span>
            <strong id="carrinho-modal-total-lbl" style="font-size:20px; color:#1c1008;">R$ 0,00</strong>
          </div>
        </div>
        <div class="modal-cliente-footer">
          <button type="button" class="btn btn--primary" id="btn-enviar-pedido-cliente" style="width:100%; height:46px; font-size:15px; font-weight:700;">
            🚀 Enviar Pedido para o Atendente
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modalCarrinho);
    document.getElementById('modal-carrinho-close')?.addEventListener('click', fecharModalCarrinho);
    document.getElementById('btn-enviar-pedido-cliente')?.addEventListener('click', enviarPedidoFinal);

    // 5. Modal Tracking do Pedido
    const modalTracking = document.createElement('div');
    modalTracking.className = 'modal-cliente-overlay hidden';
    modalTracking.id = 'modal-tracking-pedido';
    modalTracking.innerHTML = `
      <div class="modal-cliente-card">
        <div class="modal-cliente-header">
          <h3>Acompanhamento do Pedido</h3>
          <button type="button" class="modal-cliente-close" id="modal-tracking-close">✕</button>
        </div>
        <div class="modal-cliente-body" id="modal-tracking-body">
          <div class="status-tracker-box">
            <div id="tracking-status-badge" class="status-badge-live aguardando">
              <span class="pulsing-dot"></span>
              <span id="tracking-status-txt">Aguardando aprovação do atendente...</span>
            </div>
            <p id="tracking-status-desc" style="font-size:13px; color:#64748b; margin:0;">
              Seu pedido foi recebido no balcão e será confirmado em instantes.
            </p>
          </div>

          <div style="background:#fff; border-radius:10px; padding:14px; border:1px solid #e2e8f0; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="font-size:13px; color:#64748b;">Mesa</span>
              <strong id="tracking-mesa-lbl">${currentMesa.codigo}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="font-size:13px; color:#64748b;">Total</span>
              <strong id="tracking-total-lbl">R$ 0,00</strong>
            </div>
            <div id="tracking-itens-lista" style="font-size:13px; color:#334155; border-top:1px dashed #cbd5e1; padding-top:8px;"></div>
          </div>
        </div>
        <div class="modal-cliente-footer">
          <button type="button" class="btn btn--outline-dark" id="btn-novo-pedido-tracking" style="flex:1;">
            Fazer Outro Pedido
          </button>
          <button type="button" class="btn btn--primary" id="btn-fechar-tracking" style="flex:1;">
            Entendido
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modalTracking);
    document.getElementById('modal-tracking-close')?.addEventListener('click', () => modalTracking.classList.add('hidden'));
    document.getElementById('btn-fechar-tracking')?.addEventListener('click', () => modalTracking.classList.add('hidden'));
    document.getElementById('btn-novo-pedido-tracking')?.addEventListener('click', () => {
      modalTracking.classList.add('hidden');
    });

    atualizarBarraCarrinho();
  }

  // Intercepta e adiciona botões nos cards de produtos
  function conectarBotoesProdutos() {
    function injetarBotoes() {
      const cards = document.querySelectorAll('.produto-card, .combo-card');
      cards.forEach(card => {
        if (card.querySelector('.btn-pedir-item')) return; // já tem

        const isEsgotado = card.classList.contains('produto-esgotado');
        const nomeEl = card.querySelector('.produto-card__name, .combo-card__title');
        if (!nomeEl) return;
        const nome = nomeEl.textContent.trim();

        // Localiza produto correspondente
        const produto = allProdutos.find(p => p.nome.trim().toLowerCase() === nome.toLowerCase());
        if (!produto) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-pedir-item';
        btn.innerHTML = isEsgotado ? 'Esgotado' : '＋ Pedir';
        btn.disabled = isEsgotado;

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          abrirModalCustomizar(produto);
        });

        const footer = card.querySelector('.produto-card__footer, .combo-card__footer, .produto-card__body');
        if (footer) {
          footer.appendChild(btn);
        }
      });
    }

    injetarBotoes();
    // Reexecuta periodicamente caso o cardápio termine de carregar depois
    const obs = new MutationObserver(injetarBotoes);
    const root = document.getElementById('cardapio-root');
    if (root) obs.observe(root, { childList: true, subtree: true });
  }

  // --- MODAL DE CUSTOMIZAÇÃO DO ITEM ---
  let itemSendoCustomizado = null;
  let customizacaoState = {
    quantidade: 1,
    adicionaisSelecionados: [],
    saboresSelecionados: [],
    observacoes: ''
  };

  function abrirModalCustomizar(produto) {
    itemSendoCustomizado = produto;
    customizacaoState = {
      quantidade: 1,
      adicionaisSelecionados: [],
      saboresSelecionados: [],
      observacoes: ''
    };

    const modal = document.getElementById('modal-customizar-item');
    const titulo = document.getElementById('modal-cust-titulo');
    const body = document.getElementById('modal-cust-body');
    const qtyVal = document.getElementById('cust-qty-val');

    titulo.textContent = produto.nome;
    qtyVal.textContent = '1';

    // Filtra adicionais permitidos para este produto
    const permitidosIds = allVinculosProduto
      .filter(v => v.produto_id === produto.id)
      .map(v => v.adicional_id);

    const adicionaisDisponiveis = permitidosIds.length > 0
      ? allAdicionais.filter(a => permitidosIds.includes(a.id))
      : allAdicionais;

    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <span style="font-size:14px; color:#64748b;">Preço base:</span>
        <strong style="font-size:18px; color:#1c1008;">R$ ${Number(produto.preco || 0).toFixed(2).replace('.', ',')}</strong>
      </div>
      <p style="font-size:13px; color:#475569; margin-bottom:16px;">${produto.descricao || ''}</p>
    `;

    // Se meio a meio
    if (produto.tipo_montagem === 'meio_a_meio') {
      const saboresDisponiveis = allProdutos.filter(p => p.categoria_id === produto.categoria_id && p.id !== produto.id && p.disponivel !== false);
      html += `
        <div style="margin-bottom:16px;">
          <label style="font-size:13px; font-weight:700; color:#1e293b; display:block; margin-bottom:6px;">Escolha o 1º Sabor (Metade):</label>
          <select id="cust-sabor-1" class="form-control" style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1;">
            <option value="">Selecione...</option>
            ${saboresDisponiveis.map(s => `<option value="${s.id}">½ ${s.nome} (+ R$ ${(s.preco * 0.5).toFixed(2)})</option>`).join('')}
          </select>

          <label style="font-size:13px; font-weight:700; color:#1e293b; display:block; margin-top:10px; margin-bottom:6px;">Escolha o 2º Sabor (Metade):</label>
          <select id="cust-sabor-2" class="form-control" style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1;">
            <option value="">Selecione...</option>
            ${saboresDisponiveis.map(s => `<option value="${s.id}">½ ${s.nome} (+ R$ ${(s.preco * 0.5).toFixed(2)})</option>`).join('')}
          </select>
        </div>
      `;
    }

    // Adicionais
    if (adicionaisDisponiveis.length > 0) {
      html += `
        <div style="margin-bottom:16px;">
          <label style="font-size:13px; font-weight:700; color:#1e293b; display:block; margin-bottom:6px;">Adicionais & Opcionais:</label>
          <div class="adicionais-list-cliente">
            ${adicionaisDisponiveis.map(a => `
              <label class="adicional-item-label">
                <span style="font-size:13px; font-weight:600; color:#334155;">
                  <input type="checkbox" value="${a.id}" data-preco="${a.preco}" class="cust-check-adic" />
                  &nbsp; ${a.nome}
                </span>
                <span style="font-size:13px; font-weight:700; color:#c59b27;">+ R$ ${Number(a.preco).toFixed(2).replace('.', ',')}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Observações
    html += `
      <div style="margin-bottom:10px;">
        <label for="cust-obs" style="font-size:13px; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Observações para a cozinha:</label>
        <textarea id="cust-obs" class="form-control" placeholder="Ex: Sem açúcar, leite vegetal, gelo à parte..." style="width:100%; height:60px; padding:8px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1;"></textarea>
      </div>
    `;

    body.innerHTML = html;

    // Conectar eventos
    body.querySelectorAll('.cust-check-adic').forEach(chk => {
      chk.addEventListener('change', () => {
        recalcularPrecoBotaoCustomizar();
      });
    });

    const obsInput = document.getElementById('cust-obs');
    if (obsInput) {
      obsInput.addEventListener('input', (e) => {
        customizacaoState.observacoes = e.target.value.trim();
      });
    }

    recalcularPrecoBotaoCustomizar();
    modal.classList.remove('hidden');
  }

  function recalcularPrecoBotaoCustomizar() {
    if (!itemSendoCustomizado) return;
    let base = Number(itemSendoCustomizado.preco || 0);

    // Meio a meio
    const s1 = document.getElementById('cust-sabor-1')?.value;
    const s2 = document.getElementById('cust-sabor-2')?.value;
    if (itemSendoCustomizado.tipo_montagem === 'meio_a_meio') {
      base = 0;
      if (s1) {
        const prodS1 = allProdutos.find(p => p.id === s1);
        if (prodS1) base += Number(prodS1.preco) * 0.5;
      }
      if (s2) {
        const prodS2 = allProdutos.find(p => p.id === s2);
        if (prodS2) base += Number(prodS2.preco) * 0.5;
      }
    }

    let adicionaisTotal = 0;
    document.querySelectorAll('.cust-check-adic:checked').forEach(chk => {
      adicionaisTotal += Number(chk.dataset.preco || 0);
    });

    const unitario = base + adicionaisTotal;
    const total = unitario * customizacaoState.quantidade;

    const btn = document.getElementById('btn-cust-adicionar');
    if (btn) {
      btn.textContent = `Adicionar • R$ ${total.toFixed(2).replace('.', ',')}`;
    }
  }

  document.getElementById('btn-cust-qty-dec')?.addEventListener('click', () => {
    if (customizacaoState.quantidade > 1) {
      customizacaoState.quantidade--;
      document.getElementById('cust-qty-val').textContent = customizacaoState.quantidade;
      recalcularPrecoBotaoCustomizar();
    }
  });

  document.getElementById('btn-cust-qty-inc')?.addEventListener('click', () => {
    if (customizacaoState.quantidade < 10) {
      customizacaoState.quantidade++;
      document.getElementById('cust-qty-val').textContent = customizacaoState.quantidade;
      recalcularPrecoBotaoCustomizar();
    }
  });

  document.getElementById('btn-cust-adicionar')?.addEventListener('click', () => {
    if (!itemSendoCustomizado) return;

    // Validação meio a meio
    let sabores = [];
    if (itemSendoCustomizado.tipo_montagem === 'meio_a_meio') {
      const s1 = document.getElementById('cust-sabor-1')?.value;
      const s2 = document.getElementById('cust-sabor-2')?.value;
      if (!s1 || !s2) {
        alert('Por favor, selecione os dois sabores para a montagem meio a meio.');
        return;
      }
      sabores = [
        { lado: '1', produto_id: s1 },
        { lado: '2', produto_id: s2 }
      ];
    }

    const adicionais = [];
    document.querySelectorAll('.cust-check-adic:checked').forEach(chk => {
      adicionais.push(chk.value);
    });

    let precoBase = Number(itemSendoCustomizado.preco || 0);
    if (itemSendoCustomizado.tipo_montagem === 'meio_a_meio') {
      precoBase = 0;
      sabores.forEach(sb => {
        const p = allProdutos.find(x => x.id === sb.produto_id);
        if (p) precoBase += Number(p.preco) * 0.5;
      });
    }

    let precoUnitario = precoBase;
    adicionais.forEach(adicId => {
      const a = allAdicionais.find(x => x.id === adicId);
      if (a) precoUnitario += Number(a.preco || 0);
    });

    carrinho.push({
      produto_id: itemSendoCustomizado.id,
      nome: itemSendoCustomizado.nome,
      quantidade: customizacaoState.quantidade,
      preco_base: precoBase,
      preco_unitario: precoUnitario,
      adicionais: adicionais,
      sabores: sabores,
      observacoes: customizacaoState.observacoes
    });

    salvarCarrinhoCache();
    fecharModalCustomizar();
  });

  function fecharModalCustomizar() {
    document.getElementById('modal-customizar-item')?.classList.add('hidden');
    itemSendoCustomizado = null;
  }

  // --- GESTÃO DO CARRINHO ---
  function atualizarBarraCarrinho() {
    const barra = document.getElementById('barra-carrinho-cliente');
    const countLbl = document.getElementById('carrinho-count-lbl');
    const totalLbl = document.getElementById('carrinho-total-lbl');
    if (!barra) return;

    const totalItens = carrinho.reduce((sum, it) => sum + it.quantidade, 0);
    const totalValor = carrinho.reduce((sum, it) => sum + (it.quantidade * it.preco_unitario), 0);

    if (totalItens > 0) {
      countLbl.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
      totalLbl.textContent = `R$ ${totalValor.toFixed(2).replace('.', ',')}`;
      barra.classList.remove('hidden');
    } else {
      barra.classList.add('hidden');
    }
  }

  function abrirModalCarrinho() {
    const modal = document.getElementById('modal-carrinho-cliente');
    const lista = document.getElementById('carrinho-itens-lista');
    const totalLbl = document.getElementById('carrinho-modal-total-lbl');
    if (!modal || !lista) return;

    if (carrinho.length === 0) {
      lista.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Seu pedido está vazio.</p>';
      totalLbl.textContent = 'R$ 0,00';
      modal.classList.remove('hidden');
      return;
    }

    const totalValor = carrinho.reduce((sum, it) => sum + (it.quantidade * it.preco_unitario), 0);
    totalLbl.textContent = `R$ ${totalValor.toFixed(2).replace('.', ',')}`;

    lista.innerHTML = carrinho.map((it, idx) => {
      const nomesAdic = (it.adicionais || []).map(id => {
        const a = allAdicionais.find(x => x.id === id);
        return a ? a.nome : id;
      }).join(', ');

      return `
        <div class="carrinho-item-row">
          <div class="carrinho-item-info">
            <h4>${it.quantidade}x ${it.nome}</h4>
            ${nomesAdic ? `<p class="carrinho-item-detalhes">+ ${nomesAdic}</p>` : ''}
            ${it.observacoes ? `<p class="carrinho-item-detalhes" style="font-style:italic;">Obs: ${it.observacoes}</p>` : ''}
          </div>
          <div class="carrinho-item-acoes">
            <strong style="font-size:14px; color:#1c1008;">R$ ${(it.quantidade * it.preco_unitario).toFixed(2).replace('.', ',')}</strong>
            <button type="button" class="btn-remover-item-carrinho" data-idx="${idx}" style="background:none; border:none; color:#dc2626; font-size:12px; cursor:pointer; padding:2px;">✕ Remover</button>
          </div>
        </div>
      `;
    }).join('');

    lista.querySelectorAll('.btn-remover-item-carrinho').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        carrinho.splice(idx, 1);
        salvarCarrinhoCache();
        abrirModalCarrinho();
      });
    });

    modal.classList.remove('hidden');
  }

  function fecharModalCarrinho() {
    document.getElementById('modal-carrinho-cliente')?.classList.add('hidden');
  }

  // --- ENVIO DO PEDIDO ---
  async function enviarPedidoFinal() {
    if (carrinho.length === 0) {
      alert('Adicione pelo menos um item ao pedido antes de enviar.');
      return;
    }

    const nomeInput = document.getElementById('input-cliente-nome');
    const obsInput = document.getElementById('input-cliente-obs');
    const clienteNome = (nomeInput?.value || '').trim();

    if (!clienteNome) {
      alert('Por favor, informe seu nome para identificação do pedido.');
      nomeInput?.focus();
      return;
    }

    const btnEnviar = document.getElementById('btn-enviar-pedido-cliente');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando Pedido...';

    const payload = {
      cliente_nome: clienteNome,
      observacoes: (obsInput?.value || '').trim(),
      itens: carrinho.map(it => ({
        produto_id: it.produto_id,
        quantidade: it.quantidade,
        adicionais: it.adicionais || [],
        sabores: it.sabores || [],
        observacoes: it.observacoes || ''
      }))
    };

    // Gera idempotency key local
    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now());

    try {
      const res = await window.cafeteriaDB.clientePedido.criar(qrTokenParam, payload, idempotencyKey);
      if (res && res.sucesso) {
        activePedidoToken = res.pedido_token;
        localStorage.setItem('cafeteria_pedido_cliente_token', activePedidoToken);

        // Limpa carrinho
        carrinho = [];
        salvarCarrinhoCache();
        fecharModalCarrinho();

        // Inicia tracking e abre modal
        iniciarTrackingPedido(activePedidoToken);
        abrirModalTracking();
      } else {
        alert('Erro ao enviar pedido: ' + (res?.mensagem || 'Tente novamente'));
      }
    } catch (err) {
      console.error('Erro ao enviar pedido:', err);
      alert('Não foi possível enviar seu pedido: ' + (err.message || 'Verifique sua conexão'));
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = '🚀 Enviar Pedido para o Atendente';
    }
  }

  // --- TRACKING DO STATUS DO PEDIDO ---
  function iniciarTrackingPedido(token) {
    const btnVer = document.getElementById('btn-ver-tracking-topo');
    if (btnVer) btnVer.classList.remove('hidden');

    if (trackingInterval) clearInterval(trackingInterval);
    consultarStatusAtual(token);
    trackingInterval = setInterval(() => consultarStatusAtual(token), 8000);
  }

  async function consultarStatusAtual(token) {
    if (!token) return;
    try {
      const info = await window.cafeteriaDB.clientePedido.consultarStatus(token);
      if (info && info.encontrado) {
        atualizarUITracking(info);
      }
    } catch (e) {
      console.warn('Erro ao atualizar tracking do pedido:', e);
    }
  }

  function atualizarUITracking(info) {
    const badge = document.getElementById('tracking-status-badge');
    const txt = document.getElementById('tracking-status-txt');
    const desc = document.getElementById('tracking-status-desc');
    const totalLbl = document.getElementById('tracking-total-lbl');
    const itensLista = document.getElementById('tracking-itens-lista');

    if (!badge || !txt) return;

    totalLbl.textContent = `R$ ${Number(info.total || 0).toFixed(2).replace('.', ',')}`;

    if (info.itens && itensLista) {
      itensLista.innerHTML = info.itens.map(i => `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; ${i.cancelado ? 'text-decoration:line-through; color:#94a3b8;' : ''}">
          <span>${i.quantidade}x ${i.nome}</span>
          <span>R$ ${(i.quantidade * i.preco_unitario).toFixed(2).replace('.', ',')}</span>
        </div>
      `).join('');
    }

    badge.className = 'status-badge-live';

    if (info.status === 'aguardando_aprovacao') {
      badge.classList.add('aguardando');
      txt.textContent = 'Aguardando aprovação do atendente...';
      desc.textContent = 'O atendente recebeu seu pedido no balcão e irá confirmá-lo em instantes.';
    } else if (info.status === 'pendente') {
      badge.classList.add('preparo');
      txt.textContent = 'Pedido Aprovado! Na fila de preparo.';
      desc.textContent = 'O atendente aprovou seu pedido e ele já foi para a cozinha.';
    } else if (info.status === 'em_preparo') {
      badge.classList.add('preparo');
      txt.textContent = '👨‍🍳 Em preparo na cozinha!';
      desc.textContent = 'Seus itens estão sendo preparados com todo cuidado.';
    } else if (info.status === 'concluido' || info.status === 'pronto') {
      badge.classList.add('pronto');
      txt.textContent = '✅ Pronto! O atendente trará à sua mesa.';
      desc.textContent = 'Seu pedido está prontinho e a caminho da sua mesa!';
    } else if (info.status === 'entregue') {
      badge.classList.add('pronto');
      txt.textContent = '🎉 Entregue! Bom apetite.';
      desc.textContent = 'Pedido finalizado. Desejamos uma excelente experiência!';
      if (trackingInterval) clearInterval(trackingInterval);
    } else if (info.status === 'cancelado') {
      badge.classList.add('cancelado');
      txt.textContent = '❌ Pedido não pôde ser atendido';
      desc.textContent = info.motivo_cancelamento ? `Motivo: ${info.motivo_cancelamento}` : 'Por favor, consulte o atendente no balcão.';
      if (trackingInterval) clearInterval(trackingInterval);
    }
  }

  function abrirModalTracking() {
    const modal = document.getElementById('modal-tracking-pedido');
    if (modal) modal.classList.remove('hidden');
    if (activePedidoToken) consultarStatusAtual(activePedidoToken);
  }

  // --- CHAMADOS DE MESA ---
  async function dispararChamado(tipo) {
    const msgConfirmacao = tipo === 'conta' 
      ? `Deseja solicitar o fechamento da conta para a mesa ${currentMesa.codigo}? O atendente virá até você.` 
      : `Deseja chamar o atendente para a mesa ${currentMesa.codigo}?`;

    if (!confirm(msgConfirmacao)) return;

    try {
      const res = await window.cafeteriaDB.clientePedido.chamarAtendente(qrTokenParam, tipo);
      if (res && res.sucesso) {
        if (res.repetido) {
          alert('O chamado já foi registrado anteriormente. O atendente já foi notificado e virá em instantes!');
        } else {
          alert(tipo === 'conta' ? '🧾 Pedido de conta enviado! O atendente virá até sua mesa.' : '🙋 Atendente chamado com sucesso! Em instantes iremos até a sua mesa.');
        }
      }
    } catch (err) {
      alert('Não foi possível registrar o chamado: ' + (err.message || 'Verifique a conexão'));
    }
  }

})();
