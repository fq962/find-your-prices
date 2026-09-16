import { describe, expect, test, vi } from 'vitest';

// El paquete real lanza en jsdom; la frontera la hace cumplir `next build`.
vi.mock('server-only', () => import('@/test/server-only-stub'));

const { excludeBlockedStores, isBlockedStoreName } = await import('./blockedStores');

describe('isBlockedStoreName', () => {
  test('casa con cualquier combinación de mayúsculas y acentos', () => {
    for (const name of [
      'Útiles de Honduras',
      'ÚTILES DE HONDURAS',
      'UTILES DE HONDURAS',
      'Utiles de honduras',
      '  Útiles de Honduras  ',
    ]) {
      expect(isBlockedStoreName(name)).toBe(true);
    }
  });

  test('no toca a las demás tiendas', () => {
    for (const name of ['Diunsa', 'Larach y Cia', 'PriceSmart', 'Walmart', '', null, undefined]) {
      expect(isBlockedStoreName(name)).toBe(false);
    }
  });
});

describe('excludeBlockedStores', () => {
  test('agrega un not/ilike por patrón bloqueado', () => {
    const calls: Array<[string, string, string]> = [];
    const request = {
      not(column: string, operator: string, value: string) {
        calls.push([column, operator, value]);
        return this;
      },
    };

    excludeBlockedStores(request);

    expect(calls).toEqual([['store_name', 'ilike', '%tiles de honduras%']]);
  });
});
