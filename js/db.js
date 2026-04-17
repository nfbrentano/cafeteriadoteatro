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
        // Se houver blob de imagem, faz o upload no Storage primeiro
        if (imageBlob) {
          const fileName = `produtos/${product.id}.webp`;
          const { data: uploadData, error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('cafeteria-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: 'image/webp' });
          
          if (uploadError) throw uploadError;
          
          // Obter URL pública
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('cafeteria-assets')
            .getPublicUrl(fileName);
          
          product.imagem_url = publicUrl + '?t=' + Date.now(); // Cache busting
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
        const { data, error } = await window.cafeteriaSupabase
          .from('hero_home')
          .select('*')
          .eq('id', 1)
          .limit(1); // Standard select instead of single() to avoid console noise (406)
        if (error) throw error;
        return (data && data.length > 0) ? data[0] : null;
      },
      async update(imageBlob = null, alt = '') {
        let imageUrl = null;
        if (imageBlob) {
          const fileName = `hero/home.webp`;
          const { error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('cafeteria-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: 'image/webp' });
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('cafeteria-assets')
            .getPublicUrl(fileName);
          
          imageUrl = publicUrl + '?t=' + Date.now();
        }

        const payload = { id: 1, image_alt: alt, updated_at: new Date().toISOString() };
        if (imageUrl) payload.image_url = imageUrl;

        const { error } = await window.cafeteriaSupabase
          .from('hero_home')
          .upsert(payload);
        if (error) throw error;
      }
    },

    // --- Horários ---
    hours: {
      async get() {
        const { data, error } = await window.cafeteriaSupabase
          .from('business_hours')
          .select('*')
          .eq('id', 1)
          .limit(1); // Standard select instead of single() to avoid console noise (406)
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
          const fileName = `banners/${Date.now()}.webp`;
          const { error: uploadError } = await window.cafeteriaSupabase
            .storage
            .from('cafeteria-assets')
            .upload(fileName, imageBlob, { upsert: true, contentType: 'image/webp' });
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = window.cafeteriaSupabase
            .storage
            .from('cafeteria-assets')
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
        const { data, error } = await window.cafeteriaSupabase
          .from('site_settings')
          .select('*');
        if (error) throw error;
        return data.reduce((acc, curr) => {
          acc[curr.key] = curr.value;
          return acc;
        }, {});
      },
      async update(key, value) {
        const { error } = await window.cafeteriaSupabase
          .from('site_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    },

    // --- Realtime Subscription ---
    subscribeToChanges(onUpdate) {
      return window.cafeteriaSupabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          console.log('Realtime update received:', payload);
          onUpdate(payload);
        })
        .subscribe();
    }
  };

  window.cafeteriaDB = db;
})();
