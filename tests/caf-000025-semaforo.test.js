import { describe, it, expect } from 'vitest';
import { calcularSemaforo } from '../js/utils/kds-regras.js';

/**
 * CAF-000025 — Tempo alvo de preparo e semáforo no KDS
 */
describe('CAF-000025 — Tempo alvo e semáforo', () => {
  it('CA01: calcula semáforo verde para pedido recente dentro de 70% do tempo alvo', () => {
    const agora = 1700000000000;
    const createdAt = agora - (3 * 60 * 1000); // 3 min atrás
    const semaforo = calcularSemaforo(createdAt, 10, { agora });
    expect(semaforo.cor).toBe('verde');
    expect(semaforo.atrasado).toBe(false);
  });

  it('CA02: calcula semáforo amarelo quando tempo está entre 70% e 100% do alvo', () => {
    const agora = 1700000000000;
    const createdAt = agora - (8 * 60 * 1000); // 8 min atrás (alvo 10)
    const semaforo = calcularSemaforo(createdAt, 10, { agora });
    expect(semaforo.cor).toBe('amarelo');
    expect(semaforo.atrasado).toBe(false);
  });

  it('CA03: calcula semáforo vermelho quando tempo ultrapassa 100% do tempo alvo', () => {
    const agora = 1700000000000;
    const createdAt = agora - (12 * 60 * 1000); // 12 min atrás (alvo 10)
    const semaforo = calcularSemaforo(createdAt, 10, { agora });
    expect(semaforo.cor).toBe('vermelho');
    expect(semaforo.atrasado).toBe(true);
  });

  it('CA04: compensa desvio de relógio entre cliente e servidor', () => {
    const agora = 1700000000000;
    const createdAt = agora - (4 * 60 * 1000); // 4 min
    const desvioRelogioMs = 2 * 60 * 1000; // relógio adiantado 2 min
    const semaforo = calcularSemaforo(createdAt, 5, { agora, desvioRelogioMs });
    expect(semaforo.cor).toBe('verde');
  });
});
