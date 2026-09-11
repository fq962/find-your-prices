import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { comisariatoStrategy } from './comisariato';

/**
 * Prueba de contrato contra la API real de Comisariato Los Andes.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que el sitio cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/comisariato.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('comisariato contra la API real', () => {
  test('trae categorias y un lote de productos', async () => {
    const http = createHttpClient({ delayMs: 300 });

    const result = await comisariatoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 2, kind: 'full_catalog' } as never,
      config: { pageSize: 300 },
      http,
      signal: new AbortController().signal,
      log: (level, message) => console.log(`[${level}]`, message),
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.categories?.length ?? 0).toBeGreaterThan(0);
    expect(result.categories?.some((c) => c.name === 'PANADERIA Y REPOSTERIA')).toBe(true);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/comisariatolosandes\.com\//);
      expect(product.availability).not.toBe('unknown');
      if (product.list_price !== null && product.list_price !== undefined) {
        expect(product.list_price).toBeGreaterThan(product.price!);
      }
    }

    console.log('products', result.products.length, 'categories', result.categories?.length);
    console.log('sample', JSON.stringify(result.products[0], null, 2));
  }, 60_000);
});
