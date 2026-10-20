/**
 * js/cardapio-cliente-pedido.js
 * Autoatendimento na Mesa via QR Code (CAF-000037) +
 * Pedido Online para Retirada e Encomendas Agendadas (CAF-000038).
 */
(function () {
  'use strict';

  const urlParams = new URLSearchParams(window.location.search);
  const mesaCodigoParam = urlParams.get('mesa');
  const qrTokenParam = urlParams.get('t');
  const pedidoTokenUrl = urlParams.get('pedido') || urlParams.get('pedido_token');

  const isModoMesa = Boolean(mesaCodigoParam && qrTokenParam);
  let isModoOnline = false;

  let currentMesa = null;
  let allAdicionais = [];
  let allVinculosProduto = [];
  let allProdutos = [];
  let carrinho = [];
  let activePedidoToken = pedidoTokenUrl || localStorage.getItem('cafeteria_pedido_cliente_token');
  let trackingInterval = null;

  // Configurações online (CAF-000038)
  let onlineConfig = {
    ativo: true,
    tempoEstimadoMin: 15,
    limiteJanela: 5,
    businessHours: null
  };
  let ocupacaoJanelasData = {};

  // Se acessou diretamente um link de acompanhamento (?pedido=TOKEN), adiciona noindex (SEO req CAF-000038)
  if (pedidoTokenUrl) {
    const metaNoIndex = document.createElement('meta');
    metaNoIndex.name = 'robots';
    metaNoIndex.content = 'noindex, nofollow';
    document.head.appendChild(metaNoIndex);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await inicializarAutoatendimento();
    } catch (err) {
      console.error('Erro ao inicializar pedidos no cardápio:', err);
    }
  });

  async function inicializarAutoatendimento() {
    if (!window.cafeteriaDB || !window.cafeteriaDB.mesas) {
      setTimeout(inicializarAutoatendimento, 300);
      return;
    }

    if (isModoMesa) {
      const mesa = await window.cafeteriaDB.mesas.getByQrToken(qrTokenParam);
      if (!mesa || mesa.codigo.toUpperCase() !== mesaCodigoParam.toUpperCase()) {
        exibirAvisoInvalido('QR Code da mesa não reconhecido ou expirado. Você está no modo somente consulta.');
        return;
      }
      currentMesa = mesa;

      try {
        const { data: config } = await window.cafeteriaSupabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'pedido_cliente_ativo')
          .maybeSingle();

        if (config && (config.valor === false || config.valor === 'false' || config.valor?.ativo === false)) {
          exibirAvisoInvalido('O autoatendimento por QR Code está temporariamente pausado pela equipe.');
          return;
        }
      } catch (e) {
        console.warn('Erro ao verificar status do autoatendimento:', e);
      }
    } else {
      // Modo Pedido Online para Retirada (CAF-000038)
      try {
        const { data: cfgRows } = await window.cafeteriaSupabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['pedido_online_ativo', 'pedido_online_tempo_estimado_min', 'pedido_online_limite_janela']);

        (cfgRows || []).forEach((r) => {
          if (r.chave === 'pedido_online_ativo') {
            onlineConfig.ativo = !(r.valor === false || r.valor === 'false' || r.valor?.ativo === false);
          }
          if (r.chave === 'pedido_online_tempo_estimado_min') {
            onlineConfig.tempoEstimadoMin = parseInt(r.valor, 10) || 15;
          }
          if (r.chave === 'pedido_online_limite_janela') {
            onlineConfig.limiteJanela = parseInt(r.valor, 10) || 5;
          }
        });

        const { data: bhRow } = await window.cafeteriaSupabase
          .from('site_settings')
          .select('value')
          .eq('key', 'business_hours')
          .maybeSingle();
        if (bhRow && bhRow.value) {
          onlineConfig.businessHours = typeof bhRow.value === 'string' ? JSON.parse(bhRow.value) : bhRow.value;
        }
      } catch (e) {
        console.warn('Erro ao carregar configurações de pedido online:', e);
      }

      if (!onlineConfig.ativo) {
        return; // Pedido online desativado: cardápio funciona apenas para consulta
      }
      isModoOnline = true;
    }

    await carregarDadosApoio();
    carregarCarrinhoCache();
    injetarUIAutoatendimento();
    conectarBotoesProdutos();

    if (activePedidoToken) {
      iniciarTrackingPedido(activePedidoToken);
      if (pedidoTokenUrl) {
        abrirModalTracking();
      }
    }
  }

  function getCacheKeyCarrinho() {
    return isModoMesa && currentMesa ? `cafeteria_carrinho_${currentMesa.codigo}` : 'cafeteria_carrinho_online_retirada';
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
      const raw = localStorage.getItem(getCacheKeyCarrinho());
      if (raw) carrinho = JSON.parse(raw);
    } catch (e) {
      carrinho = [];
    }
  }

  function salvarCarrinhoCache() {
    try {
      localStorage.setItem(getCacheKeyCarrinho(), JSON.stringify(carrinho));
    } catch (e) {}
    atualizarBarraCarrinho();
  }

  function getMaxAntecedenciaCarrinhoHoras() {
    let maxH = 0;
    let temEncomenda = false;
    carrinho.forEach((it) => {
      const p = allProdutos.find((x) => String(x.id) === String(it.produto_id));
      if (p) {
        const h = parseInt(p.antecedencia_min_horas || 0, 10);
        if (h > maxH) maxH = h;
        if (p.apenas_encomenda) temEncomenda = true;
      }
    });
    return { maxHoras: maxH, temApenasEncomenda: temEncomenda };
  }

  function obterHorarioFuncionamentoDia(dateObj) {
    const bh = onlineConfig.businessHours;
    const day = dateObj.getDay(); // 0=Dom, 1..4=Seg-Qui, 5=Sex, 6=Sab
    if (!bh) {
      if (day === 0) return { fechado: true };
      return { fechado: false, abertura: '08:00', fechamento: '20:00' };
    }
    let cfg = null;
    if (day === 0) cfg = bh.dom;
    else if (day === 6) cfg = bh.sab;
    else if (day === 5) cfg = bh.sex;
    else cfg = bh.seg_qui;

    if (!cfg || cfg.fechado) return { fechado: true };
    return {
      fechado: false,
      abertura: cfg.abertura || '08:00',
      fechamento: cfg.fechamento || '20:00'
    };
  }

  function isLojaAbertaAgora() {
    const agora = new Date();
    const hDia = obterHorarioFuncionamentoDia(agora);
    if (hDia.fechado) return false;
    const [abH, abM] = hDia.abertura.split(':').map(Number);
    const [feH, feM] = hDia.fechamento.split(':').map(Number);
    const minAtual = agora.getHours() * 60 + agora.getMinutes();
    const minAb = abH * 60 + abM;
    const minFe = feH * 60 + feM;
    return minAtual >= minAb && minAtual <= (minFe - 15);
  }

  function injetarUIAutoatendimento() {
    // 1. Banner Superior
    const banner = document.createElement('div');
    banner.className = 'mesa-qr-banner';
    banner.id = 'mesa-qr-banner';

    if (isModoMesa) {
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
    } else {
      banner.innerHTML = `
        <div class="mesa-qr-banner__info">
          <span class="mesa-qr-banner__badge" style="background:#c59b27; color:#1c1008;">🛍️ Retirada & Encomendas</span>
          <span class="mesa-qr-banner__text">Peça online e retire no balcão sem fila (~${onlineConfig.tempoEstimadoMin} min ou agendado)</span>
        </div>
        <div class="mesa-qr-banner__actions">
          <button type="button" class="mesa-qr-btn-action hidden" id="btn-ver-tracking-topo" style="background:#c59b27; color:#1c1008; border-color:#c59b27;">
            📱 Acompanhar Meu Pedido
          </button>
        </div>
      `;
    }
    document.body.prepend(banner);

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
        <span>${isModoMesa ? 'Ver Pedido' : 'Finalizar Retirada'}</span>
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
        <div class="modal-cliente-body" id="modal-cust-body"></div>
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
    const savedNome = localStorage.getItem('cafeteria_cliente_nome') || '';
    const savedTel = localStorage.getItem('cafeteria_cliente_telefone') || '';

    const modalCarrinho = document.createElement('div');
    modalCarrinho.className = 'modal-cliente-overlay hidden';
    modalCarrinho.id = 'modal-carrinho-cliente';
    modalCarrinho.innerHTML = `
      <div class="modal-cliente-card">
        <div class="modal-cliente-header">
          <h3>${isModoMesa ? `Seu Pedido — Mesa ${currentMesa.codigo}` : '🛍️ Pedido para Retirada no Balcão'}</h3>
          <button type="button" class="modal-cliente-close" id="modal-carrinho-close">✕</button>
        </div>
        <div class="modal-cliente-body">
          <div id="carrinho-itens-lista"></div>
          
          <div style="margin-top:16px; padding-top:16px; border-top:1px solid #cbd5e1;">
            <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:4px;">
              Seu Nome (para identificação) *
            </label>
            <input type="text" id="input-cliente-nome" class="form-control" value="${savedNome}" placeholder="Ex: Lucas, Mariana..." style="width:100%; padding:10px; font-size:14px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:12px;" required />

            ${isModoOnline ? `
              <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:4px;">
                Seu WhatsApp com DDD *
              </label>
              <input type="tel" id="input-cliente-telefone" class="form-control" value="${savedTel}" placeholder="Ex: (51) 99999-9999" style="width:100%; padding:10px; font-size:14px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:12px;" required />

              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px;">
                <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:8px;">
                  Horário para Retirada no Balcão *
                </label>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                  <label style="flex:1; display:flex; align-items:center; gap:6px; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; cursor:pointer; font-size:13px; font-weight:600;" id="lbl-modo-imediato">
                    <input type="radio" name="modo_retirada_radio" value="imediato" checked />
                    <span>⚡ O quanto antes (~${onlineConfig.tempoEstimadoMin} min)</span>
                  </label>
                  <label style="flex:1; display:flex; align-items:center; gap:6px; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; cursor:pointer; font-size:13px; font-weight:600;" id="lbl-modo-agendado">
                    <input type="radio" name="modo_retirada_radio" value="agendado" />
                    <span>📅 Agendar / Encomenda</span>
                  </label>
                </div>

                <div id="aviso-antecedencia-carrinho" style="display:none; font-size:12px; color:#b45309; background:#fffbeb; border:1px solid #fde68a; padding:6px 10px; border-radius:6px; margin-bottom:8px;"></div>

                <div id="box-agendamento-online" style="display:none; gap:8px; flex-wrap:wrap;">
                  <div style="flex:1; min-width:135px;">
                    <label style="font-size:12px; color:#475569; display:block; margin-bottom:3px;">Data da Retirada</label>
                    <input type="date" id="input-retirada-data" class="form-control" style="width:100%; padding:8px; font-size:13px; border:1px solid #cbd5e1; border-radius:6px;" />
                  </div>
                  <div style="flex:1; min-width:135px;">
                    <label style="font-size:12px; color:#475569; display:block; margin-bottom:3px;">Janela (15 min)</label>
                    <select id="select-retirada-hora" class="form-control" style="width:100%; padding:8px; font-size:13px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="">Selecione a data...</option>
                    </select>
                  </div>
                </div>
              </div>

              <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; color:#475569; margin-bottom:12px; cursor:pointer;">
                <input type="checkbox" id="check-lgpd-online" checked required style="margin-top:2px;" />
                <span>Concordo com o uso do meu nome e WhatsApp para confirmação do pedido e histórico de atendimento (LGPD).</span>
              </label>
            ` : ''}

            <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:4px;">
              Observações Gerais (opcional)
            </label>
            <input type="text" id="input-cliente-obs" class="form-control" placeholder="Ex: Guardanapos extras, adoçante..." style="width:100%; padding:10px; font-size:14px; border:1px solid #cbd5e1; border-radius:8px;" />
          </div>

          <div style="margin-top:16px; padding:12px; background:#fff; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:#475569;">Total do Pedido:</span>
            <strong id="carrinho-modal-total-lbl" style="font-size:20px; color:#1c1008;">R$ 0,00</strong>
          </div>
        </div>
        <div class="modal-cliente-footer">
          <button type="button" class="btn btn--primary" id="btn-enviar-pedido-cliente" style="width:100%; height:46px; font-size:15px; font-weight:700;">
            ${isModoMesa ? '🚀 Enviar Pedido para o Atendente' : '🛍️ Confirmar Pedido para Retirada'}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modalCarrinho);
    document.getElementById('modal-carrinho-close')?.addEventListener('click', fecharModalCarrinho);
    document.getElementById('btn-enviar-pedido-cliente')?.addEventListener('click', enviarPedidoFinal);

    if (isModoOnline) {
      document.querySelectorAll('input[name="modo_retirada_radio"]').forEach((r) => {
        r.addEventListener('change', atualizarModoRetiradaUI);
      });
      document.getElementById('input-retirada-data')?.addEventListener('change', carregarOpcoesJanelasData);
    }

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
              <span style="font-size:13px; color:#64748b;">Identificação</span>
              <strong id="tracking-mesa-lbl">${isModoMesa ? currentMesa.codigo : 'Retirada no Balcão'}</strong>
            </div>
            <div id="tracking-retirada-row" style="display:none; justify-content:space-between; margin-bottom:8px;">
              <span style="font-size:13px; color:#64748b;">Horário Previsto</span>
              <strong id="tracking-retirada-lbl" style="color:#0f766e;">--:--</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="font-size:13px; color:#64748b;">Total</span>
              <strong id="tracking-total-lbl">R$ 0,00</strong>
            </div>
            <div id="tracking-itens-lista" style="font-size:13px; color:#334155; border-top:1px dashed #cbd5e1; padding-top:8px;"></div>
          </div>

          <!-- CAF-000042: Botão de Avaliação quando concluído/entregue -->
          <div id="tracking-avaliacao-cta" style="display:none; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:12px; text-align:center; margin-bottom:12px;">
            <div style="font-weight:700; color:#92400e; margin-bottom:6px;">⭐ O que achou do seu pedido?</div>
            <a id="link-avaliar-pedido" href="#" class="btn btn--primary" style="display:inline-block; padding:8px 16px; font-size:13px; text-decoration:none;">
              Avaliar Pedido e Atendimento
            </a>
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

  async function atualizarModoRetiradaUI() {
    if (!isModoOnline) return;
    const radioImediato = document.querySelector('input[name="modo_retirada_radio"][value="imediato"]');
    const radioAgendado = document.querySelector('input[name="modo_retirada_radio"][value="agendado"]');
    const boxAgendamento = document.getElementById('box-agendamento-online');
    const avisoBox = document.getElementById('aviso-antecedencia-carrinho');
    const dataInput = document.getElementById('input-retirada-data');
    if (!radioImediato || !radioAgendado || !boxAgendamento || !dataInput) return;

    const { maxHoras, temApenasEncomenda } = getMaxAntecedenciaCarrinhoHoras();
    const abertaAgora = isLojaAbertaAgora();

    if (temApenasEncomenda || maxHoras > 0 || !abertaAgora) {
      radioImediato.disabled = true;
      radioAgendado.checked = true;
      if (avisoBox) {
        avisoBox.style.display = 'block';
        if (temApenasEncomenda || maxHoras > 0) {
          avisoBox.textContent = `📅 Seu carrinho contém item sob encomenda que requer antecedência mínima de ${maxHoras || 24}h. Selecione data e horário.`;
        } else {
          avisoBox.textContent = '🕒 A cafeteria está fora do horário imediato no momento. Agende seu pedido para retirada!';
        }
      }
    } else {
      radioImediato.disabled = false;
      if (avisoBox) avisoBox.style.display = 'none';
    }

    const isAgendado = radioAgendado.checked;
    boxAgendamento.style.display = isAgendado ? 'flex' : 'none';

    if (isAgendado) {
      const minDate = new Date(Date.now() + maxHoras * 3600 * 1000);
      const yyyy = minDate.getFullYear();
      const mm = String(minDate.getMonth() + 1).padStart(2, '0');
      const dd = String(minDate.getDate()).padStart(2, '0');
      const minIso = `${yyyy}-${mm}-${dd}`;
      dataInput.min = minIso;
      if (!dataInput.value || dataInput.value < minIso) {
        dataInput.value = minIso;
      }
      await carregarOpcoesJanelasData();
    }
  }

  async function carregarOpcoesJanelasData() {
    const dataInput = document.getElementById('input-retirada-data');
    const selectHora = document.getElementById('select-retirada-hora');
    if (!dataInput || !selectHora || !dataInput.value) return;

    const dataIso = dataInput.value;
    selectHora.innerHTML = '<option value="">Carregando horários...</option>';

    const [ano, mes, dia] = dataIso.split('-').map(Number);
    const dataRef = new Date(ano, mes - 1, dia, 12, 0, 0);
    const hDia = obterHorarioFuncionamentoDia(dataRef);

    if (hDia.fechado) {
      selectHora.innerHTML = '<option value="">Fechado neste dia da semana</option>';
      return;
    }

    // Consulta ocupação de janelas no banco
    let ocupacao = {};
    let limite = onlineConfig.limiteJanela || 5;
    try {
      const res = await window.cafeteriaDB.clientePedido.consultarJanelasOnline(dataIso);
      if (res) {
        ocupacao = res.ocupacao || {};
        limite = res.limite_janela || limite;
      }
    } catch (e) {
      console.warn('Falha ao consultar ocupação de janelas:', e);
    }

    const { maxHoras } = getMaxAntecedenciaCarrinhoHoras();
    const minTimestamp = Date.now() + Math.max(15 * 60 * 1000, maxHoras * 3600 * 1000);

    const [abH, abM] = hDia.abertura.split(':').map(Number);
    const [feH, feM] = hDia.fechamento.split(':').map(Number);
    const startMin = abH * 60 + abM;
    const endMin = feH * 60 + feM - 15;

    const opcoes = [];
    for (let m = startMin; m <= endMin; m += 15) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const slotStr = `${hh}:${mm}`;
      const slotDate = new Date(ano, mes - 1, dia, Math.floor(m / 60), m % 60, 0);
      if (slotDate.getTime() < minTimestamp) continue;

      const qtdOcupada = Number(ocupacao[slotStr] || 0);
      const lotado = qtdOcupada >= limite;
      opcoes.push({ slotStr, lotado, qtdOcupada });
    }

    if (opcoes.length === 0) {
      selectHora.innerHTML = '<option value="">Sem horários disponíveis nesta data (escolha outro dia)</option>';
      return;
    }

    selectHora.innerHTML = opcoes.map((o) =>
      `<option value="${o.slotStr}" ${o.lotado ? 'disabled' : ''}>${o.slotStr} ${o.lotado ? '(Horário lotado)' : ''}</option>`
    ).join('');
  }

  function conectarBotoesProdutos() {
    function injetarBotoes() {
      const cards = document.querySelectorAll('.produto-card, .combo-card');
      cards.forEach(card => {
        if (card.querySelector('.btn-pedir-item')) return;

        const isEsgotado = card.classList.contains('produto-esgotado');
        const nomeEl = card.querySelector('.produto-card__name, .combo-card__title');
        if (!nomeEl) return;
        const nome = nomeEl.textContent.trim();

        const produto = allProdutos.find(p => p.nome.trim().toLowerCase() === nome.toLowerCase());
        if (!produto) return;

        // Se está na mesa e o produto é "Só por encomenda", não oferece na mesa
        if (isModoMesa && produto.apenas_encomenda) {
          return;
        }

        // Badge de encomenda/antecedência
        if (produto.apenas_encomenda || Number(produto.antecedencia_min_horas || 0) > 0) {
          const h = Number(produto.antecedencia_min_horas || 24);
          const badgeEnc = document.createElement('div');
          badgeEnc.style.cssText = 'font-size:11px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; padding:2px 6px; display:inline-block; margin-top:4px;';
          badgeEnc.textContent = `📅 Encomenda (${h}h antecedência)`;
          nomeEl.parentElement?.appendChild(badgeEnc);
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-pedir-item';
        btn.innerHTML = isEsgotado ? 'Esgotado' : (produto.apenas_encomenda ? '📅 Encomendar' : '＋ Pedir');
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
    const obs = new MutationObserver(injetarBotoes);
    const root = document.getElementById('cardapio-root');
    if (root) obs.observe(root, { childList: true, subtree: true });
  }

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

    html += `
      <div style="margin-bottom:10px;">
        <label for="cust-obs" style="font-size:13px; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Observações para o preparo:</label>
        <textarea id="cust-obs" class="form-control" placeholder="Ex: Sem açúcar, leite vegetal, gelo à parte..." style="width:100%; height:60px; padding:8px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1;"></textarea>
      </div>
    `;

    body.innerHTML = html;

    body.querySelectorAll('.cust-check-adic').forEach(chk => {
      chk.addEventListener('change', recalcularPrecoBotaoCustomizar);
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

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-cust-qty-dec') {
      if (customizacaoState.quantidade > 1) {
        customizacaoState.quantidade--;
        document.getElementById('cust-qty-val').textContent = customizacaoState.quantidade;
        recalcularPrecoBotaoCustomizar();
      }
    } else if (e.target && e.target.id === 'btn-cust-qty-inc') {
      if (customizacaoState.quantidade < 10) {
        customizacaoState.quantidade++;
        document.getElementById('cust-qty-val').textContent = customizacaoState.quantidade;
        recalcularPrecoBotaoCustomizar();
      }
    } else if (e.target && e.target.id === 'btn-cust-adicionar') {
      adicionarItemCustomizadoAoCarrinho();
    }
  });

  function adicionarItemCustomizadoAoCarrinho() {
    if (!itemSendoCustomizado) return;

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
  }

  function fecharModalCustomizar() {
    document.getElementById('modal-customizar-item')?.classList.add('hidden');
    itemSendoCustomizado = null;
  }

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

    if (isModoOnline) {
      atualizarModoRetiradaUI();
    }

    modal.classList.remove('hidden');
  }

  function fecharModalCarrinho() {
    document.getElementById('modal-carrinho-cliente')?.classList.add('hidden');
  }

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

    localStorage.setItem('cafeteria_cliente_nome', clienteNome);

    const itensPayload = carrinho.map(it => ({
      produto_id: it.produto_id,
      quantidade: it.quantidade,
      adicionais: it.adicionais || [],
      sabores: it.sabores || [],
      observacoes: it.observacoes || ''
    }));

    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now());
    const btnEnviar = document.getElementById('btn-enviar-pedido-cliente');

    if (isModoOnline) {
      const telInput = document.getElementById('input-cliente-telefone');
      const telVal = (telInput?.value || '').trim();
      const digits = telVal.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 13) {
        alert('Por favor, informe um número de WhatsApp válido com DDD (ex: 51 99999-9999).');
        telInput?.focus();
        return;
      }
      localStorage.setItem('cafeteria_cliente_telefone', telVal);

      const lgpdCheck = document.getElementById('check-lgpd-online');
      if (lgpdCheck && !lgpdCheck.checked) {
        alert('É necessário confirmar o consentimento LGPD para prosseguir com o pedido online.');
        return;
      }

      const modoRetirada = document.querySelector('input[name="modo_retirada_radio"]:checked')?.value || 'imediato';
      let retiradaEmIso = null;

      if (modoRetirada === 'agendado') {
        const dataVal = document.getElementById('input-retirada-data')?.value;
        const horaVal = document.getElementById('select-retirada-hora')?.value;
        if (!dataVal || !horaVal) {
          alert('Selecione a data e uma janela de horário disponível para o agendamento.');
          return;
        }
        retiradaEmIso = new Date(`${dataVal}T${horaVal}:00`).toISOString();
      }

      btnEnviar.disabled = true;
      btnEnviar.textContent = 'Enviando Pedido...';

      try {
        const res = await window.cafeteriaDB.clientePedido.criarOnline({
          cliente_nome: clienteNome,
          cliente_telefone: telVal,
          aceita_lgpd: true,
          modo_retirada: modoRetirada,
          retirada_em: retiradaEmIso,
          observacoes: (obsInput?.value || '').trim(),
          itens: itensPayload
        }, idempotencyKey);

        if (res && res.sucesso) {
          activePedidoToken = res.pedido_token;
          localStorage.setItem('cafeteria_pedido_cliente_token', activePedidoToken);
          carrinho = [];
          salvarCarrinhoCache();
          fecharModalCarrinho();
          iniciarTrackingPedido(activePedidoToken);
          abrirModalTracking();
        } else {
          alert('Erro ao enviar pedido: ' + (res?.mensagem || 'Tente novamente'));
        }
      } catch (err) {
        console.error('Erro ao enviar pedido online:', err);
        alert('Não foi possível enviar seu pedido: ' + (err.message || 'Verifique os dados informados'));
      } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = '🛍️ Confirmar Pedido para Retirada';
      }
      return;
    }

    // Modo Mesa (CAF-000037)
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando Pedido...';

    try {
      const res = await window.cafeteriaDB.clientePedido.criar(qrTokenParam, {
        cliente_nome: clienteNome,
        observacoes: (obsInput?.value || '').trim(),
        itens: itensPayload
      }, idempotencyKey);

      if (res && res.sucesso) {
        activePedidoToken = res.pedido_token;
        localStorage.setItem('cafeteria_pedido_cliente_token', activePedidoToken);
        carrinho = [];
        salvarCarrinhoCache();
        fecharModalCarrinho();
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
        atualizarUITracking(info, token);
      }
    } catch (e) {
      console.warn('Erro ao atualizar tracking do pedido:', e);
    }
  }

  function atualizarUITracking(info, token) {
    const badge = document.getElementById('tracking-status-badge');
    const txt = document.getElementById('tracking-status-txt');
    const desc = document.getElementById('tracking-status-desc');
    const mesaLbl = document.getElementById('tracking-mesa-lbl');
    const retiradaRow = document.getElementById('tracking-retirada-row');
    const retiradaLbl = document.getElementById('tracking-retirada-lbl');
    const totalLbl = document.getElementById('tracking-total-lbl');
    const itensLista = document.getElementById('tracking-itens-lista');
    const avaliacaoCta = document.getElementById('tracking-avaliacao-cta');
    const linkAvaliar = document.getElementById('link-avaliar-pedido');

    if (!badge || !txt) return;

    const numPedidoStr = info.numero_pedido ? ` #${info.numero_pedido}` : '';
    if (mesaLbl) {
      mesaLbl.textContent = info.origem === 'online' || info.mesa_codigo === 'RETIRADA'
        ? `Retirada no Balcão${numPedidoStr}`
        : `Mesa ${info.mesa_codigo}${numPedidoStr}`;
    }

    if (retiradaRow && retiradaLbl) {
      if (info.retirada_em) {
        const dt = new Date(info.retirada_em);
        const dataFmt = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const horaFmt = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        retiradaLbl.textContent = `${dataFmt} às ${horaFmt}`;
        retiradaRow.style.display = 'flex';
      } else {
        retiradaRow.style.display = 'none';
      }
    }

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
    const isRetirada = info.origem === 'online' || info.para_viagem || info.mesa_codigo === 'RETIRADA';

    if (info.status === 'aguardando_aprovacao') {
      badge.classList.add('aguardando');
      txt.textContent = 'Aguardando confirmação do atendente...';
      desc.textContent = 'Seu pedido foi recebido no balcão e será confirmado em instantes.';
    } else if (info.status === 'pendente') {
      badge.classList.add('preparo');
      txt.textContent = 'Pedido Confirmado!';
      desc.textContent = isRetirada
        ? 'Seu pedido está confirmado e programado para o horário de retirada.'
        : 'O atendente aprovou seu pedido e ele já foi para a cozinha.';
    } else if (info.status === 'em_preparo') {
      badge.classList.add('preparo');
      txt.textContent = '👨‍🍳 Em preparo na cozinha!';
      desc.textContent = 'Seus itens estão sendo preparados com todo cuidado.';
    } else if (info.status === 'concluido' || info.status === 'pronto') {
      badge.classList.add('pronto');
      txt.textContent = isRetirada ? '✅ Pronto para retirada no balcão!' : '✅ Pronto! O atendente trará à sua mesa.';
      desc.textContent = isRetirada
        ? 'Dirija-se ao balcão da Cafeteria do Teatro para retirar seu pedido!'
        : 'Seu pedido está prontinho e a caminho da sua mesa!';
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

    // CAF-000042: Exibir botão de avaliação quando pronto ou entregue
    if (avaliacaoCta && linkAvaliar) {
      if (['concluido', 'pronto', 'entregue'].includes(info.status) && token) {
        avaliacaoCta.style.display = 'block';
        linkAvaliar.href = `/avaliar.html?t=${encodeURIComponent(token)}`;
      } else {
        avaliacaoCta.style.display = 'none';
      }
    }
  }

  function abrirModalTracking() {
    const modal = document.getElementById('modal-tracking-pedido');
    if (modal) modal.classList.remove('hidden');
    if (activePedidoToken) consultarStatusAtual(activePedidoToken);
  }

  async function dispararChamado(tipo) {
    if (!currentMesa) return;
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
