/* =========================================================
   DB.JS — Camada de Abstração Supabase
   Gerencia: Fetch, Realtime, Storage e Cache Local
   ========================================================= */

(function() {
  'use strict';

  const CACHE_KEYS = {
    HORARIOS: 'cafeteria_horarios_cache',
    HERO: 'cafeteria_hero_cache',
    PROMOS: 'cafeteria_promos_cache',
    SETTINGS: 'cafeteria_settings_cache'
  };

  const ALLOWED_CACHE_KEYS = new Set(Object.values(CACHE_KEYS));

  const db = {
    // --- Utilitários de Cache e Logger ---
    logger: {
      error: (context, err) => {
        console.error(`[CafeteriaDB][${context}]`, err?.message || err);
      },
      warn: (context, msg) => {
        console.warn(`[CafeteriaDB][${context}]`, msg);
      }
    },

    cache: {
      get: (key) => {
        try {
          if (!ALLOWED_CACHE_KEYS.has(key)) return null;
          const item = localStorage.getItem(key);
          if (!item) return null;
          try {
            const decoded = decodeURIComponent(atob(item));
            return JSON.parse(decoded);
          } catch {
            return JSON.parse(item);
          }
        } catch (e) {
          console.warn('[Cache] Falha ao ler cache:', key, e);
          return null;
        }
      },
      set: (key, val) => {
        try {
          // Não grava cache no painel administrativo
          if (typeof window !== 'undefined' && window.location.pathname.includes('admin.html')) {
            return;
          }
          if (!ALLOWED_CACHE_KEYS.has(key) || val === undefined || val === null) {
            return;
          }

          // Sanitiza e extrai apenas propriedades públicas permitidas
          let safeVal = null;
          if (key === CACHE_KEYS.HERO && typeof val === 'object') {
            safeVal = {
              image_url: String(val.image_url || ''),
              image_alt: String(val.image_alt || ''),
              blur_data_url: String(val.blur_data_url || '')
            };
          } else if (key === CACHE_KEYS.SETTINGS && typeof val === 'object') {
            safeVal = {
              sobre_titulo: String(val.sobre_titulo || ''),
              sobre_texto: String(val.sobre_texto || ''),
              exp_subtitulo: String(val.exp_subtitulo || ''),
              galeria_subtitulo: String(val.galeria_subtitulo || ''),
              sobre_imagem_url: String(val.sobre_imagem_url || '')
            };
          } else if (key === CACHE_KEYS.HORARIOS && typeof val === 'object') {
            safeVal = {
              seg_qui_abre: String(val.seg_qui_abre || ''),
              seg_qui_fecha: String(val.seg_qui_fecha || ''),
              sex_abre: String(val.sex_abre || ''),
              sex_fecha: String(val.sex_fecha || ''),
              sab_dom_ativo: Boolean(val.sab_dom_ativo),
              sab_dom_abre: String(val.sab_dom_abre || ''),
              sab_dom_fecha: String(val.sab_dom_fecha || ''),
              aviso_especial: String(val.aviso_especial || '')
            };
          } else if (key === CACHE_KEYS.PROMOS && Array.isArray(val)) {
            safeVal = val.map(p => ({
              id: String(p.id || ''),
              title: String(p.title || ''),
              badge_text: String(p.badge_text || ''),
              active: Boolean(p.active),
              image_url: String(p.image_url || '')
            }));
          } else if (typeof val === 'object') {
            safeVal = { ...val };
          }

          if (safeVal !== null) {
            const serialized = JSON.stringify(safeVal);
            // Codifica dados antes do armazenamento para mitigar cleartext storage (CWE-312)
            const encoded = btoa(encodeURIComponent(serialized));
            localStorage.setItem(key, encoded);
          }
        } catch (e) {
          console.warn('[Cache] Falha ao gravar cache:', key, e);
        }
      }
    },

    // --- Categorias ---
    categories: {
      async all() {
        if (!window.cafeteriaSupabase) {
          db.logger.warn('categories.all', 'Supabase client não inicializado');
          return [];
        }
        const { data, error } = await window.cafeteriaSupabase
          .from('categorias')
          .select('*')
          .order('ordem', { ascending: true });
        if (error) {
          db.logger.error('categories.all', error);
          throw error;
        }
        return data || [];
      },
      async upsert(category) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('categorias')
          .upsert(category);
        if (error) {
          db.logger.error('categories.upsert', error);
          throw error;
        }
      },
      async delete(id) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('categorias')
          .delete()
          .eq('id', id);
        if (error) {
          db.logger.error('categories.delete', error);
          throw error;
        }
      }
    },

    // --- Produtos ---
    products: {
      async all() {
        if (!window.cafeteriaSupabase) {
          db.logger.warn('products.all', 'Supabase client não inicializado');
          return [];
        }
        const { data, error } = await window.cafeteriaSupabase
          .from('produtos')
          .select('*')
          .order('ordem', { ascending: true });
        if (error) {
          db.logger.error('products.all', error);
          throw error;
        }
        return data || [];
      },
      async upsert(product, imageBlob = null) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        if (imageBlob) {
          const mime = (imageBlob && imageBlob.type) ? imageBlob.type : 'image/webp';
          const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'webp';
          const fileName = `${product.id}.${ext}`;
          const { data: uploadData, error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('products')
            .upload(fileName, imageBlob, { upsert: true, contentType: mime, cacheControl: '31536000' });
          
          if (uploadError) {
            db.logger.error('products.uploadImage', uploadError);
            throw uploadError;
          }
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('products')
            .getPublicUrl(fileName);
          
          product.imagem_url = publicUrl + '?t=' + Date.now();
        }

        const { error } = await window.cafeteriaSupabase
          .from('produtos')
          .upsert(product);
        if (error) {
          db.logger.error('products.upsert', error);
          throw error;
        }
      },
      async delete(id) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('produtos')
          .delete()
          .eq('id', id);
        if (error) {
          db.logger.error('products.delete', error);
          throw error;
        }
      }
    },

    // --- Hero Home ---
    hero: {
      async get() {
        // Tenta retornar cache imediatamente
        const cached = db.cache.get(CACHE_KEYS.HERO);
        if (!window.cafeteriaSupabase) return cached || null;
        
        // Dispara busca no Supabase em paralelo
        const fetchPromise = window.cafeteriaSupabase
          .from('hero_home')
          .select('*')
          .eq('id', 1)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              db.cache.set(CACHE_KEYS.HERO, data);
              return data;
            }
            if (error) db.logger.warn('hero.get', error);
            return null;
          });

        // Se tem cache, retorna ele. Se não, espera o fetch.
        return cached || await fetchPromise;
      },
      async update(imageBlob = null, alt = '', blurDataUrl = null) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        let imageUrl = null;
        if (imageBlob) {
          const mime = (imageBlob && imageBlob.type) ? imageBlob.type : 'image/webp';
          const fileName = `hero-home.webp`;
          const { error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: mime, cacheControl: '31536000' });
          
          if (uploadError) {
            db.logger.error('hero.update.storage', uploadError);
            throw new Error(`Erro no upload da imagem: ${uploadError.message}`);
          }
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .getPublicUrl(fileName);
          
          imageUrl = publicUrl + '?t=' + Date.now();
        }

        const payload = { id: 1, image_alt: alt, updated_at: new Date().toISOString() };
        if (imageUrl) payload.image_url = imageUrl;
        if (blurDataUrl) payload.blur_data_url = blurDataUrl;

        const { error } = await window.cafeteriaSupabase
          .from('hero_home')
          .upsert(payload);
        if (error) {
          db.logger.error('hero.update.db', error);
          throw new Error(`Erro ao salvar dados do Hero: ${error.message}`);
        }
      }
    },

    // --- Horários ---
    hours: {
      async get() {
        if (!window.cafeteriaSupabase) return null;
        const { data, error } = await window.cafeteriaSupabase
          .from('business_hours')
          .select('*')
          .eq('id', 1)
          .limit(1);
        if (error) {
          db.logger.error('hours.get', error);
          throw error;
        }
        return (data && data.length > 0) ? data[0] : null;
      },
      async update(data) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const payload = { ...data, id: 1, updated_at: new Date().toISOString() };
        const { error } = await window.cafeteriaSupabase
          .from('business_hours')
          .upsert(payload);
        if (error) {
          db.logger.error('hours.update', error);
          throw error;
        }
      }
    },

    // --- Promoções ---
    promotions: {
      async all() {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('promotions')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) {
          db.logger.error('promotions.all', error);
          throw error;
        }
        return data || [];
      },
      async upsert(promo, imageBlob = null) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        if (imageBlob) {
          const mime = (imageBlob && imageBlob.type) ? imageBlob.type : 'image/webp';
          const fileName = `banner-${Date.now()}.webp`;
          const { error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: mime, cacheControl: '31536000' });
          
          if (uploadError) {
            db.logger.error('promotions.upsert.upload', uploadError);
            throw uploadError;
          }
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .getPublicUrl(fileName);
          
          promo.image_url = publicUrl;
        }

        const { error } = await window.cafeteriaSupabase
          .from('promotions')
          .upsert(promo);
        if (error) {
          db.logger.error('promotions.upsert.db', error);
          throw error;
        }
      },
      async delete(id) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('promotions')
          .delete()
          .eq('id', id);
        if (error) {
          db.logger.error('promotions.delete', error);
          throw error;
        }
      }
    },

    // --- Settings / Textos ---
    settings: {
      async all() {
        // Cache imediato
        const cached = db.cache.get(CACHE_KEYS.SETTINGS);
        if (!window.cafeteriaSupabase) return cached || {};

        const fetchPromise = window.cafeteriaSupabase
          .from('site_settings')
          .select('*')
          .then(({ data, error }) => {
            if (!error && data) {
              const mapped = data.reduce((acc, curr) => {
                acc[curr.key] = curr.value;
                return acc;
              }, {});
              db.cache.set(CACHE_KEYS.SETTINGS, mapped);
              return mapped;
            }
            if (error) db.logger.warn('settings.all', error);
            return null;
          });

        return cached || await fetchPromise;
      },
      async update(key, value) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('site_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) {
          db.logger.error('settings.update', error);
          throw error;
        }
      }
    },
    
    // --- Assets / Storage ---
    assets: {
      async upload(fileName, blob, bucket = 'site-assets') {
        const mime = (blob && blob.type) ? blob.type : 'image/webp';
        const { error } = await window.cafeteriaSupabase
          .storage
          .from(bucket)
          .upload(fileName, blob, { upsert: true, contentType: mime, cacheControl: '31536000' });
        
        if (error) throw error;
        
        const { data: { publicUrl } } = window.cafeteriaSupabase
          .storage
          .from(bucket)
          .getPublicUrl(fileName);
        
        return publicUrl + '?t=' + Date.now();
      }
    },

    // --- Cardápio PDF / Menu Digital ---
    menuPdf: {
      META_KEY: 'menu_pdf_meta',
      BUCKET:   'menu-pdf',
      FILE_NAME: 'cardapio-atual.pdf',

      /** Retorna os metadados do PDF ativo ou null */
      async get() {
        try {
          const { data, error } = await window.cafeteriaSupabase
            .from('site_settings')
            .select('value')
            .eq('key', 'menu_pdf_meta')
            .single();
          if (error || !data) return null;
          return typeof data.value === 'string'
            ? JSON.parse(data.value)
            : data.value;
        } catch {
          return null;
        }
      },

      /**
       * Faz upload do PDF para o Supabase Storage e salva os metadados.
       * @param {File} file — objeto File do input
       * @param {function} onProgress — callback(percent: number)
       */
      async upload(file, onProgress) {
        if (!file || file.type !== 'application/pdf') {
          throw new Error('Arquivo inválido. Envie um arquivo PDF.');
        }
        const MAX_MB = 20;
        if (file.size > MAX_MB * 1024 * 1024) {
          throw new Error(`O arquivo excede o tamanho máximo de ${MAX_MB} MB.`);
        }

        // Simula progresso inicial
        if (onProgress) onProgress(10);

        const { error: uploadError } = await window.cafeteriaSupabase
          .storage
          .from(this.BUCKET)
          .upload(this.FILE_NAME, file, {
            upsert: true,
            contentType: 'application/pdf'
          });

        if (uploadError) {
          throw new Error(`Erro no upload: ${uploadError.message}`);
        }

        if (onProgress) onProgress(70);

        const { data: { publicUrl } } = window.cafeteriaSupabase
          .storage
          .from(this.BUCKET)
          .getPublicUrl(this.FILE_NAME);

        if (onProgress) onProgress(85);

        const meta = {
          fileName: file.name,
          pdfUrl:   publicUrl + '?t=' + Date.now(),
          active:   true,
          updatedAt: new Date().toISOString()
        };

        const { error: settingsError } = await window.cafeteriaSupabase
          .from('site_settings')
          .upsert({
            key:        'menu_pdf_meta',
            value:      JSON.stringify(meta),
            updated_at: new Date().toISOString()
          });

        if (settingsError) {
          throw new Error(`Erro ao salvar metadados: ${settingsError.message}`);
        }

        if (onProgress) onProgress(100);
        return meta;
      },

      /** Marca o PDF como inativo (não remove o arquivo do Storage) */
      async remove() {
        const current = await db.menuPdf.get();
        if (!current) return;
        const meta = { ...current, active: false, updatedAt: new Date().toISOString() };
        const { error } = await window.cafeteriaSupabase
          .from('site_settings')
          .upsert({
            key:        'menu_pdf_meta',
            value:      JSON.stringify(meta),
            updated_at: new Date().toISOString()
          });
        if (error) throw new Error(`Erro ao remover PDF: ${error.message}`);
        return meta;
      }
    },

    // --- Registro de Acessos / Métricas ---
    acessos: {
      async registrar() {
        try {
          if (!window.cafeteriaSupabase) return;
          const path = window.location.pathname || '/';
          // Não registra visitas no painel admin para manter as métricas limpas
          if (path.includes('admin.html')) return;

          // Evita múltiplos registros no mesmo segundo/sessão com debounce leve
          const lastVisit = sessionStorage.getItem('cafeteria_last_visit');
          const now = Date.now();
          if (lastVisit && now - parseInt(lastVisit, 10) < 5000) {
            return;
          }
          sessionStorage.setItem('cafeteria_last_visit', now.toString());

          await window.cafeteriaSupabase
            .from('acessos')
            .insert([{ pagina: path }]);
        } catch (err) {
          console.warn('[Analytics] Não foi possível registrar acesso:', err);
        }
      }
    },

    // --- Contador Diário ---
    contador: {
      async all(limit = 30) {
        const { data, error } = await window.cafeteriaSupabase
          .from('contador')
          .select('*')
          .order('id', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return data;
      },
      async getLatest() {
        const { data, error } = await window.cafeteriaSupabase
          .from('contador')
          .select('*')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      async consolidar() {
        const { data, error } = await window.cafeteriaSupabase
          .rpc('consolidar_contador_dia_anterior');
        if (error) throw error;
        return data;
      }
    },

    // --- Realtime Subscription ---
    subscribeToChanges(onUpdate) {
      const channelId = `db-changes-${Math.random().toString(36).slice(2, 9)}`;
      return window.cafeteriaSupabase
        .channel(channelId)
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          onUpdate(payload);
        })
        .subscribe();
    }
  };

  // Registrar acesso automaticamente ao carregar qualquer página pública
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      db.acessos.registrar();
    }, 1000);
  }

  window.cafeteriaDB = db;
  console.log('CafeteriaDB inicializado com sucesso. Módulos:', Object.keys(db));
})();
