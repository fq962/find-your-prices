import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { sterenStrategy } from './steren';

/**
 * Prueba de contrato contra el GraphQL real de Steren Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que Steren cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/steren.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('steren contra el GraphQL real', () => {
  test('pagina una categoria chica (OUTLET, category_id 191), mapea y arma la jerarquia', async () => {
    const http = createHttpClient({ delayMs: 500 });

    const result = await sterenStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category' } as never,
      config: { categoryId: '191', syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.length).toBe(result.totalReported);

    // El external_id (sku) tiene que ser unico o el upsert por lote se rompe.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.steren\.com\.hn\/.+\.html$/);
      expect(product.price).not.toBeNull();
      expect(product.availability).not.toBe('unknown');
    }
  }, 60_000);

  test('search vacio trae el catalogo completo (>1900 articulos, mas de una pagina a 300)', async () => {
    const http = createHttpClient({ delayMs: 500 });

    const result = await sterenStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 2, kind: 'full_catalog' } as never,
      config: { syncCategories: false },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.pagesFetched).toBe(2);
    expect(result.products.length).toBe(600);
    expect(result.totalReported).toBeGreaterThan(1900);
  }, 60_000);
});
