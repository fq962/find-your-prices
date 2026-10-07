import { describe, expect, test, vi } from 'vitest';
import type { NormalizedProduct } from './types';

/**
 * Ingesta por lotes ante el `statement_timeout` de Supabase: el lote que se
 * pasa de tiempo se parte a la mitad y se reintenta; cualquier otro error, o
 * un lote ya minimo, sigue fallando como antes.
 */

const rpc = vi.fn();
vi.mock('server-only', () => import('@/test/server-only-stub'));
vi.mock('@/server/db/supabase', () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { ingestProducts } from './repository';

const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ external_id: String(i) }) as unknown as NormalizedProduct);

const ok = (items: unknown[]) => ({
  data: { items_found: items.length, items_new: items.length, items_updated: 0, items_unchanged: 0, price_changes: 0 },
  error: null,
});
const timeout = { data: null, error: { message: 'canceling statement due to statement timeout' } };

describe('ingestProducts', () => {
  test('un lote que excede el timeout se parte y se ingiere completo', async () => {
    rpc.mockReset();
    // El primer lote de 250 se pasa de tiempo; sus dos mitades entran.
    rpc.mockImplementationOnce(async () => timeout);
    rpc.mockImplementation(async (_fn: string, args: { p_items: unknown[] }) => ok(args.p_items));
    const splits: string[] = [];

    const totals = await ingestProducts('store', 'run', products(300), (m) => splits.push(m));

    expect(totals.items_found).toBe(300);
    expect(rpc.mock.calls.map(([, args]) => args.p_items.length)).toEqual([250, 125, 125, 50]);
    expect(splits).toHaveLength(1);
  });

  test('otros errores no se reintentan', async () => {
    rpc.mockReset();
    rpc.mockImplementation(async () => ({ data: null, error: { message: 'permission denied' } }));

    await expect(ingestProducts('store', 'run', products(40))).rejects.toThrow('permission denied');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test('si ni el lote minimo entra, falla en vez de partir para siempre', async () => {
    rpc.mockReset();
    rpc.mockImplementation(async () => timeout);

    await expect(ingestProducts('store', 'run', products(20))).rejects.toThrow('statement timeout');
    // 20 -> 10 + (10 ya es minimo y falla)
    expect(rpc.mock.calls.map(([, args]) => args.p_items.length)).toEqual([20, 10]);
  });
});
