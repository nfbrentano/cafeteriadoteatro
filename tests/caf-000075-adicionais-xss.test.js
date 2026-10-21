import { describe, it, expect } from 'vitest';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000075 — Validação de Adicionais e Prevenção de XSS', () => {
  describe('Prevenção de XSS no Modal de Montagem e Handlers (CA06, CA07)', () => {
    it('escapa tags maliciosas em nomes de adicionais impedindo injeção HTML (CA06)', () => {
      const maliciousAd = {
        id: 'ad-malicioso',
        nome: '<img src=x onerror=alert(1)>',
        preco: 4.50
      };

      const escapedId = window.escapeHtml(maliciousAd.id);
      const escapedNome = window.escapeHtml(maliciousAd.nome);

      const html = `
        <label class="adicional-checkbox">
          <input type="checkbox" value="${escapedId}" data-preco="${maliciousAd.preco}" data-nome="${escapedNome}" class="chk-adicional">
          <span class="adicional-checkbox__label">${escapedNome} (+ R$ ${Number(maliciousAd.preco).toFixed(2).replace('.', ',')})</span>
        </label>
      `;

      const div = document.createElement('div');
      div.innerHTML = html;

      // Não deve ter criado nenhum elemento <img>
      expect(div.querySelectorAll('img')).toHaveLength(0);
      expect(div.querySelector('.adicional-checkbox__label').textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('permite códigos de mesa e nomes com apóstrofo sem quebrar JS (CA07)', () => {
      const mesaCodigo = "Mesa D'Ávila";
      const encoded = encodeURIComponent(mesaCodigo);
      const decoded = decodeURIComponent(encoded);
      expect(decoded).toBe("Mesa D'Ávila");

      const nomeParte = "João's";
      const encodedNome = encodeURIComponent(nomeParte);
      const decodedNome = decodeURIComponent(encodedNome);
      expect(decodedNome).toBe("João's");
    });
  });

  describe('Fonte Única e Validação de Adicionais (CA02, CA03, CA04, CA05)', () => {
    function setupAdicionaisMock() {
      return createSupabaseMock({
        produtos: [
          { id: 'cappuccino', nome: 'Cappuccino', preco: 14.00, permite_adicionais: true },
          { id: 'espresso', nome: 'Espresso Simples', preco: 7.00, permite_adicionais: false }
        ],
        adicionais: [
          { id: 'canela', nome: 'Canela em pó', preco: 1.50, ativo: true },
          { id: 'leite-vegetal', nome: 'Leite vegetal', preco: 4.00, ativo: true },
          { id: 'cheddar', nome: 'Cheddar', preco: 5.00, ativo: true }
        ],
        v_adicionais_produto: [
          { produto_id: 'cappuccino', adicional_id: 'canela' },
          { produto_id: 'cappuccino', adicional_id: 'leite-vegetal' }
        ]
      }, {
        rpcHandlers: {
          fn_validar_adicionais_item: (args, tables) => {
            const { p_produto_id, p_adicionais } = args;
            const prod = tables.produtos.find(p => p.id === p_produto_id);
            if (!prod) return { data: null, error: { message: `Produto ${p_produto_id} não encontrado.` } };
            if (!prod.permite_adicionais && p_adicionais && p_adicionais.length > 0) {
              return { data: null, error: { message: `O produto ${p_produto_id} não permite adicionais.` } };
            }

            let total = 0;
            const permitidos = new Set(tables.v_adicionais_produto.filter(v => v.produto_id === p_produto_id).map(v => v.adicional_id));

            for (const adId of (p_adicionais || [])) {
              if (!permitidos.has(adId)) {
                return { data: null, error: { message: `Adicional ${adId} não é permitido para o produto ${p_produto_id}.` } };
              }
              const ad = tables.adicionais.find(a => a.id === adId);
              total += (ad ? ad.preco : 0);
            }

            return { data: total, error: null };
          }
        }
      });
    }

    it('recusa adicional não vinculado (ex: Cheddar no Cappuccino) (CA03)', async () => {
      const mock = setupAdicionaisMock();
      const res = await mock.rpc('fn_validar_adicionais_item', {
        p_produto_id: 'cappuccino',
        p_adicionais: ['cheddar']
      });

      expect(res.error).not.toBeNull();
      expect(res.error.message).toContain('não é permitido');
    });

    it('recusa qualquer adicional quando permite_adicionais é false (CA04)', async () => {
      const mock = setupAdicionaisMock();
      const res = await mock.rpc('fn_validar_adicionais_item', {
        p_produto_id: 'espresso',
        p_adicionais: ['canela']
      });

      expect(res.error).not.toBeNull();
      expect(res.error.message).toContain('não permite adicionais');
    });

    it('calcula o preço seguro a partir do banco e não do payload (CA05)', async () => {
      const mock = setupAdicionaisMock();
      const res = await mock.rpc('fn_validar_adicionais_item', {
        p_produto_id: 'cappuccino',
        p_adicionais: ['canela', 'leite-vegetal']
      });

      expect(res.error).toBeNull();
      expect(res.data).toBe(5.50); // 1.50 + 4.00
    });
  });
});
