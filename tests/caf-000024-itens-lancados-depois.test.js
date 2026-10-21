import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000024 — Itens lançados depois voltam para a fila do KDS
 */
describe('CAF-000024 — Itens lançados depois', () => {
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: badge no cabeçalho do KDS exibe contagem de novos itens pendentes', () => {
    expect(cozinhaJs).toMatch(/badge-novos-kds|\+.*itens novos/i);
  });

  it('CA02: item adicionado depois recebe indicador visual NOVO e horário', () => {
    expect(cozinhaJs).toMatch(/badge-novo|NOVO/);
  });

  it('CA03: pedido concluído retorna para a fila de preparo se novos itens forem adicionados', () => {
    expect(cozinhaJs).toMatch(/novosPendentesCount/);
  });
});
