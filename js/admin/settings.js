/* =========================================================
   ADMIN/SETTINGS.JS — Hero, Horários, Promoções e Textos
   ========================================================= */

(function () {
  'use strict';

  const admin = window.cafeteriaAdmin;

  // CAF-000103: Validação de arquivo de animação do Totem (RF19, CA24)
  function validarArquivoAnimacaoTotem(file) {
    if (!file) return { valido: false, erro: 'Nenhum arquivo fornecido.' };
    const nameLower = (file.name || '').toLowerCase();
    const isMp4 = nameLower.endsWith('.mp4') && file.type === 'video/mp4';
    const isGif = nameLower.endsWith('.gif') && file.type === 'image/gif';

    if (!isMp4 && !isGif) {
      return { valido: false, erro: 'Formato recusado. Apenas arquivos .mp4 ou .gif legítimos são permitidos.' };
    }

    const MAX_MP4_BYTES = 15 * 1024 * 1024; // 15 MB
    const MAX_GIF_BYTES = 8 * 1024 * 1024;  // 8 MB

    if (isMp4 && file.size > MAX_MP4_BYTES) {
      return { valido: false, erro: 'Arquivo MP4 excede o limite máximo permitido de 15 MB.' };
    }
    if (isGif && file.size > MAX_GIF_BYTES) {
      return { valido: false, erro: 'Arquivo GIF excede o limite máximo permitido de 8 MB.' };
    }

    return { valido: true, tipo: isMp4 ? 'video/mp4' : 'image/gif' };
  }
  window.validarArquivoAnimacaoTotem = validarArquivoAnimacaoTotem;

  // --- Módulo: Hero ---
  window.renderHero = function() {
    const data = admin.appData.hero;
    const previewImg = document.getElementById('hero-upload-preview-img');
    const previewWrap = document.getElementById('hero-upload-preview-wrap');
    const idle = document.getElementById('hero-upload-idle');
    const livePreviewBg = document.getElementById('hero-preview-bg');
    
    if (data && data.image_url) {
      previewImg.src = data.image_url;
      previewWrap.classList.remove('hidden');
      idle.classList.add('hidden');
      document.getElementById('hero-alt').value = data.image_alt || '';
      livePreviewBg.style.backgroundImage = `url(${data.image_url})`;
    } else {
      livePreviewBg.style.backgroundImage = "url('assets/images/galeria-ambiente.webp')";
    }
  };

  /** Gera uma miniatura ultra-low-res para efeito de blur */
  async function generateBlurPlaceholder(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // Tamanho minúsculo para performance e cache
        canvas.width = 40;
        canvas.height = 25;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Qualidade baixa (30%) para manter o base64 curto (~2-5KB)
        resolve(canvas.toDataURL('image/jpeg', 0.3));
      };
      img.src = dataUrl;
    });
  }

  async function saveHero() {
    const btn = document.getElementById('btn-save-hero');
    const dataUrl = document.getElementById('hero-image-data').value;
    const alt = document.getElementById('hero-alt').value.trim();
    
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      let blurDataUrl = null;
      if (dataUrl.startsWith('data:')) {
        blurDataUrl = await generateBlurPlaceholder(dataUrl);
      }

      const blob = dataUrl.startsWith('data:') ? admin.dataURLtoBlob(dataUrl) : null;
      await window.cafeteriaDB.hero.update(blob, alt, blurDataUrl);
      admin.toast('Sucesso', 'Hero atualizado.', 'success');
      await admin.loadData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao salvar hero.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Hero';
    }
  }

  // --- Módulo: Horários ---
  window.renderHorarios = function() {
    const d = admin.appData.horarios;
    if (!d) return;
    document.getElementById('h-seg-qui-abre').value = d.seg_qui_abre || '';
    document.getElementById('h-seg-qui-fecha').value = d.seg_qui_fecha || '';
    document.getElementById('h-sex-abre').value = d.sex_abre || '';
    document.getElementById('h-sex-fecha').value = d.sex_fecha || '';
    const sdAtivo = !!d.sab_dom_ativo;
    document.getElementById('h-sab-dom-ativo').checked = sdAtivo;
    document.getElementById('h-sab-dom-abre').value = d.sab_dom_abre || '';
    document.getElementById('h-sab-dom-fecha').value = d.sab_dom_fecha || '';
    document.getElementById('h-aviso').value = d.aviso_especial || '';
  };

  async function saveHorarios(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const data = {
      seg_qui_abre: document.getElementById('h-seg-qui-abre').value,
      seg_qui_fecha: document.getElementById('h-seg-qui-fecha').value,
      sex_abre: document.getElementById('h-sex-abre').value,
      sex_fecha: document.getElementById('h-sex-fecha').value,
      sab_dom_ativo: document.getElementById('h-sab-dom-ativo').checked,
      sab_dom_abre: document.getElementById('h-sab-dom-abre').value,
      sab_dom_fecha: document.getElementById('h-sab-dom-fecha').value,
      aviso_especial: document.getElementById('h-aviso').value
    };

    btn.disabled = true;
    try {
      await window.cafeteriaDB.hours.update(data);
      admin.toast('Sucesso', 'Horários salvos.', 'success');
      await admin.loadData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao salvar horários.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // --- Módulo: Promoções ---
  window.renderPromocoes = function() {
    const list = document.getElementById('promo-table-body');
    const promos = admin.appData.promotions;
    
    if (!list) return;

    if (promos.length === 0) {
      list.innerHTML = '<tr><td colspan="5">Nenhuma promoção ativa.</td></tr>';
      return;
    }

    list.innerHTML = promos.map(p => `
      <tr>
        <td><strong>${p.title}</strong></td>
        <td>${p.badge_text || '-'}</td>
        <td>${p.start_date || p.inicio || '-'} a ${p.end_date || p.fim || '-'}</td>
        <td>${p.active ? '<span class="status-pill status-pill--ativo">Ativa</span>' : '<span class="status-pill status-pill--inativo">Pausada</span>'}</td>
        <td>
          <button class="btn btn--icon" data-action="admin-delete-promo" data-id="${p.id}" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    if (!list._hasDeletePromoListener) {
      list._hasDeletePromoListener = true;
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="admin-delete-promo"]');
        if (btn) {
          const id = btn.getAttribute('data-id');
          if (id && typeof window.deletePromo === 'function') {
            window.deletePromo(id);
          }
        }
      });
    }
  };

  window.deletePromo = async function(id) {
    const ok = await admin.confirm({
      icon: '🗑️',
      title: 'Excluir Campanha',
      msg: 'Tem certeza que deseja remover esta campanha promocional?'
    });
    if (!ok) return;

    try {
      await window.cafeteriaDB.promotions.delete(id);
      admin.toast('Sucesso', 'Promoção excluída.', 'success');
      await admin.loadData();
    } catch (err) {
      console.error('Erro ao excluir promoção:', err);
      admin.toast('Erro', 'Não foi possível excluir.', 'error');
    }
  };

  // --- Módulo: Textos Site ---
  window.renderConteudo = function() {
    const s = admin.appData.settings;
    document.getElementById('c-sobre-titulo').value = s.sobre_titulo || '';
    document.getElementById('c-sobre-texto').value = s.sobre_texto || '';
    document.getElementById('c-exp-subtitulo').value = s.exp_subtitulo || '';
    document.getElementById('c-galeria-subtitulo').value = s.galeria_subtitulo || '';
    
    // WhatsApp
    const wppAtivo = s.whatsapp_ativo !== undefined ? String(s.whatsapp_ativo) !== 'false' : true;
    document.getElementById('c-whatsapp-ativo').checked = wppAtivo;
    document.getElementById('c-whatsapp-numero').value = s.whatsapp_numero || '5551984224792';

    // Taxa de Serviço
    const taxaAtiva = s.taxa_servico_ativa !== undefined ? String(s.taxa_servico_ativa) === 'true' : false;
    document.getElementById('c-taxa-servico-ativa').checked = taxaAtiva;
    document.getElementById('c-taxa-servico-percentual').value = s.taxa_servico_percentual || '10';

    // Preview do Sobre
    const sobreImg = s.sobre_imagem_url;
    if (sobreImg) {
      document.getElementById('sobre-upload-preview-img').src = sobreImg;
      document.getElementById('sobre-upload-preview-wrap').classList.remove('hidden');
      document.getElementById('sobre-upload-idle').classList.add('hidden');
    }
  };

  async function saveConteudo(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-conteudo');
    const settings = {
      sobre_titulo: document.getElementById('c-sobre-titulo').value,
      sobre_texto: document.getElementById('c-sobre-texto').value,
      exp_subtitulo: document.getElementById('c-exp-subtitulo').value,
      galeria_subtitulo: document.getElementById('c-galeria-subtitulo').value,
      whatsapp_ativo: document.getElementById('c-whatsapp-ativo').checked,
      whatsapp_numero: document.getElementById('c-whatsapp-numero').value.replace(/\D/g, ''),
      taxa_servico_ativa: document.getElementById('c-taxa-servico-ativa').checked,
      taxa_servico_percentual: document.getElementById('c-taxa-servico-percentual').value || 10
    };

    const sobreDataUrl = document.getElementById('sobre-image-data').value;

    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      // Se houver nova imagem para o Sobre
      if (sobreDataUrl) {
        const blob = admin.dataURLtoBlob(sobreDataUrl);
        const fileName = `sobre-${Date.now()}.webp`;
        const publicUrl = await window.cafeteriaDB.assets.upload(fileName, blob);
        settings.sobre_imagem_url = publicUrl;
      }

      await Promise.all(Object.entries(settings).map(([key, val]) => window.cafeteriaDB.settings.update(key, val)));
      admin.toast('Sucesso', 'Conteúdo atualizado.', 'success');
      await admin.loadData();
      
      // Limpa cache de upload
      document.getElementById('sobre-image-data').value = '';
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao salvar conteúdo.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Textos';
    }
  }

  // --- Inicialização ---
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-save-hero')?.addEventListener('click', saveHero);
    document.getElementById('form-horarios')?.addEventListener('submit', saveHorarios);
    document.getElementById('form-conteudo')?.addEventListener('submit', saveConteudo);
    
    // Upload Hero
    const heroZone = document.getElementById('hero-upload-zone');
    const heroFile = document.getElementById('hero-image-file');
    const heroChangeBtn = document.getElementById('btn-hero-change-img');
    const heroRemoveBtn = document.getElementById('btn-hero-remove-img');
    const heroInfo = document.getElementById('hero-upload-info');
    const heroInfoDims = document.getElementById('hero-info-dims');
    const heroInfoSize = document.getElementById('hero-info-size');
    const heroInfoSaving = document.getElementById('hero-info-saving');

    const handleHeroFile = async (file) => {
      if (!file) return;
      try {
        const result = await admin.compressImage(file, 'hero');
        document.getElementById('hero-image-data').value = result.dataUrl;
        document.getElementById('hero-upload-preview-img').src = result.dataUrl;
        document.getElementById('hero-upload-preview-wrap').classList.remove('hidden');
        document.getElementById('hero-upload-idle').classList.add('hidden');
        document.getElementById('hero-preview-bg').style.backgroundImage = `url(${result.dataUrl})`;

        if (heroInfoDims) heroInfoDims.textContent = `${result.width} × ${result.height}px`;
        if (heroInfoSize) heroInfoSize.textContent = `${result.format} • ${result.formattedOptimizedSize}`;
        if (heroInfoSaving) {
          heroInfoSaving.textContent = result.savedPercentage;
          heroInfoSaving.style.display = result.originalSizeBytes > result.optimizedSizeBytes ? 'inline-block' : 'none';
        }
        if (heroInfo) heroInfo.style.display = 'flex';
      } catch (err) {
        console.error('Erro ao processar imagem do Hero:', err);
        admin.toast('Erro', 'Não foi possível processar a imagem.', 'error');
      }
    };

    heroZone?.addEventListener('click', () => heroFile?.click());
    heroChangeBtn?.addEventListener('click', (e) => { e.stopPropagation(); heroFile?.click(); });
    heroRemoveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('hero-image-data').value = '';
      document.getElementById('hero-upload-preview-wrap').classList.add('hidden');
      document.getElementById('hero-upload-idle').classList.remove('hidden');
      if (heroInfo) heroInfo.style.display = 'none';
      if (heroFile) heroFile.value = '';
    });
    heroFile?.addEventListener('change', (e) => handleHeroFile(e.target.files[0]));

    // Drag-drop Hero
    heroZone?.addEventListener('dragover', (e) => { e.preventDefault(); heroZone.classList.add('drag-over'); });
    heroZone?.addEventListener('dragleave', () => heroZone.classList.remove('drag-over'));
    heroZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      heroZone.classList.remove('drag-over');
      if (e.dataTransfer.files?.[0]) handleHeroFile(e.dataTransfer.files[0]);
    });

    // Upload Sobre
    const sobreZone = document.getElementById('sobre-upload-zone');
    const sobreFile = document.getElementById('sobre-image-file');
    const sobreChangeBtn = document.getElementById('btn-sobre-change-img');
    const sobreInfo = document.getElementById('sobre-upload-info');
    const sobreInfoDims = document.getElementById('sobre-info-dims');
    const sobreInfoSize = document.getElementById('sobre-info-size');
    const sobreInfoSaving = document.getElementById('sobre-info-saving');

    const handleSobreFile = async (file) => {
      if (!file) return;
      try {
        const result = await admin.compressImage(file, 'sobre');
        document.getElementById('sobre-image-data').value = result.dataUrl;
        document.getElementById('sobre-upload-preview-img').src = result.dataUrl;
        document.getElementById('sobre-upload-preview-wrap').classList.remove('hidden');
        document.getElementById('sobre-upload-idle').classList.add('hidden');

        if (sobreInfoDims) sobreInfoDims.textContent = `${result.width} × ${result.height}px`;
        if (sobreInfoSize) sobreInfoSize.textContent = `${result.format} • ${result.formattedOptimizedSize}`;
        if (sobreInfoSaving) {
          sobreInfoSaving.textContent = result.savedPercentage;
          sobreInfoSaving.style.display = result.originalSizeBytes > result.optimizedSizeBytes ? 'inline-block' : 'none';
        }
        if (sobreInfo) sobreInfo.style.display = 'flex';
      } catch (err) {
        console.error('Erro ao processar imagem do Sobre:', err);
        admin.toast('Erro', 'Não foi possível processar a imagem.', 'error');
      }
    };

    sobreZone?.addEventListener('click', () => sobreFile?.click());
    sobreChangeBtn?.addEventListener('click', (e) => { e.stopPropagation(); sobreFile?.click(); });
    sobreFile?.addEventListener('change', (e) => handleSobreFile(e.target.files[0]));

    // Drag-drop Sobre
    sobreZone?.addEventListener('dragover', (e) => { e.preventDefault(); sobreZone.classList.add('drag-over'); });
    sobreZone?.addEventListener('dragleave', () => sobreZone.classList.remove('drag-over'));
    sobreZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      sobreZone.classList.remove('drag-over');
      if (e.dataTransfer.files?.[0]) handleSobreFile(e.dataTransfer.files[0]);
    });

    // Upload Promoções
    const promoZone = document.getElementById('promo-upload-zone');
    const promoFile = document.getElementById('promo-image-file');
    const promoChangeBtn = document.getElementById('btn-promo-change-img');
    const promoRemoveBtn = document.getElementById('btn-promo-remove-img');
    const promoInfo = document.getElementById('promo-upload-info');
    const promoInfoDims = document.getElementById('promo-info-dims');
    const promoInfoSize = document.getElementById('promo-info-size');
    const promoInfoSaving = document.getElementById('promo-info-saving');

    const handlePromoFile = async (file) => {
      if (!file) return;
      try {
        const result = await admin.compressImage(file, 'banner');
        document.getElementById('promo-image-data').value = result.dataUrl;
        document.getElementById('promo-upload-preview-img').src = result.dataUrl;
        document.getElementById('promo-upload-preview-wrap').classList.remove('hidden');
        document.getElementById('promo-upload-idle').classList.add('hidden');

        if (promoInfoDims) promoInfoDims.textContent = `${result.width} × ${result.height}px`;
        if (promoInfoSize) promoInfoSize.textContent = `${result.format} • ${result.formattedOptimizedSize}`;
        if (promoInfoSaving) {
          promoInfoSaving.textContent = result.savedPercentage;
          promoInfoSaving.style.display = result.originalSizeBytes > result.optimizedSizeBytes ? 'inline-block' : 'none';
        }
        if (promoInfo) promoInfo.style.display = 'flex';
      } catch (err) {
        console.error('Erro ao processar imagem da promoção:', err);
        admin.toast('Erro', 'Não foi possível processar a imagem.', 'error');
      }
    };

    promoZone?.addEventListener('click', () => promoFile?.click());
    promoChangeBtn?.addEventListener('click', (e) => { e.stopPropagation(); promoFile?.click(); });
    promoRemoveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('promo-image-data').value = '';
      document.getElementById('promo-upload-preview-wrap').classList.add('hidden');
      document.getElementById('promo-upload-idle').classList.remove('hidden');
      if (promoInfo) promoInfo.style.display = 'none';
      if (promoFile) promoFile.value = '';
    });
    promoFile?.addEventListener('change', (e) => handlePromoFile(e.target.files[0]));

    // Drag-drop Promo
    promoZone?.addEventListener('dragover', (e) => { e.preventDefault(); promoZone.classList.add('drag-over'); });
    promoZone?.addEventListener('dragleave', () => promoZone.classList.remove('drag-over'));
    promoZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      promoZone.classList.remove('drag-over');
      if (e.dataTransfer.files?.[0]) handlePromoFile(e.dataTransfer.files[0]);
    });

    // Autoatendimento por QR Code (CAF-000037)
    const togglePedidoCliente = document.getElementById('config-pedido-cliente-ativo');
    if (togglePedidoCliente) {
      // Carregar valor inicial
      (async () => {
        try {
          const { data } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', 'pedido_cliente_ativo')
            .maybeSingle();
          if (data && data.valor !== undefined) {
            togglePedidoCliente.checked = typeof data.valor === 'boolean' ? data.valor : (data.valor.ativo !== false);
          }
        } catch (err) {
          console.warn('Erro ao carregar pedido_cliente_ativo:', err);
        }
      })();

      togglePedidoCliente.addEventListener('change', async (e) => {
        const ativo = e.target.checked;
        try {
          const { error } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert({
              chave: 'pedido_cliente_ativo',
              valor: ativo,
              updated_at: new Date().toISOString()
            });
          if (error) throw error;
          admin.toast('Sucesso', `Autoatendimento via QR Code ${ativo ? 'ativado' : 'desativado'}.`, 'success');
        } catch (err) {
          console.error('Erro ao salvar pedido_cliente_ativo:', err);
          admin.toast('Erro', 'Falha ao salvar configuração.', 'error');
          e.target.checked = !ativo;
        }
      });
    }

    // Conferência Cega e Limite de Diferença de Caixa (CAF-000044)
    const toggleCaixaCego = document.getElementById('config-caixa-conferencia-cega');
    const inputLimiteCaixa = document.getElementById('config-caixa-limite-diferenca');
    const btnSalvarConfigCaixa = document.getElementById('btn-salvar-config-caixa');

    if (toggleCaixaCego || inputLimiteCaixa) {
      (async () => {
        try {
          const { data } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', ['caixa_conferencia_cega', 'caixa_limite_diferenca_obs']);
          if (Array.isArray(data)) {
            data.forEach((row) => {
              if (row.chave === 'caixa_conferencia_cega' && toggleCaixaCego) {
                toggleCaixaCego.checked =
                  typeof row.valor === 'boolean'
                    ? row.valor
                    : String(row.valor) !== 'false';
              }
              if (row.chave === 'caixa_limite_diferenca_obs' && inputLimiteCaixa) {
                inputLimiteCaixa.value = Number(row.valor || 5).toFixed(2);
              }
            });
          }
        } catch (err) {
          console.warn('Erro ao carregar configurações de caixa:', err);
        }
      })();

      toggleCaixaCego?.addEventListener('change', async (e) => {
        const ativo = e.target.checked;
        try {
          const { error } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert({
              chave: 'caixa_conferencia_cega',
              valor: ativo,
              updated_at: new Date().toISOString()
            });
          if (error) throw error;
          if (window.cafeteriaDB?.settings?.update) {
            await window.cafeteriaDB.settings.update('caixa_conferencia_cega', String(ativo));
          }
          admin.toast('Sucesso', `Conferência cega ${ativo ? 'ativada' : 'desativada'}.`, 'success');
        } catch (err) {
          console.error('Erro ao salvar caixa_conferencia_cega:', err);
          admin.toast('Erro', 'Falha ao salvar configuração de conferência cega.', 'error');
          e.target.checked = !ativo;
        }
      });

      btnSalvarConfigCaixa?.addEventListener('click', async () => {
        const val = Math.max(0, parseFloat(inputLimiteCaixa?.value) || 0);
        btnSalvarConfigCaixa.disabled = true;
        try {
          const { error } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert({
              chave: 'caixa_limite_diferenca_obs',
              valor: val,
              updated_at: new Date().toISOString()
            });
          if (error) throw error;
          if (window.cafeteriaDB?.settings?.update) {
            await window.cafeteriaDB.settings.update('caixa_limite_diferenca_obs', val.toFixed(2));
          }
          admin.toast('Sucesso', `Limite de diferença atualizado para R$ ${val.toFixed(2)}.`, 'success');
        } catch (err) {
          console.error('Erro ao salvar limite de diferença:', err);
          admin.toast('Erro', 'Falha ao salvar limite de diferença.', 'error');
        } finally {
          btnSalvarConfigCaixa.disabled = false;
        }
      });

      // --- CAF-000039 / CAF-000123: PIX QR CODE (BR CODE EMV) E TAXAS DE PAGAMENTO ---
      const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const inputPixChave = document.getElementById('config-pix-chave');
      const inputPixRecebedor = document.getElementById('config-pix-recebedor');
      const inputPixCidade = document.getElementById('config-pix-cidade');
      const togglePixImprimir = document.getElementById('config-pix-imprimir-conta');
      const inputPixDinamicoAtivo = document.getElementById('config-pix-dinamico-ativo');
      const selectPixPspProvedor = document.getElementById('config-pix-psp-provedor');
      const selectPixExigirKds = document.getElementById('config-pix-exigir-kds');
      const inputPixExpiracaoTotem = document.getElementById('config-pix-expiracao-totem');
      const inputPixExpiracaoOnline = document.getElementById('config-pix-expiracao-online');
      const btnSalvarPix = document.getElementById('btn-salvar-config-pix');
      const btnTestarPix = document.getElementById('btn-testar-qr-pix');
      const previewPixBox = document.getElementById('config-pix-teste-preview');

      const btnAtualizarPixConferencia = document.getElementById('btn-atualizar-pix-conferencia');
      const tbodyPixConferencia = document.getElementById('config-pix-conferencia-tbody');

      const tbodyTaxas = document.getElementById('config-taxas-pagamento-tbody');
      const btnSalvarTaxas = document.getElementById('btn-salvar-taxas-pagamento');

      async function carregarCobrancasPixConferencia() {
        if (!tbodyPixConferencia || !window.cafeteriaSupabase) return;
        try {
          const { data, error } = await window.cafeteriaSupabase.rpc('listar_cobrancas_pix_conferencia');
          if (error) throw error;
          if (!data || data.length === 0) {
            tbodyPixConferencia.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma divergência ou pendência de conferência.</td></tr>';
            return;
          }
          tbodyPixConferencia.innerHTML = data.map((c) => {
            const isExpirado = c.status === 'expirada';
            const badgeClass = isExpirado ? 'adm-pix-badge-exp' : 'adm-pix-badge-div';
            const statusDesc = isExpirado ? 'Expirada' : (c.motivo_divergencia || 'Divergente');
            const cobradoFmt = Number(c.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const pagoFmt = c.valor_pago ? Number(c.valor_pago).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
            const refPedido = c.numero_pedido ? `#${c.numero_pedido}` : (c.mesa_codigo ? `Mesa ${c.mesa_codigo}` : '-');

            return `
              <tr>
                <td><code>${escHtml(c.txid || '-')}</code></td>
                <td><strong>${escHtml(c.canal || '-')}</strong> (${escHtml(refPedido)})</td>
                <td>${cobradoFmt}</td>
                <td>${pagoFmt}</td>
                <td><span class="${badgeClass}">${escHtml(statusDesc)}</span></td>
                <td>
                  <button type="button" class="btn btn--secondary btn--sm btn-resolver-pix" data-id="${c.id}">
                    Resolver / Baixar
                  </button>
                </td>
              </tr>
            `;
          }).join('');
        } catch (err) {
          console.warn('Erro ao listar cobranças para conferência:', err);
          tbodyPixConferencia.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#dc2626;">Erro ao carregar lista de conferência.</td></tr>';
        }
      }

      btnAtualizarPixConferencia?.addEventListener('click', carregarCobrancasPixConferencia);

      tbodyPixConferencia?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-resolver-pix');
        if (!btn) return;
        const cobrancaId = btn.dataset.id;
        if (!cobrancaId) return;

        const obs = prompt('Observação da conferência manual (ex: Comprovante verificado no app bancário):', 'Conferido no extrato bancário');
        if (obs === null) return;

        btn.disabled = true;
        try {
          const { error } = await window.cafeteriaSupabase.rpc('resolver_cobranca_pix_conferencia', {
            p_cobranca_id: cobrancaId,
            p_acao: 'aprovar',
            p_observacao: obs
          });
          if (error) throw error;
          admin.toast('Sucesso', 'Cobrança Pix resolvida com sucesso!', 'success');
          carregarCobrancasPixConferencia();
        } catch (err) {
          console.error('Erro ao resolver cobrança Pix:', err);
          admin.toast('Erro', 'Não foi possível resolver cobrança: ' + (err.message || ''), 'error');
          btn.disabled = false;
        }
      });

      async function carregarConfigPixETaxas() {
        if (!window.cafeteriaSupabase) return;
        try {
          const { data: pixRows } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', [
              'pix_chave', 'pix_nome_recebedor', 'pix_cidade', 'pix_imprimir_na_conta',
              'pix_dinamico_ativo', 'pix_psp_provedor', 'pix_exigir_pagamento_kds',
              'pix_expiracao_totem_min', 'pix_expiracao_online_min'
            ]);

          (pixRows || []).forEach((r) => {
            const valStr = typeof r.valor === 'string' ? r.valor : (r.valor !== null && r.valor !== undefined ? String(r.valor).replace(/^"|"$/g, '') : '');
            if (r.chave === 'pix_chave' && inputPixChave) inputPixChave.value = valStr;
            if (r.chave === 'pix_nome_recebedor' && inputPixRecebedor) inputPixRecebedor.value = valStr || 'CAFETERIA DO TEATRO';
            if (r.chave === 'pix_cidade' && inputPixCidade) inputPixCidade.value = valStr || 'LAJEADO';
            if (r.chave === 'pix_imprimir_na_conta' && togglePixImprimir) {
              togglePixImprimir.checked = r.valor === true || r.valor === 'true';
            }
            if (r.chave === 'pix_dinamico_ativo' && inputPixDinamicoAtivo) {
              inputPixDinamicoAtivo.checked = r.valor === true || r.valor === 'true';
            }
            if (r.chave === 'pix_psp_provedor' && selectPixPspProvedor) {
              selectPixPspProvedor.value = valStr || 'sandbox';
            }
            if (r.chave === 'pix_exigir_pagamento_kds' && selectPixExigirKds) {
              selectPixExigirKds.value = valStr || 'sempre';
            }
            if (r.chave === 'pix_expiracao_totem_min' && inputPixExpiracaoTotem) {
              inputPixExpiracaoTotem.value = valStr || '10';
            }
            if (r.chave === 'pix_expiracao_online_min' && inputPixExpiracaoOnline) {
              inputPixExpiracaoOnline.value = valStr || '30';
            }
          });
        } catch (err) {
          console.warn('Erro ao carregar configurações Pix:', err);
        }

        carregarCobrancasPixConferencia();

        if (tbodyTaxas) {
          try {
            const { data: taxasRows, error } = await window.cafeteriaSupabase
              .from('formas_pagamento_taxas')
              .select('*')
              .order('forma', { ascending: true });
            if (error) throw error;

            const lista = taxasRows && taxasRows.length > 0 ? taxasRows : [
              { forma: 'dinheiro', nome: 'Dinheiro', taxa_percentual: 0, taxa_fixa: 0, prazo_recebimento_dias: 0, ativo: true },
              { forma: 'pix', nome: 'Pix', taxa_percentual: 0, taxa_fixa: 0, prazo_recebimento_dias: 0, ativo: true },
              { forma: 'cartao_debito', nome: 'Cartão de Débito', taxa_percentual: 1.39, taxa_fixa: 0, prazo_recebimento_dias: 1, ativo: true },
              { forma: 'cartao_credito', nome: 'Cartão de Crédito', taxa_percentual: 3.19, taxa_fixa: 0, prazo_recebimento_dias: 30, ativo: true },
              { forma: 'outros', nome: 'Outros / Vale', taxa_percentual: 0, taxa_fixa: 0, prazo_recebimento_dias: 0, ativo: true }
            ];

            tbodyTaxas.innerHTML = lista.map((t) => `
              <tr data-forma="${t.forma || t.codigo}" data-codigo="${t.forma || t.codigo}">
                <td style="font-weight:600;">${t.nome || t.forma || t.codigo}</td>
                <td>
                  <input type="number" class="field__input taxa-perc-input" step="0.01" min="0" max="100" value="${Number(t.taxa_percentual || 0).toFixed(2)}" style="max-width:110px;" />
                </td>
                <td>
                  <input type="number" class="field__input taxa-fixa-input" step="0.01" min="0" value="${Number(t.taxa_fixa || 0).toFixed(2)}" style="max-width:110px;" />
                </td>
                <td>
                  <input type="number" class="field__input taxa-prazo-input" step="1" min="0" value="${parseInt(t.prazo_recebimento_dias || 0, 10)}" style="max-width:95px;" />
                </td>
                <td style="text-align:center;">
                  <input type="checkbox" class="taxa-ativo-input" ${t.ativo !== false ? 'checked' : ''} />
                </td>
              </tr>
            `).join('');
          } catch (err) {
            console.warn('Erro ao carregar formas_pagamento_taxas:', err);
            tbodyTaxas.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#dc2626;">Erro ao carregar taxas de pagamento. Execute a migration CAF-000039.</td></tr>';
          }
        }
      }

      carregarConfigPixETaxas();

      btnSalvarPix?.addEventListener('click', async () => {
        const chave = (inputPixChave?.value || '').trim();
        const recebedor = (inputPixRecebedor?.value || 'CAFETERIA DO TEATRO').trim().slice(0, 25);
        const cidade = (inputPixCidade?.value || 'LAJEADO').trim().slice(0, 15);
        const imprimir = Boolean(togglePixImprimir?.checked);
        const dinamicoAtivo = Boolean(inputPixDinamicoAtivo?.checked);
        const pspProvedor = selectPixPspProvedor?.value || 'sandbox';
        const exigirKds = selectPixExigirKds?.value || 'sempre';
        const expTotem = parseInt(inputPixExpiracaoTotem?.value || '10', 10);
        const expOnline = parseInt(inputPixExpiracaoOnline?.value || '30', 10);

        btnSalvarPix.disabled = true;
        try {
          const payload = [
            { chave: 'pix_chave', valor: chave, updated_at: new Date().toISOString() },
            { chave: 'pix_nome_recebedor', valor: recebedor, updated_at: new Date().toISOString() },
            { chave: 'pix_cidade', valor: cidade, updated_at: new Date().toISOString() },
            { chave: 'pix_imprimir_na_conta', valor: imprimir, updated_at: new Date().toISOString() },
            { chave: 'pix_dinamico_ativo', valor: dinamicoAtivo, updated_at: new Date().toISOString() },
            { chave: 'pix_psp_provedor', valor: pspProvedor, updated_at: new Date().toISOString() },
            { chave: 'pix_exigir_pagamento_kds', valor: exigirKds, updated_at: new Date().toISOString() },
            { chave: 'pix_expiracao_totem_min', valor: expTotem, updated_at: new Date().toISOString() },
            { chave: 'pix_expiracao_online_min', valor: expOnline, updated_at: new Date().toISOString() }
          ];
          const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
          if (error) throw error;

          if (window.cafeteriaPix) {
            try {
              if (typeof window.cafeteriaPix.obterConfigPix === 'function') {
                await window.cafeteriaPix.obterConfigPix(true);
              } else if (typeof window.cafeteriaPix.getPixConfig === 'function') {
                await window.cafeteriaPix.getPixConfig(true);
              }
            } catch (cacheErr) {
              console.warn('Aviso ao renovar cache Pix:', cacheErr);
            }
          }
          admin.toast('Sucesso', 'Configurações Pix salvas com sucesso!', 'success');
        } catch (err) {
          console.error('Erro ao salvar configurações Pix:', err);
          admin.toast('Erro', 'Não foi possível salvar configurações Pix.', 'error');
        } finally {
          btnSalvarPix.disabled = false;
        }
      });

      btnTestarPix?.addEventListener('click', () => {
        const chave = (inputPixChave?.value || '').trim();
        if (!chave) {
          admin.toast('Chave Pix vazia', 'Informe uma chave Pix para testar o QR Code.', 'error');
          return;
        }
        const recebedor = (inputPixRecebedor?.value || 'CAFETERIA DO TEATRO').trim();
        const cidade = (inputPixCidade?.value || 'FORTALEZA').trim();

        if (!window.cafeteriaPix) {
          admin.toast('Erro', 'Módulo Pix (pix-brcode.js) não carregado.', 'error');
          return;
        }

        const res = window.cafeteriaPix.gerarPayloadPix({
          chave,
          recebedor,
          cidade,
          valor: 1.00,
          txid: 'TESTE01'
        });

        if (!res || !res.ok) {
          admin.toast('Erro no Pix', (res && res.erro) || 'Chave Pix inválida ou erro na formatação.', 'error');
          if (previewPixBox) previewPixBox.style.display = 'none';
          return;
        }

        const brCode = res.payload;
        const svgHtml = window.cafeteriaPix.gerarQrSvg(brCode, 4);

        if (previewPixBox) {
          previewPixBox.style.display = 'block';
          previewPixBox.innerHTML = `
            <div style="font-weight:700; margin-bottom:6px; color:#0f766e;">QR Code Pix de Teste (R$ 1,00)</div>
            ${res.chave ? `<div style="font-size:0.75rem; color:#64748b; margin-bottom:6px;">Chave: <strong>${res.chave}</strong></div>` : ''}
            <div style="display:inline-block; background:#fff; padding:8px; border-radius:8px; border:1px solid #e2e8f0;">${svgHtml}</div>
            <div style="margin-top:8px; font-family:monospace; font-size:0.72rem; word-break:break-all; background:#fff; padding:8px; border-radius:6px; border:1px solid #cbd5e1;">${brCode}</div>
          `;
        }
      });

      btnSalvarTaxas?.addEventListener('click', async () => {
        if (!tbodyTaxas || !window.cafeteriaSupabase) return;
        const rows = Array.from(tbodyTaxas.querySelectorAll('tr[data-codigo]'));
        if (!rows.length) return;

        btnSalvarTaxas.disabled = true;
        try {
          for (const tr of rows) {
            const forma = tr.getAttribute('data-forma') || tr.getAttribute('data-codigo');
            const taxaPerc = Math.max(0, parseFloat(tr.querySelector('.taxa-perc-input')?.value) || 0);
            const taxaFixa = Math.max(0, parseFloat(tr.querySelector('.taxa-fixa-input')?.value) || 0);
            const prazo = Math.max(0, parseInt(tr.querySelector('.taxa-prazo-input')?.value, 10) || 0);
            const ativo = Boolean(tr.querySelector('.taxa-ativo-input')?.checked);

            const { error } = await window.cafeteriaSupabase
              .from('formas_pagamento_taxas')
              .update({
                taxa_percentual: taxaPerc,
                taxa_fixa: taxaFixa,
                prazo_recebimento_dias: prazo,
                ativo,
                updated_at: new Date().toISOString()
              })
              .eq('forma', forma);
            if (error) throw error;
          }
          admin.toast('Sucesso', 'Taxas de pagamento atualizadas! Valem apenas para novas vendas.', 'success');
        } catch (err) {
          console.error('Erro ao salvar taxas de pagamento:', err);
          admin.toast('Erro', 'Não foi possível salvar as taxas de pagamento.', 'error');
        } finally {
          btnSalvarTaxas.disabled = false;
        }
      });

      // --- CAF-000124: MÓDULO FISCAL & NFC-E ---
      const inputNfceAtiva = document.getElementById('config-nfce-ativa');
      const selectNfceModo = document.getElementById('config-nfce-modo');
      const selectNfceAmbiente = document.getElementById('config-nfce-ambiente');
      const selectNfceProvedor = document.getElementById('config-nfce-provedor');
      const inputNfceSerie = document.getElementById('config-nfce-serie');
      const inputNfceProximoNumero = document.getElementById('config-nfce-proximo-numero');
      const inputNfceCnpj = document.getElementById('config-nfce-cnpj');
      const inputNfceRazaoSocial = document.getElementById('config-nfce-razao-social');
      const inputNfceIe = document.getElementById('config-nfce-ie');
      const btnSalvarNfce = document.getElementById('btn-salvar-config-nfce');

      const inputNfceFiltroMes = document.getElementById('config-nfce-filtro-mes');
      const selectNfceFiltroStatus = document.getElementById('config-nfce-filtro-status');
      const btnAtualizarNfceLista = document.getElementById('btn-atualizar-nfce-lista');
      const tbodyNfce = document.getElementById('config-nfce-tbody');

      const lblResumoAutorizadas = document.getElementById('nfce-resumo-autorizadas');
      const lblResumoValor = document.getElementById('nfce-resumo-valor');
      const lblResumoCanceladas = document.getElementById('nfce-resumo-canceladas');
      const lblResumoRejeitadas = document.getElementById('nfce-resumo-rejeitadas');
      const lblResumoContingencia = document.getElementById('nfce-resumo-contingencia');

      async function carregarConfigNfce() {
        if (!window.cafeteriaSupabase) return;
        try {
          const { data: rows } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', [
              'nfce_ativa', 'nfce_modo_emissao', 'nfce_ambiente', 'nfce_provedor',
              'nfce_serie', 'nfce_proximo_numero', 'nfce_emitente_cnpj',
              'nfce_emitente_razao_social', 'nfce_emitente_ie'
            ]);

          (rows || []).forEach(r => {
            const valStr = typeof r.valor === 'string' ? r.valor : (r.valor !== null && r.valor !== undefined ? String(r.valor).replace(/^"|"$/g, '') : '');
            if (r.chave === 'nfce_ativa' && inputNfceAtiva) inputNfceAtiva.checked = r.valor === true || r.valor === 'true';
            if (r.chave === 'nfce_modo_emissao' && selectNfceModo) selectNfceModo.value = valStr || 'sob_demanda';
            if (r.chave === 'nfce_ambiente' && selectNfceAmbiente) selectNfceAmbiente.value = valStr || 'homologacao';
            if (r.chave === 'nfce_provedor' && selectNfceProvedor) selectNfceProvedor.value = valStr || 'sandbox';
            if (r.chave === 'nfce_serie' && inputNfceSerie) inputNfceSerie.value = valStr || '1';
            if (r.chave === 'nfce_proximo_numero' && inputNfceProximoNumero) inputNfceProximoNumero.value = valStr || '1';
            if (r.chave === 'nfce_emitente_cnpj' && inputNfceCnpj) inputNfceCnpj.value = valStr || '00.000.000/0001-91';
            if (r.chave === 'nfce_emitente_razao_social' && inputNfceRazaoSocial) inputNfceRazaoSocial.value = valStr || 'Cafeteria do Teatro Ltda';
            if (r.chave === 'nfce_emitente_ie' && inputNfceIe) inputNfceIe.value = valStr || '123456789';
          });
        } catch (err) {
          console.warn('Erro ao carregar configurações fiscais:', err);
        }
      }

      async function carregarListaNotasFiscais() {
        if (!tbodyNfce || !window.cafeteriaDB?.nfce) return;
        const mesAtual = inputNfceFiltroMes?.value || new Date().toISOString().slice(0, 7);
        const statusFiltro = selectNfceFiltroStatus?.value || null;

        try {
          tbodyNfce.innerHTML = '<tr><td colspan="7" class="text-center">Carregando notas fiscais...</td></tr>';
          const { notas = [], resumo = {} } = await window.cafeteriaDB.nfce.listarNotas({
            anoMes: mesAtual,
            status: statusFiltro
          });

          if (lblResumoAutorizadas) lblResumoAutorizadas.textContent = resumo.total_autorizadas || 0;
          if (lblResumoValor) {
            lblResumoValor.textContent = Number(resumo.valor_total_autorizado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          }
          if (lblResumoCanceladas) lblResumoCanceladas.textContent = resumo.total_canceladas || 0;
          if (lblResumoRejeitadas) lblResumoRejeitadas.textContent = resumo.total_rejeitadas || 0;
          if (lblResumoContingencia) lblResumoContingencia.textContent = resumo.total_contingencia || 0;

          if (!notas.length) {
            tbodyNfce.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma nota fiscal emitida no período.</td></tr>';
            return;
          }

          tbodyNfce.innerHTML = notas.map(n => {
            const numSerie = `${n.numero} / ${n.serie}`;
            const dataFmt = new Date(n.created_at).toLocaleString('pt-BR');
            const totalFmt = Number(n.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const docConsumidor = n.consumidor_cpf_cnpj || 'Não informado';
            const statusBadge = n.status === 'autorizada'
              ? '<span class="status-badge status-badge--success">Autorizada</span>'
              : n.status === 'cancelada'
              ? '<span class="status-badge status-badge--danger">Cancelada</span>'
              : n.status === 'rejeitada'
              ? '<span class="status-badge status-badge--warning">Rejeitada</span>'
              : '<span class="status-badge status-badge--neutral">Contingência</span>';

            const canCancel = n.status === 'autorizada';
            const canRetry = n.status === 'rejeitada' || n.status === 'contingencia';

            return `
              <tr data-nota-id="${n.id}">
                <td><strong>${escHtml(numSerie)}</strong></td>
                <td><small>${escHtml(dataFmt)}</small></td>
                <td>Mesa ${escHtml(n.mesa_codigo || '-')}</td>
                <td><small>${escHtml(docConsumidor)}</small></td>
                <td><strong>${totalFmt}</strong></td>
                <td>${statusBadge}</td>
                <td style="white-space: nowrap;">
                  <button type="button" class="btn btn--secondary btn--sm btn-imprimir-danfe" data-id="${n.id}" title="Imprimir DANFE NFC-e">🖨️ DANFE</button>
                  ${canCancel ? `<button type="button" class="btn btn--ghost btn--sm btn-cancelar-nota text-danger" data-id="${n.id}" title="Cancelar Nota">🚫 Cancelar</button>` : ''}
                  ${canRetry ? `<button type="button" class="btn btn--outline-dark btn--sm btn-reenviar-nota" data-fechamento="${n.fechamento_id || ''}" title="Reenviar Nota">🔄 Reenviar</button>` : ''}
                </td>
              </tr>
            `;
          }).join('');
        } catch (err) {
          console.error('Erro ao listar notas fiscais:', err);
          tbodyNfce.innerHTML = '<tr><td colspan="7" class="text-center" style="color:#dc2626;">Erro ao carregar relatório fiscal.</td></tr>';
        }
      }

      btnSalvarNfce?.addEventListener('click', async () => {
        btnSalvarNfce.disabled = true;
        try {
          const payload = [
            { chave: 'nfce_ativa', valor: inputNfceAtiva?.checked ?? true, updated_at: new Date().toISOString() },
            { chave: 'nfce_modo_emissao', valor: selectNfceModo?.value || 'sob_demanda', updated_at: new Date().toISOString() },
            { chave: 'nfce_ambiente', valor: selectNfceAmbiente?.value || 'homologacao', updated_at: new Date().toISOString() },
            { chave: 'nfce_provedor', valor: selectNfceProvedor?.value || 'sandbox', updated_at: new Date().toISOString() },
            { chave: 'nfce_serie', valor: parseInt(inputNfceSerie?.value, 10) || 1, updated_at: new Date().toISOString() },
            { chave: 'nfce_proximo_numero', valor: parseInt(inputNfceProximoNumero?.value, 10) || 1, updated_at: new Date().toISOString() },
            { chave: 'nfce_emitente_cnpj', valor: (inputNfceCnpj?.value || '').trim(), updated_at: new Date().toISOString() },
            { chave: 'nfce_emitente_razao_social', valor: (inputNfceRazaoSocial?.value || '').trim(), updated_at: new Date().toISOString() },
            { chave: 'nfce_emitente_ie', valor: (inputNfceIe?.value || '').trim(), updated_at: new Date().toISOString() }
          ];

          const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
          if (error) throw error;
          admin.toast('Sucesso', 'Configurações fiscais salvas com sucesso!', 'success');
        } catch (err) {
          console.error('Erro ao salvar configurações fiscais:', err);
          admin.toast('Erro', 'Não foi possível salvar configurações fiscais: ' + (err.message || ''), 'error');
        } finally {
          btnSalvarNfce.disabled = false;
        }
      });

      btnAtualizarNfceLista?.addEventListener('click', carregarListaNotasFiscais);
      selectNfceFiltroStatus?.addEventListener('change', carregarListaNotasFiscais);
      inputNfceFiltroMes?.addEventListener('change', carregarListaNotasFiscais);

      tbodyNfce?.addEventListener('click', async (e) => {
        const btnPrint = e.target.closest('.btn-imprimir-danfe');
        if (btnPrint) {
          const notaId = btnPrint.dataset.id;
          const { notas = [] } = await window.cafeteriaDB.nfce.listarNotas({
            anoMes: inputNfceFiltroMes?.value || new Date().toISOString().slice(0, 7)
          });
          const nota = notas.find(n => n.id === notaId);
          if (nota && window.cafeteriaPrint?.printDanfeNfce) {
            window.cafeteriaPrint.printDanfeNfce(nota, {
              razao_social: inputNfceRazaoSocial?.value,
              cnpj: inputNfceCnpj?.value,
              ie: inputNfceIe?.value
            });
          }
          return;
        }

        const btnCancel = e.target.closest('.btn-cancelar-nota');
        if (btnCancel) {
          const notaId = btnCancel.dataset.id;
          const motivo = prompt('Informe a justificativa do cancelamento da NFC-e (mínimo 15 caracteres):');
          if (!motivo) return;
          if (motivo.trim().length < 15) {
            alert('A justificativa deve conter no mínimo 15 caracteres conforme exigência fiscal.');
            return;
          }
          const pin = prompt('Informe o PIN de supervisor/gerente:') || null;
          try {
            await window.cafeteriaDB.nfce.cancelarNfce({ notaId, motivo: motivo.trim(), pin });
            admin.toast('Sucesso', 'NFC-e cancelada com sucesso!', 'success');
            carregarListaNotasFiscais();
          } catch (cancelErr) {
            alert('Falha ao cancelar: ' + (cancelErr.message || 'Erro desconhecido'));
          }
          return;
        }

        const btnRetry = e.target.closest('.btn-reenviar-nota');
        if (btnRetry) {
          const fechamentoId = btnRetry.dataset.fechamento;
          if (!fechamentoId) return;
          btnRetry.disabled = true;
          try {
            const res = await window.cafeteriaDB.nfce.emitirNfce({ fechamentoId });
            if (res?.sucesso) {
              admin.toast('Sucesso', 'NFC-e autorizada com sucesso!', 'success');
              carregarListaNotasFiscais();
            } else {
              alert('Erro na reemissão: ' + (res?.motivo || res?.erro || 'Tente novamente'));
            }
          } catch (retryErr) {
            alert('Erro ao reenviar: ' + retryErr.message);
          } finally {
            btnRetry.disabled = false;
          }
        }
      });

      if (inputNfceFiltroMes && !inputNfceFiltroMes.value) {
        inputNfceFiltroMes.value = new Date().toISOString().slice(0, 7);
      }
      carregarConfigNfce();
      carregarListaNotasFiscais();

      // --- CAF-000038: PEDIDO ONLINE PARA RETIRADA & ENCOMENDAS ---
      const toggleOnlineAtivo = document.getElementById('config-pedido-online-ativo');
      const inputOnlineTempo = document.getElementById('config-pedido-online-tempo');
      const inputOnlineLimite = document.getElementById('config-pedido-online-limite');
      const inputOnlineKds = document.getElementById('config-pedido-online-kds');
      const btnSalvarOnline = document.getElementById('btn-salvar-config-online');
      const btnCompartilharCardapio = document.getElementById('btn-compartilhar-cardapio-online');
      const shareBoxOnline = document.getElementById('config-online-qr-share-box');

      async function carregarConfigOnline() {
        if (!window.cafeteriaSupabase) return;
        try {
          const { data } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', ['pedido_online_ativo', 'pedido_online_tempo_estimado_min', 'pedido_online_limite_janela', 'pedido_online_antecedencia_kds_min']);
          (data || []).forEach((r) => {
            if (r.chave === 'pedido_online_ativo' && toggleOnlineAtivo) {
              toggleOnlineAtivo.checked = !(r.valor === false || r.valor === 'false');
            }
            if (r.chave === 'pedido_online_tempo_estimado_min' && inputOnlineTempo) {
              inputOnlineTempo.value = parseInt(r.valor, 10) || 15;
            }
            if (r.chave === 'pedido_online_limite_janela' && inputOnlineLimite) {
              inputOnlineLimite.value = parseInt(r.valor, 10) || 5;
            }
            if (r.chave === 'pedido_online_antecedencia_kds_min' && inputOnlineKds) {
              inputOnlineKds.value = parseInt(r.valor, 10) || 20;
            }
          });
        } catch (e) {
          console.warn('Erro ao carregar configurações de pedido online:', e);
        }
      }
      carregarConfigOnline();

      btnSalvarOnline?.addEventListener('click', async () => {
        if (!window.cafeteriaSupabase) return;
        btnSalvarOnline.disabled = true;
        try {
          const payload = [
            { chave: 'pedido_online_ativo', valor: Boolean(toggleOnlineAtivo?.checked), updated_at: new Date().toISOString() },
            { chave: 'pedido_online_tempo_estimado_min', valor: Math.max(5, parseInt(inputOnlineTempo?.value, 10) || 15), updated_at: new Date().toISOString() },
            { chave: 'pedido_online_limite_janela', valor: Math.max(1, parseInt(inputOnlineLimite?.value, 10) || 5), updated_at: new Date().toISOString() },
            { chave: 'pedido_online_antecedencia_kds_min', valor: Math.max(5, parseInt(inputOnlineKds?.value, 10) || 20), updated_at: new Date().toISOString() }
          ];
          const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
          if (error) throw error;
          admin.toast('Sucesso', 'Configurações de pedido online salvas!', 'success');
        } catch (err) {
          console.error('Erro ao salvar configurações online:', err);
          admin.toast('Erro', 'Falha ao salvar configurações online.', 'error');
        } finally {
          btnSalvarOnline.disabled = false;
        }
      });

      btnCompartilharCardapio?.addEventListener('click', () => {
        if (!shareBoxOnline) return;
        const urlCardapio = `${window.location.origin}/cardapio.html`;
        let svgQr = '';
        if (typeof qrcode === 'function') {
          try {
            const qr = qrcode(0, 'M');
            qr.addData(urlCardapio);
            qr.make();
            svgQr = qr.createSvgTag(4, 2);
          } catch (e) {}
        }
        shareBoxOnline.style.display = 'block';
        shareBoxOnline.innerHTML = `
          <div style="font-weight:700; margin-bottom:8px;">📲 Link & QR Code para Bio do Instagram, WhatsApp e Cartaz</div>
          ${svgQr ? `<div style="display:inline-block; background:#fff; padding:10px; border-radius:8px; margin-bottom:10px;">${svgQr}</div>` : ''}
          <div style="display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap;">
            <input type="text" class="field__input" value="${urlCardapio}" readonly style="max-width:340px; text-align:center;" id="input-share-url-cardapio" />
            <button type="button" class="btn btn--primary" id="btn-copy-url-cardapio">📋 Copiar Link</button>
          </div>
        `;
        document.getElementById('btn-copy-url-cardapio')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(urlCardapio);
            admin.toast('Copiado!', 'Link do cardápio copiado para a área de transferência.', 'success');
          } catch (e) {
            document.getElementById('input-share-url-cardapio')?.select();
            document.execCommand('copy');
            admin.toast('Copiado!', 'Link do cardápio copiado.', 'success');
          }
        });
      });

      // --- CAF-000062: MODO DIA DE ESPETÁCULO (TEATRO UNIVATES) ---
      const toggleEspetaculoAtivo = document.getElementById('toggle-espetaculo-ativo');
      const inputEspetaculoNome = document.getElementById('config-espetaculo-nome');
      const inputEspetaculoData = document.getElementById('config-espetaculo-data');
      const inputEspetaculoHorario = document.getElementById('config-espetaculo-horario');
      const btnSalvarEspetaculo = document.getElementById('btn-salvar-config-espetaculo');

      async function carregarConfigEspetaculo() {
        if (!window.cafeteriaSupabase) return;
        try {
          const { data } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', ['espetaculo_ativo', 'espetaculo_nome', 'espetaculo_data', 'espetaculo_horario_intervalo']);
          (data || []).forEach((r) => {
            const val = typeof r.valor === 'string' ? r.valor.replace(/^"|"$/g, '') : r.valor;
            if (r.chave === 'espetaculo_ativo' && toggleEspetaculoAtivo) {
              toggleEspetaculoAtivo.checked = Boolean(val === true || val === 'true');
            }
            if (r.chave === 'espetaculo_nome' && inputEspetaculoNome) {
              inputEspetaculoNome.value = val || '';
            }
            if (r.chave === 'espetaculo_data' && inputEspetaculoData) {
              inputEspetaculoData.value = val || '';
            }
            if (r.chave === 'espetaculo_horario_intervalo' && inputEspetaculoHorario) {
              inputEspetaculoHorario.value = val || '21:00';
            }
          });
        } catch (e) {
          console.warn('[Settings] Erro ao carregar config espetaculo:', e);
        }
      }

      btnSalvarEspetaculo?.addEventListener('click', async () => {
        btnSalvarEspetaculo.disabled = true;
        try {
          const payload = [
            { chave: 'espetaculo_ativo', valor: Boolean(toggleEspetaculoAtivo?.checked), updated_at: new Date().toISOString() },
            { chave: 'espetaculo_nome', valor: (inputEspetaculoNome?.value || '').trim(), updated_at: new Date().toISOString() },
            { chave: 'espetaculo_data', valor: (inputEspetaculoData?.value || '').trim(), updated_at: new Date().toISOString() },
            { chave: 'espetaculo_horario_intervalo', valor: (inputEspetaculoHorario?.value || '21:00').trim(), updated_at: new Date().toISOString() }
          ];
          const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
          if (error) throw error;
          admin.toast('Sucesso', 'Configurações do Modo Espetáculo salvas!', 'success');
        } catch (err) {
          console.error('Erro ao salvar modo espetaculo:', err);
          admin.toast('Erro', 'Não foi possível salvar o Modo Espetáculo.', 'error');
        } finally {
          btnSalvarEspetaculo.disabled = false;
        }
      });

      carregarConfigEspetaculo();

      // --- CAF-000063: FIDELIDADE & CASHBACK AUTOMÁTICO ---
      const toggleCashbackAtivo = document.getElementById('toggle-cashback-ativo');
      const inputCashbackPerc = document.getElementById('config-cashback-percentual');
      const inputCashbackMin = document.getElementById('config-cashback-minimo');
      const btnSalvarCashback = document.getElementById('btn-salvar-config-cashback');

      async function carregarConfigCashback() {
        if (!window.cafeteriaSupabase) return;
        try {
          const { data } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', ['cashback_ativo', 'cashback_percentual_padrao', 'cashback_valor_minimo_pedido']);
          (data || []).forEach((r) => {
            const val = typeof r.valor === 'string' ? r.valor.replace(/^"|"$/g, '') : r.valor;
            if (r.chave === 'cashback_ativo' && toggleCashbackAtivo) {
              toggleCashbackAtivo.checked = Boolean(val === true || val === 'true');
            }
            if (r.chave === 'cashback_percentual_padrao' && inputCashbackPerc) {
              inputCashbackPerc.value = val !== undefined && val !== null ? val : '5';
            }
            if (r.chave === 'cashback_valor_minimo_pedido' && inputCashbackMin) {
              inputCashbackMin.value = val !== undefined && val !== null ? val : '0';
            }
          });
        } catch (e) {
          console.warn('[Settings] Erro ao carregar config cashback:', e);
        }
      }

      btnSalvarCashback?.addEventListener('click', async () => {
        btnSalvarCashback.disabled = true;
        try {
          const payload = [
            { chave: 'cashback_ativo', valor: Boolean(toggleCashbackAtivo?.checked), updated_at: new Date().toISOString() },
            { chave: 'cashback_percentual_padrao', valor: Number(inputCashbackPerc?.value || 5), updated_at: new Date().toISOString() },
            { chave: 'cashback_valor_minimo_pedido', valor: Number(inputCashbackMin?.value || 0), updated_at: new Date().toISOString() }
          ];
          const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
          if (error) throw error;
          admin.toast('Sucesso', 'Configurações de Fidelidade & Cashback salvas!', 'success');
        } catch (err) {
          console.error('Erro ao salvar cashback:', err);
          admin.toast('Erro', 'Não foi possível salvar o Fidelidade & Cashback.', 'error');
        } finally {
          btnSalvarCashback.disabled = false;
        }
      });

      carregarConfigCashback();

      // --- CAF-000040: TOTEM DE AUTOATENDIMENTO NO BALCÃO ---
      const btnGerarTotem = document.getElementById('btn-gerar-pareamento-totem');
      const boxCodigoTotem = document.getElementById('totem-codigo-gerado-box');
      const tbodyTotens = document.getElementById('totens-table-body');
      const inputTotemExpiracao = document.getElementById('config-totem-expiracao');
      const inputTotemAvisoTitulo = document.getElementById('config-totem-aviso-titulo');
      const inputTotemAvisoSub = document.getElementById('config-totem-aviso-sub');
      const selTotemAnimacaoCatalogo = document.getElementById('config-totem-animacao-catalogo');
      const inputTotemMidiaFile = document.getElementById('input-totem-midia-file');
      const btnPublicarTotemMidia = document.getElementById('btn-publicar-totem-midia');
      const btnRemoverTotemMidia = document.getElementById('btn-remover-totem-midia');
      const totemMidiaStatus = document.getElementById('totem-midia-status');
      const btnSalvarConfigTotem = document.getElementById('btn-salvar-config-totem');
      const selTotemSugCategoria = document.getElementById('totem-sug-categoria');
      const selTotemSugProduto = document.getElementById('totem-sug-produto');
      const selTotemSugCanal = document.getElementById('totem-sug-canal');
      const inputTotemSugFrase = document.getElementById('totem-sug-frase');
      const btnAddTotemSugestao = document.getElementById('btn-add-totem-sugestao');
      const tbodyTotemSugestoes = document.getElementById('totem-sugestoes-tbody');
      const btnRecarregarMetricasSug = document.getElementById('btn-recarregar-metricas-sug');
      const boxMetricasSugConteudo = document.getElementById('metricas-sugestoes-conteudo');

      let totemAnimacaoConfigAtual = { tipo: 'catalogo', id: 'nenhuma' };

      async function carregarConfigTotem() {
        if (!window.cafeteriaSupabase) return;
        try {
          const { data } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .in('chave', ['totem_expiracao_pagamento_min', 'totem_aviso_teatro_titulo', 'totem_aviso_teatro_subtitulo', 'totem_animacao_fundo']);
          (data || []).forEach((r) => {
            if (r.chave === 'totem_expiracao_pagamento_min' && inputTotemExpiracao) {
              inputTotemExpiracao.value = parseInt(r.valor, 10) || 15;
            }
            if (r.chave === 'totem_aviso_teatro_titulo' && inputTotemAvisoTitulo) {
              inputTotemAvisoTitulo.value = String(r.valor ?? '').replace(/^"|"$/g, '') || '🎭 Hoje no Teatro Univates';
            }
            if (r.chave === 'totem_aviso_teatro_subtitulo' && inputTotemAvisoSub) {
              inputTotemAvisoSub.value = String(r.valor ?? '').replace(/^"|"$/g, '') || '';
            }
            if (r.chave === 'totem_animacao_fundo') {
              try {
                totemAnimacaoConfigAtual = typeof r.valor === 'string' ? JSON.parse(r.valor) : (r.valor || { tipo: 'catalogo', id: 'nenhuma' });
              } catch (_) {
                totemAnimacaoConfigAtual = { tipo: 'catalogo', id: 'nenhuma' };
              }
              if (totemAnimacaoConfigAtual.tipo === 'midia' && totemAnimacaoConfigAtual.url) {
                if (selTotemAnimacaoCatalogo) selTotemAnimacaoCatalogo.value = 'nenhuma';
                if (btnRemoverTotemMidia) btnRemoverTotemMidia.style.display = 'inline-flex';
                if (totemMidiaStatus) totemMidiaStatus.textContent = 'Mídia ativa: ' + totemAnimacaoConfigAtual.url.split('/').pop();
              } else {
                if (selTotemAnimacaoCatalogo) selTotemAnimacaoCatalogo.value = totemAnimacaoConfigAtual.id || 'nenhuma';
                if (btnRemoverTotemMidia) btnRemoverTotemMidia.style.display = 'none';
                if (totemMidiaStatus) totemMidiaStatus.textContent = 'Usando animação do catálogo.';
              }
            }
          });
        } catch (e) {
          console.warn('Erro ao carregar opções do totem:', e);
        }
      }
      carregarConfigTotem();

      btnSalvarConfigTotem?.addEventListener('click', async () => {
        if (!window.cafeteriaSupabase) return;
        btnSalvarConfigTotem.disabled = true;
        try {
          const animId = selTotemAnimacaoCatalogo?.value || 'nenhuma';
          if (totemAnimacaoConfigAtual.tipo !== 'midia' || animId !== 'nenhuma') {
            totemAnimacaoConfigAtual = { tipo: 'catalogo', id: animId };
          }
          const payload = [
            { chave: 'totem_expiracao_pagamento_min', valor: Math.max(5, parseInt(inputTotemExpiracao?.value, 10) || 15), updated_at: new Date().toISOString() },
            { chave: 'totem_aviso_teatro_titulo', valor: (inputTotemAvisoTitulo?.value || '🎭 Hoje no Teatro Univates').trim(), updated_at: new Date().toISOString() },
            { chave: 'totem_aviso_teatro_subtitulo', valor: (inputTotemAvisoSub?.value || '').trim(), updated_at: new Date().toISOString() },
            { chave: 'totem_animacao_fundo', valor: totemAnimacaoConfigAtual, updated_at: new Date().toISOString() }
          ];
          const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
          if (error) throw error;
          admin.toast('Sucesso', 'Opções do Totem salvas!', 'success');
          carregarConfigTotem();
        } catch (err) {
          console.error('Erro ao salvar opções do totem:', err);
          admin.toast('Erro', 'Não foi possível salvar opções do Totem.', 'error');
        } finally {
          btnSalvarConfigTotem.disabled = false;
        }
      });

      function validarArquivoAnimacaoTotem(file) {
        if (!file) return { valido: false, erro: 'Nenhum arquivo fornecido.' };
        const nameLower = (file.name || '').toLowerCase();
        const isMp4 = nameLower.endsWith('.mp4') && file.type === 'video/mp4';
        const isGif = nameLower.endsWith('.gif') && file.type === 'image/gif';

        if (!isMp4 && !isGif) {
          return { valido: false, erro: 'Formato recusado. Apenas arquivos .mp4 ou .gif legítimos são permitidos.' };
        }

        const MAX_MP4_BYTES = 15 * 1024 * 1024; // 15 MB
        const MAX_GIF_BYTES = 8 * 1024 * 1024;  // 8 MB

        if (isMp4 && file.size > MAX_MP4_BYTES) {
          return { valido: false, erro: 'Arquivo MP4 excede o limite máximo permitido de 15 MB.' };
        }
        if (isGif && file.size > MAX_GIF_BYTES) {
          return { valido: false, erro: 'Arquivo GIF excede o limite máximo permitido de 8 MB.' };
        }

        return { valido: true, tipo: isMp4 ? 'video/mp4' : 'image/gif' };
      }
      window.validarArquivoAnimacaoTotem = validarArquivoAnimacaoTotem;

      // Publicar animação própria (GIF ou MP4) - CAF-000103 (RF19, CA24, CA25)
      btnPublicarTotemMidia?.addEventListener('click', async () => {
        const file = inputTotemMidiaFile?.files?.[0];
        if (!file) {
          admin.toast('Atenção', 'Selecione um arquivo MP4 ou GIF antes de publicar.', 'warning');
          return;
        }

        const validacao = validarArquivoAnimacaoTotem(file);
        if (!validacao.valido) {
          admin.toast('Erro', validacao.erro, 'error');
          return;
        }

        const isMp4 = validacao.tipo === 'video/mp4';

        btnPublicarTotemMidia.disabled = true;
        try {
          const ext = isMp4 ? 'mp4' : 'gif';
          const path = `totem/fundo-${Date.now()}.${ext}`;
          let publicUrl = null;

          if (window.cafeteriaDB?.assets?.upload) {
            publicUrl = await window.cafeteriaDB.assets.upload(file, path);
          } else if (window.cafeteriaSupabase?.storage) {
            const { data, error } = await window.cafeteriaSupabase.storage
              .from('site-assets')
              .upload(path, file, { cacheControl: '3600', upsert: true });
            if (error) throw error;
            const { data: pubData } = window.cafeteriaSupabase.storage.from('site-assets').getPublicUrl(data.path);
            publicUrl = pubData?.publicUrl;
          }

          if (!publicUrl) throw new Error('Não foi possível obter a URL pública do arquivo enviado.');

          totemAnimacaoConfigAtual = {
            tipo: 'midia',
            url: publicUrl,
            mime: isMp4 ? 'video/mp4' : 'image/gif'
          };

          const { error: saveErr } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert([{ chave: 'totem_animacao_fundo', valor: totemAnimacaoConfigAtual, updated_at: new Date().toISOString() }]);
          if (saveErr) throw saveErr;

          admin.toast('Sucesso', 'Animação própria do Totem publicada!', 'success');
          if (inputTotemMidiaFile) inputTotemMidiaFile.value = '';
          carregarConfigTotem();
        } catch (err) {
          console.error('Erro ao publicar animação do totem:', err);
          admin.toast('Erro', 'Falha ao enviar arquivo de animação: ' + (err.message || err), 'error');
        } finally {
          btnPublicarTotemMidia.disabled = false;
        }
      });

      btnRemoverTotemMidia?.addEventListener('click', async () => {
        const ok = await admin.confirm({
          title: 'Remover mídia?',
          msg: 'Deseja remover a mídia personalizada e voltar à animação do catálogo?',
          okLabel: 'Remover'
        });
        if (!ok) return;
        totemAnimacaoConfigAtual = { tipo: 'catalogo', id: 'nenhuma' };
        try {
          const { error } = await window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert([{ chave: 'totem_animacao_fundo', valor: totemAnimacaoConfigAtual, updated_at: new Date().toISOString() }]);
          if (error) throw error;
          admin.toast('Sucesso', 'Mídia personalizada removida!', 'success');
          carregarConfigTotem();
        } catch (e) {
          admin.toast('Erro', 'Não foi possível remover mídia.', 'error');
        }
      });

      async function carregarSelectsSugestoesTotem() {
        if (!window.cafeteriaSupabase) return;
        try {
          const [{ data: cats }, { data: prods }] = await Promise.all([
            window.cafeteriaSupabase.from('categorias').select('id, nome').eq('ativo', true).order('ordem'),
            window.cafeteriaSupabase.from('produtos').select('id, nome, preco').eq('ativo', true).order('nome')
          ]);
          if (selTotemSugCategoria && cats) {
            selTotemSugCategoria.innerHTML = `<option value="">Qualquer categoria no carrinho</option>` +
              cats.map((c) => `<option value="${c.id}">${window.escapeHtml ? window.escapeHtml(c.nome) : c.nome}</option>`).join('');
          }
          if (selTotemSugProduto && prods) {
            selTotemSugProduto.innerHTML = `<option value="">Selecione um produto...</option>` +
              prods.map((p) => `<option value="${p.id}">${window.escapeHtml ? window.escapeHtml(p.nome) : p.nome} (R$ ${Number(p.preco || 0).toFixed(2).replace('.', ',')})</option>`).join('');
          }
        } catch (e) {}
      }

      async function carregarSugestoesTotem() {
        if (!tbodyTotemSugestoes || !window.cafeteriaSupabase) return;
        try {
          const { data, error } = await window.cafeteriaSupabase
            .from('sugestoes_regras')
            .select('id, gatilho_categoria_id, produto_sugerido_id, frase_destaque, canal, prioridade, categorias(nome), produtos!sugestoes_regras_produto_sugerido_id_fkey(nome, preco)')
            .eq('ativo', true)
            .order('ordem');
          if (error) throw error;
          if (!data || data.length === 0) {
            tbodyTotemSugestoes.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-sec);">Nenhuma sugestão personalizada cadastrada.</td></tr>';
            return;
          }
          tbodyTotemSugestoes.innerHTML = data.map((s) => {
            const catNome = s.categorias?.nome || 'Qualquer item no carrinho';
            const prodNome = s.produtos?.nome || s.produto_sugerido_id;
            const prodPreco = s.produtos?.preco ? ` (R$ ${Number(s.produtos.preco).toFixed(2).replace('.', ',')})` : '';
            const canalNome = s.canal ? s.canal.toUpperCase() : 'TODOS';
            return `
              <tr>
                <td>${window.escapeHtml ? window.escapeHtml(catNome) : catNome}</td>
                <td><strong>${window.escapeHtml ? window.escapeHtml(prodNome) : prodNome}</strong>${prodPreco}</td>
                <td><span style="font-size:11px; font-weight:700; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${canalNome}</span></td>
                <td>${window.escapeHtml ? window.escapeHtml(s.frase_destaque || '') : (s.frase_destaque || '')}</td>
                <td>
                  <button type="button" class="btn btn--danger btn--sm btn-del-totem-sug" data-id="${s.id}">Excluir</button>
                </td>
              </tr>
            `;
          }).join('');

          tbodyTotemSugestoes.querySelectorAll('.btn-del-totem-sug').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              await window.cafeteriaSupabase.from('sugestoes_regras').delete().eq('id', id);
              carregarSugestoesTotem();
            });
          });
        } catch (e) {
          tbodyTotemSugestoes.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Execute a migration CAF-000150 para configurar sugestões.</td></tr>';
        }
      }

      async function carregarMetricasSugestoes() {
        if (!boxMetricasSugConteudo || !window.cafeteriaSupabase) return;
        try {
          const { data, error } = await window.cafeteriaSupabase.rpc('get_metricas_sugestoes');
          if (error) throw error;
          if (!data || data.length === 0) {
            boxMetricasSugConteudo.innerHTML = '<em>Nenhuma exibição ou aceite registrado nos últimos 30 dias.</em>';
            return;
          }
          boxMetricasSugConteudo.innerHTML = `
            <div class="adm-metricas-sug-grid">
              ${data.map(m => `
                <div class="adm-metricas-sug-card">
                  <div class="adm-metricas-sug-card-name">${window.escapeHtml ? window.escapeHtml(m.produto_nome) : m.produto_nome} (${(m.canal || 'geral').toUpperCase()})</div>
                  <div class="adm-metricas-sug-card-stats">
                    ${m.total_exibicoes} exibidas · ${m.total_aceites} aceitas
                  </div>
                  <div class="adm-metricas-sug-card-taxa">
                    ${m.taxa_aceitacao}% aceitação
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        } catch (err) {
          boxMetricasSugConteudo.innerHTML = '<em>Sem dados ou métricas ainda.</em>';
        }
      }

      carregarSelectsSugestoesTotem();
      carregarSugestoesTotem();
      carregarMetricasSugestoes();
      btnRecarregarMetricasSug?.addEventListener('click', carregarMetricasSugestoes);

      btnAddTotemSugestao?.addEventListener('click', async () => {
        const prodId = selTotemSugProduto?.value;
        if (!prodId) {
          admin.toast('Atenção', 'Selecione o produto a ser sugerido.', 'error');
          return;
        }
        const catId = selTotemSugCategoria?.value || null;
        const canal = selTotemSugCanal?.value || 'todos';
        const frase = (inputTotemSugFrase?.value || 'Que tal acompanhar seu pedido?').trim();
        try {
          const { error } = await window.cafeteriaSupabase.from('sugestoes_regras').insert([{
            gatilho_categoria_id: catId,
            produto_sugerido_id: prodId,
            canal: canal,
            frase_destaque: frase,
            ativo: true
          }]);
          if (error) throw error;
          admin.toast('Sucesso', 'Sugestão de complemento adicionada!', 'success');
          carregarSugestoesTotem();
        } catch (err) {
          console.error('Erro ao adicionar sugestão totem:', err);
          admin.toast('Erro', 'Não foi possível adicionar a sugestão.', 'error');
        }
      });

      async function carregarTotens() {
        if (!tbodyTotens || !window.cafeteriaSupabase) return;
        try {
          const { data, error } = await window.cafeteriaSupabase
            .from('totens')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) throw error;
          if (!data || data.length === 0) {
            tbodyTotens.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-sec);">Nenhum totem pareado ainda.</td></tr>';
            return;
          }
          tbodyTotens.innerHTML = data.map((t) => {
            const ultimoStr = t.ultimo_acesso
              ? new Date(t.ultimo_acesso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : 'Nunca acessou';
            return `
            <tr>
              <td style="font-weight:600;">${window.escapeHtml ? window.escapeHtml(t.nome) : t.nome}</td>
              <td><code>${t.codigo_pareamento || 'Pareado'}</code></td>
              <td style="font-size:0.82rem; color:var(--text-sec);">${ultimoStr}</td>
              <td>
                <span class="status-pill ${t.ativo ? 'status-pill--ativo' : 'status-pill--inativo'}">
                  ${t.ativo ? (t.pareado_em ? 'Pareado & Ativo' : 'Aguardando Tablet') : 'Revogado'}
                </span>
              </td>
              <td>
                ${t.ativo ? `<button type="button" class="btn btn--danger btn--sm btn-revogar-totem" data-id="${t.id}">Revogar</button>` : '—'}
              </td>
            </tr>
          `;
          }).join('');

          tbodyTotens.querySelectorAll('.btn-revogar-totem').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              const ok = await admin.confirm({
                title: 'Revogar Totem?',
                msg: 'Deseja revogar o acesso deste Totem? O tablet será desativado imediatamente.',
                okLabel: 'Revogar'
              });
              if (!ok) return;
              const { error: revErr } = await window.cafeteriaSupabase
                .from('totens')
                .update({ ativo: false, updated_at: new Date().toISOString() })
                .eq('id', id);
              if (!revErr) {
                admin.toast('Revogado', 'Acesso do totem revogado com sucesso.', 'info');
                carregarTotens();
              }
            });
          });
        } catch (err) {
          tbodyTotens.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-sec);">Execute a migration CAF-000040 para gerenciar totens.</td></tr>';
        }
      }
      carregarTotens();

      btnGerarTotem?.addEventListener('click', async () => {
        const nome = await admin.prompt({
          title: 'Parear Novo Totem',
          msg: 'Informe o nome deste Totem / Tablet (ex: Totem Balcão 01):',
          defaultValue: 'Totem Balcão 01',
          options: ['Totem Balcão 01', 'Totem Entrada 01', 'Totem Foyer Teatro']
        });
        if (!nome) return;
        const codigo = String(Math.floor(100000 + Math.random() * 900000));
        try {
          const { error } = await window.cafeteriaSupabase
            .from('totens')
            .insert([{
              nome: nome.trim(),
              codigo_pareamento: codigo,
              modo_operacao: 'pagamento',
              ativo: true
            }]);
          if (error) throw error;
          if (boxCodigoTotem) {
            boxCodigoTotem.style.display = 'block';
            boxCodigoTotem.innerHTML = `
              <strong>✅ Código de Pareamento Gerado: <span style="font-size:1.3rem; letter-spacing:2px;">${codigo}</span></strong><br>
              Abra <code>${window.location.origin}/totem.html</code> no tablet do balcão e digite este código para parear o dispositivo.
            `;
          }
          carregarTotens();
        } catch (err) {
          console.error('Erro ao criar totem:', err);
          admin.toast('Erro', 'Não foi possível gerar o código do totem.', 'error');
        }
      });
    }
  });

})();
