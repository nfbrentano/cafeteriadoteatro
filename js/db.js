/* =========================================================
   DB.JS — Camada de Abstração Supabase
   Gerencia: Fetch, Realtime, Storage e Cache Local
   ========================================================= */

(function() {
  'use strict';

  window.escapeHtml = function(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

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
              sobre_imagem_url: String(val.sobre_imagem_url || ''),
              whatsapp_ativo: val.whatsapp_ativo !== undefined ? String(val.whatsapp_ativo) : 'true',
              whatsapp_numero: String(val.whatsapp_numero || '')
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
      },
      async upsertAdicionaisVinculos(produtoId, vinculos) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        // Remove antigos
        await window.cafeteriaSupabase.from('adicional_vinculos').delete().eq('produto_id', produtoId);
        // Insere novos se houver
        if (vinculos && vinculos.length > 0) {
          const { error } = await window.cafeteriaSupabase.from('adicional_vinculos').insert(vinculos);
          if (error) {
            db.logger.error('products.upsertAdicionaisVinculos', error);
            throw error;
          }
        }
      }
    },

    // --- Adicionais ---
    adicionais: {
      async all() {
        if (!window.cafeteriaSupabase) {
          db.logger.warn('adicionais.all', 'Supabase client não inicializado');
          return [];
        }
        const { data, error } = await window.cafeteriaSupabase
          .from('adicionais')
          .select('*')
          .order('ordem', { ascending: true });
        if (error) {
          db.logger.error('adicionais.all', error);
          throw error;
        }
        return data || [];
      },
      async vinculos() {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('adicional_vinculos')
          .select('*');
        if (error) {
          db.logger.error('adicionais.vinculos', error);
          throw error;
        }
        return data || [];
      },
      async upsert(adicional) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('adicionais')
          .upsert(adicional);
        if (error) {
          db.logger.error('adicionais.upsert', error);
          throw error;
        }
      },
      async delete(id) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('adicionais')
          .delete()
          .eq('id', id);
        if (error) {
          db.logger.error('adicionais.delete', error);
          throw error;
        }
      },
      async upsertVinculos(adicionalId, vinculos) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        // Remove antigos
        await window.cafeteriaSupabase.from('adicional_vinculos').delete().eq('adicional_id', adicionalId);
        // Insere novos se houver
        if (vinculos && vinculos.length > 0) {
          const { error } = await window.cafeteriaSupabase.from('adicional_vinculos').insert(vinculos);
          if (error) {
            db.logger.error('adicionais.upsertVinculos', error);
            throw error;
          }
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

    // --- Promoções do Cardápio ---
    promocoesCardapio: {
      async all() {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('promocoes')
          .select('*, promocao_itens(*)')
          .eq('ativo', true)
          .order('ordem', { ascending: true });
        if (error) {
          db.logger.error('promocoesCardapio.all', error);
          throw error;
        }
        return data || [];
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

    // --- Estoque e Controle de Insumos (CAF-000031) ---
    estoque: {
      async allItens() {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('estoque_itens')
          .select('*')
          .order('nome', { ascending: true });
        if (error) {
          db.logger.error('estoque.allItens', error);
          throw error;
        }
        return data || [];
      },
      async getItem(id) {
        if (!window.cafeteriaSupabase) return null;
        const { data, error } = await window.cafeteriaSupabase
          .from('estoque_itens')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) {
          db.logger.error('estoque.getItem', error);
          throw error;
        }
        return data;
      },
      async upsertItem(item) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { data, error } = await window.cafeteriaSupabase
          .from('estoque_itens')
          .upsert(item)
          .select()
          .single();
        if (error) {
          db.logger.error('estoque.upsertItem', error);
          throw error;
        }
        return data;
      },
      async deleteItem(id) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { error } = await window.cafeteriaSupabase
          .from('estoque_itens')
          .delete()
          .eq('id', id);
        if (error) {
          db.logger.error('estoque.deleteItem', error);
          throw error;
        }
      },
      async getMovimentos(filtro = {}) {
        if (!window.cafeteriaSupabase) return [];
        let query = window.cafeteriaSupabase
          .from('estoque_movimentos')
          .select(`
            *,
            estoque_itens:item_id (
              nome,
              unidade_medida,
              codigo_barras
            )
          `)
          .order('created_at', { ascending: false });

        if (filtro.item_id) {
          query = query.eq('item_id', filtro.item_id);
        }
        if (filtro.tipo) {
          query = query.eq('tipo', filtro.tipo);
        }
        if (filtro.data_inicio) {
          query = query.gte('created_at', filtro.data_inicio);
        }
        if (filtro.data_fim) {
          query = query.lte('created_at', filtro.data_fim);
        }
        if (filtro.limite) {
          query = query.limit(filtro.limite);
        }

        const { data, error } = await query;
        if (error) {
          db.logger.error('estoque.getMovimentos', error);
          throw error;
        }
        return data || [];
      },
      async criarMovimento(movimento) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        const { data, error } = await window.cafeteriaSupabase
          .from('estoque_movimentos')
          .insert(movimento)
          .select()
          .single();
        if (error) {
          db.logger.error('estoque.criarMovimento', error);
          throw error;
        }
        return data;
      }
    },

    // --- Fichas Técnicas (CAF-000032) ---
    fichasTecnicas: {
      async all() {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('fichas_tecnicas')
          .select(`
            *,
            estoque_itens:estoque_item_id (
              id,
              nome,
              unidade_medida,
              custo_unitario_medio
            )
          `);
        if (error) {
          db.logger.error('fichasTecnicas.all', error);
          throw error;
        }
        return data || [];
      },
      async getByProduto(produtoId) {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('fichas_tecnicas')
          .select(`
            *,
            estoque_itens:estoque_item_id (
              id,
              nome,
              unidade_medida,
              custo_unitario_medio
            )
          `)
          .eq('produto_id', produtoId);
        if (error) {
          db.logger.error('fichasTecnicas.getByProduto', error);
          throw error;
        }
        return data || [];
      },
      async getByAdicional(adicionalId) {
        if (!window.cafeteriaSupabase) return [];
        const { data, error } = await window.cafeteriaSupabase
          .from('fichas_tecnicas')
          .select(`
            *,
            estoque_itens:estoque_item_id (
              id,
              nome,
              unidade_medida,
              custo_unitario_medio
            )
          `)
          .eq('adicional_id', adicionalId);
        if (error) {
          db.logger.error('fichasTecnicas.getByAdicional', error);
          throw error;
        }
        return data || [];
      },
      async saveFichaProduto(produtoId, itens = []) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        
        // 1. Remove itens anteriores
        const { error: delError } = await window.cafeteriaSupabase
          .from('fichas_tecnicas')
          .delete()
          .eq('produto_id', produtoId);
        if (delError) {
          db.logger.error('fichasTecnicas.saveFichaProduto.delete', delError);
          throw delError;
        }

        // 2. Insere novos itens da receita
        if (itens && itens.length > 0) {
          const rows = itens.map(i => ({
            produto_id: produtoId,
            estoque_item_id: parseInt(i.estoque_item_id, 10),
            quantidade: parseFloat(i.quantidade)
          }));
          const { error: insError } = await window.cafeteriaSupabase
            .from('fichas_tecnicas')
            .insert(rows);
          if (insError) {
            db.logger.error('fichasTecnicas.saveFichaProduto.insert', insError);
            throw insError;
          }
        }
      },
      async saveFichaAdicional(adicionalId, itens = []) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase client indisponível');
        
        const { error: delError } = await window.cafeteriaSupabase
          .from('fichas_tecnicas')
          .delete()
          .eq('adicional_id', adicionalId);
        if (delError) {
          db.logger.error('fichasTecnicas.saveFichaAdicional.delete', delError);
          throw delError;
        }

        if (itens && itens.length > 0) {
          const rows = itens.map(i => ({
            adicional_id: adicionalId,
            estoque_item_id: parseInt(i.estoque_item_id, 10),
            quantidade: parseFloat(i.quantidade)
          }));
          const { error: insError } = await window.cafeteriaSupabase
            .from('fichas_tecnicas')
            .insert(rows);
          if (insError) {
            db.logger.error('fichasTecnicas.saveFichaAdicional.insert', insError);
            throw insError;
          }
        }
      }
    },

    // --- Cadastro de Clientes ---
    clientes: {
      /** Busca rápida de clientes para o PDV (<300ms) */
      async buscar(termo, limite = 8) {
        if (!window.cafeteriaSupabase) return [];
        if (!termo || termo.trim().length < 2) return [];

        try {
          const { data, error } = await window.cafeteriaSupabase
            .rpc('buscar_clientes_pdv', {
              p_termo: termo.trim(),
              p_limite: limite
            });

          if (!error && Array.isArray(data)) {
            return data;
          }
        } catch (rpcErr) {
          console.warn('[DB] buscar_clientes_pdv falhou, usando fallback direto:', rpcErr);
        }

        // Fallback direto via Supabase se RPC indisponível
        try {
          const digits = termo.replace(/\D/g, '');
          let query = window.cafeteriaSupabase
            .from('clientes')
            .select('id, nome, telefone, aceita_contato')
            .eq('ativo', true)
            .eq('anonimizado', false);

          if (digits.length >= 3) {
            query = query.or(`nome.ilike.%${termo.trim()}%,telefone.like.%${digits}%`);
          } else {
            query = query.ilike('nome', `%${termo.trim()}%`);
          }

          const { data, error } = await query.order('nome', { ascending: true }).limit(limite);
          if (error) throw error;
          return data || [];
        } catch (err) {
          db.logger.error('clientes.buscar', err);
          return [];
        }
      },

      /** Lista todos os clientes para o Admin */
      async all(filtros = {}) {
        if (!window.cafeteriaSupabase) return [];
        try {
          let query = window.cafeteriaSupabase
            .from('clientes')
            .select('*');

          if (filtros.apenasAtivos !== false) {
            query = query.eq('ativo', true);
          }
          if (filtros.apenasAceitaContato) {
            query = query.eq('aceita_contato', true);
          }
          if (filtros.termo && filtros.termo.trim()) {
            const t = filtros.termo.trim();
            const digits = t.replace(/\D/g, '');
            if (digits.length >= 3) {
              query = query.or(`nome.ilike.%${t}%,telefone.like.%${digits}%,email.ilike.%${t}%`);
            } else {
              query = query.or(`nome.ilike.%${t}%,email.ilike.%${t}%`);
            }
          }

          const { data, error } = await query.order('nome', { ascending: true });
          if (error) throw error;
          return data || [];
        } catch (err) {
          db.logger.error('clientes.all', err);
          return [];
        }
      },

      /** Retorna cliente por ID */
      async getById(id) {
        if (!window.cafeteriaSupabase) return null;
        try {
          const { data, error } = await window.cafeteriaSupabase
            .from('clientes')
            .select('*')
            .eq('id', id)
            .single();
          if (error) throw error;
          return data;
        } catch (err) {
          db.logger.error('clientes.getById', err);
          return null;
        }
      },

      /** Obtém ficha completa com métricas de consumo e histórico */
      async getFicha(id) {
        if (!window.cafeteriaSupabase) return null;
        try {
          const { data, error } = await window.cafeteriaSupabase
            .rpc('obter_ficha_cliente', { p_cliente_id: id });
          if (error) throw error;
          return data;
        } catch (err) {
          db.logger.error('clientes.getFicha', err);
          throw err;
        }
      },

      /** Cria um novo cliente */
      async create(dados) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase indisponível');
        try {
          const row = {
            nome: dados.nome.trim(),
            telefone: dados.telefone ? dados.telefone.trim() : null,
            email: dados.email ? dados.email.trim() : null,
            data_nascimento: dados.data_nascimento || null,
            observacoes: dados.observacoes ? dados.observacoes.trim() : null,
            aceita_contato: Boolean(dados.aceita_contato),
            ativo: dados.ativo !== false
          };

          const { data, error } = await window.cafeteriaSupabase
            .from('clientes')
            .insert([row])
            .select()
            .single();

          if (error) throw error;
          return data;
        } catch (err) {
          db.logger.error('clientes.create', err);
          throw err;
        }
      },

      /** Atualiza cliente existente */
      async update(id, dados) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase indisponível');
        try {
          const row = {
            nome: dados.nome.trim(),
            telefone: dados.telefone ? dados.telefone.trim() : null,
            email: dados.email ? dados.email.trim() : null,
            data_nascimento: dados.data_nascimento || null,
            observacoes: dados.observacoes ? dados.observacoes.trim() : null,
            aceita_contato: Boolean(dados.aceita_contato),
            updated_at: new Date().toISOString()
          };
          if (dados.ativo !== undefined) row.ativo = Boolean(dados.ativo);

          const { data, error } = await window.cafeteriaSupabase
            .from('clientes')
            .update(row)
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          return data;
        } catch (err) {
          db.logger.error('clientes.update', err);
          throw err;
        }
      },

      /** Mescla dois clientes duplicados */
      async mesclar(origemId, destinoId) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase indisponível');
        try {
          const { data, error } = await window.cafeteriaSupabase
            .rpc('mesclar_clientes', {
              p_cliente_origem_id: origemId,
              p_cliente_destino_id: destinoId
            });
          if (error) throw error;
          return data;
        } catch (err) {
          db.logger.error('clientes.mesclar', err);
          throw err;
        }
      },

      /** Anonimiza dados do cliente conforme LGPD */
      async anonimizar(id) {
        if (!window.cafeteriaSupabase) throw new Error('Supabase indisponível');
        try {
          const { data, error } = await window.cafeteriaSupabase
            .rpc('anonimizar_cliente', { p_cliente_id: id });
          if (error) throw error;
          return data;
        } catch (err) {
          db.logger.error('clientes.anonimizar', err);
          throw err;
        }
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
