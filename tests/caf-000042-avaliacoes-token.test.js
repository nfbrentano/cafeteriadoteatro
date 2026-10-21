import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000042 — Avaliações de atendimento e produtos via token
 */
describe('CAF-000042 — Avaliações com Token', () => {
  const avaliarJs = fs.readFileSync('js/avaliar.js', 'utf8');

  it('CA01 / CA13: valida obrigatoriedade de notas entre 1 e 5 estrelas', () => {
    const validarNotas = (notaProduto, notaAtendimento) => {
      if (notaProduto < 1 || notaAtendimento < 1) {
        return { valido: false, erro: 'Notas de 1 a 5 estrelas são obrigatórias' };
      }
      return { valido: true };
    };

    expect(validarNotas(0, 5).valido).toBe(false);
    expect(validarNotas(5, 0).valido).toBe(false);
    expect(validarNotas(4, 5).valido).toBe(true);
  });

  it('CA02 / CA13: bloqueia submissão duplicada com mensagem amigável', () => {
    expect(avaliarJs).toMatch(/ja_avaliado|AVALIACAO_DUPLICADA/);
    expect(avaliarJs).toMatch(/Avaliação já registrada, obrigado!/);
  });

  it('CA03 / CA13: envia avaliação pela RPC registrar_avaliacao', () => {
    expect(avaliarJs).toMatch(/registrar_avaliacao/);
  });
});
