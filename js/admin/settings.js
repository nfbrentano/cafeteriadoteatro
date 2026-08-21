/* =========================================================
   ADMIN/SETTINGS.JS — Hero, Horários, Promoções e Textos
   ========================================================= */

(function () {
  'use strict';

  const admin = window.cafeteriaAdmin;

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
      livePreviewBg.style.backgroundImage = "url('assets/images/hero-bg.png')";
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
          <button class="btn btn--icon" onclick="window.deletePromo('${p.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');
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
      galeria_subtitulo: document.getElementById('c-galeria-subtitulo').value
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
  });

})();
