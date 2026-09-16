import { beforeEach, describe, expect, test, vi } from 'vitest';

// El paquete real lanza en jsdom; la frontera la hace cumplir `next build`.
vi.mock('server-only', () => import('@/test/server-only-stub'));

const state = vi.hoisted(() => ({
  rows: [] as Array<{ name: string | null }>,
  error: null as { message: string } | null,
  calls: 0,
}));

vi.mock('@/server/db/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: async () => {
        state.calls += 1;
        return { data: state.rows, error: state.error };
      },
    }),
  }),
}));

const {
  excludeBlockedStores,
  getBlockedStoreNames,
  isBlockedStoreName,
  resetBlockedStoreNamesCache,
} = await import('./blockedStores');

beforeEach(() => {
  state.rows = [{ name: 'Diunsa' }, { name: 'ÚTILES DE HONDURAS' }, { name: 'Larach y Cia' }];
  state.error = null;
  state.calls = 0;
  resetBlockedStoreNamesCache();
});

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

describe('getBlockedStoreNames', () => {
  test('devuelve el nombre exacto tal cual está en `stores`', async () => {
    await expect(getBlockedStoreNames()).resolves.toEqual(['ÚTILES DE HONDURAS']);
  });

  test('sólo consulta una vez por proceso', async () => {
    await getBlockedStoreNames();
    await getBlockedStoreNames();
    expect(state.calls).toBe(1);
  });

  test('si la lectura falla no memoiza el fallo ni rompe el catálogo', async () => {
    state.error = { message: 'boom' };
    await expect(getBlockedStoreNames()).resolves.toEqual([]);

    state.error = null;
    await expect(getBlockedStoreNames()).resolves.toEqual(['ÚTILES DE HONDURAS']);
  });
});

describe('excludeBlockedStores', () => {
  /** Un builder que sólo anota los filtros que le piden. */
  function spyRequest() {
    const calls: Array<[string, string, string]> = [];
    const request = {
      calls,
      not(column: string, operator: string, value: string) {
        calls.push([column, operator, value]);
        return this;
      },
    };
    return request;
  }

  test('filtra por igualdad exacta, no con un `ilike` que no usa índice', async () => {
    const request = spyRequest();
    excludeBlockedStores(request, await getBlockedStoreNames());

    expect(request.calls).toEqual([['store_name', 'in', '("ÚTILES DE HONDURAS")']]);
  });

  test('sin tiendas bloqueadas en la base, la consulta queda intacta', async () => {
    state.rows = [{ name: 'Diunsa' }];
    const request = spyRequest();

    excludeBlockedStores(request, await getBlockedStoreNames());

    expect(request.calls).toEqual([]);
  });

  /**
   * Regresión: la primera versión era `async` y devolvía el builder envuelto en
   * una promesa. Como el builder de supabase-js tiene `then`, esperarlo no
   * devolvía el builder: lanzaba la consulta a medio armar. Devolver algo con
   * `then` desde acá vuelve a romperlo, así que se comprueba que no lo hace.
   */
  test('devuelve el builder, no una promesa que lo ejecutaría', async () => {
    const result = excludeBlockedStores(spyRequest(), await getBlockedStoreNames());

    expect(typeof (result as { then?: unknown }).then).toBe('undefined');
  });
});
