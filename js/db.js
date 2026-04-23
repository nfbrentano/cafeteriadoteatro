/* =========================================================
   DB.JS — Camada de Abstração Supabase
   Gerencia: Fetch, Realtime, Storage e Cache Local
   ========================================================= */

(function() {
  'use strict';

  const CACHE_KEYS = {
    CARDAPIO: 'cafeteria_cardapio_cache',
    HORARIOS: 'cafeteria_horarios_cache',
    HERO: 'cafeteria_hero_cache',
    PROMOS: 'cafeteria_promos_cache',
    SETTINGS: 'cafeteria_settings_cache'
  };

  const db = {
    // --- Utilitários de Cache ---
    cache: {
      get: (key) => JSON.parse(localStorage.getItem(key)),
      set: (key, val) => localStorage.setItem(key, JSON.stringify(val))
    },

    // --- Categorias ---
    categories: {
      async all() {
        const { data, error } = await window.cafeteriaSupabase
          .from('categorias')
          .select('*')
          .order('ordem', { ascending: true });
        if (error) throw error;
        return data;
      },
      async upsert(category) {
        const { error } = await window.cafeteriaSupabase
          .from('categorias')
          .upsert(category);
        if (error) throw error;
      },
      async delete(id) {
        const { error } = await window.cafeteriaSupabase
          .from('categorias')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
    },

    // --- Produtos ---
    products: {
      async all() {
        const { data, error } = await window.cafeteriaSupabase
          .from('produtos')
          .select('*')
          .order('ordem', { ascending: true });
        if (error) throw error;
        return data;
      },
      async upsert(product, imageBlob = null) {
        if (imageBlob) {
          const fileName = `${product.id}.webp`;
          const { data: uploadData, error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('products')
            .upload(fileName, imageBlob, { upsert: true, contentType: 'image/webp' });
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('products')
            .getPublicUrl(fileName);
          
          product.imagem_url = publicUrl + '?t=' + Date.now();
        }

        const { error } = await window.cafeteriaSupabase
          .from('produtos')
          .upsert(product);
        if (error) throw error;
      },
      async delete(id) {
        const { error } = await window.cafeteriaSupabase
          .from('produtos')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
    },

    // --- Hero Home ---
    hero: {
      async get() {
        // Tenta retornar cache imediatamente
        const cached = db.cache.get(CACHE_KEYS.HERO);
        
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
            return null;
          });

        // Se tem cache, retorna ele. Se não, espera o fetch.
        return cached || await fetchPromise;
      },
      async update(imageBlob = null, alt = '', blurDataUrl = null) {
        let imageUrl = null;
        if (imageBlob) {
          const fileName = `hero-home.webp`;
          const { error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: 'image/webp' });
          
          if (uploadError) {
            console.error('Supabase Storage Error (Hero):', uploadError);
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
          console.error('Supabase Table Error (hero_home):', error);
          throw new Error(`Erro ao salvar dados do Hero: ${error.message}`);
        }
      }
    },

    // --- Horários ---
    hours: {
      async get() {
        const { data, error } = await window.cafeteriaSupabase
          .from('business_hours')
          .select('*')
          .eq('id', 1)
          .limit(1);
        if (error) throw error;
        return (data && data.length > 0) ? data[0] : null;
      },
      async update(data) {
        const payload = { ...data, id: 1, updated_at: new Date().toISOString() };
        const { error } = await window.cafeteriaSupabase
          .from('business_hours')
          .upsert(payload);
        if (error) throw error;
      }
    },

    // --- Promoções ---
    promotions: {
      async all() {
        const { data, error } = await window.cafeteriaSupabase
          .from('promotions')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        return data;
      },
      async upsert(promo, imageBlob = null) {
        if (imageBlob) {
          const fileName = `banner-${Date.now()}.webp`;
          const { error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: 'image/webp' });
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('site-assets')
            .getPublicUrl(fileName);
          
          promo.image_url = publicUrl;
        }

        const { error } = await window.cafeteriaSupabase
          .from('promotions')
          .upsert(promo);
        if (error) throw error;
      },
      async delete(id) {
        const { error } = await window.cafeteriaSupabase
          .from('promotions')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
    },

    // --- Settings / Textos ---
    settings: {
      async all() {
        // Cache imediato
        const cached = db.cache.get(CACHE_KEYS.SETTINGS);

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
            return null;
          });

        return cached || await fetchPromise;
      },
      async update(key, value) {
        const { error } = await window.cafeteriaSupabase
          .from('site_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    },
    
    // --- Assets / Storage ---
    assets: {
      async upload(fileName, blob, bucket = 'site-assets') {
        const { error } = await window.cafeteriaSupabase
          .storage
          .from(bucket)
          .upload(fileName, blob, { upsert: true, contentType: 'image/webp' });
        
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

  window.cafeteriaDB = db;
  console.log('CafeteriaDB inicializado com sucesso. Módulos:', Object.keys(db));
})();
