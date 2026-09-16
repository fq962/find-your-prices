import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { paizStrategy } from './paiz';

/**
 * Prueba de contrato contra la Catalog System API real de Paiz Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros. Se ejecuta a mano
 * cuando se sospecha que Paiz cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/paiz.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

function context(config: Record<string, unknown>, maxPages: number, url: string | null = null) {
  return {
    store: { default_currency: 'HNL' } as never,
    target: { max_pages: maxPages, kind: 'category', url } as never,
    config,
    http: createHttpClient({ delayMs: 400 }),
    signal: new AbortController().signal,
    log: () => {},
  };
}

describe.skipIf(!enabled)('paiz contra la Catalog System API real', () => {
  test('pagina la url con tilde del menu, mapea sin raw y arma la jerarquia', async () => {
    const result = await paizStrategy.run(
      context({ syncCategories: true }, 3, 'https://www.paiz.com.hn/l%C3%A1cteos/queso/queso-crema'),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.stats?.categoryPath).toBe('lacteos/queso/queso-crema');
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.categories?.length).toBeGreaterThan(0);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.paiz\.com\.hn\/.+\/p$/);
      expect(product.price).not.toBeNull();
      expect(product.availability).not.toBe('unknown');
      expect(product.raw).toBeUndefined();
      expect(product.price_valid_until).toBeUndefined();
    }
  }, 90_000);

  test('la ventana de paginacion sigue siendo de 50 y el desplazamiento tope 2500', async () => {
    const http = createHttpClient({ delayMs: 400 });
    const base = 'https://www.paiz.com.hn/api/catalog_system/pub/products/search/abarrotes';

    const ventana = await http.getJson<unknown[]>(`${base}?_from=0&_to=49&O=OrderByNameASC`);
    expect(ventana).toHaveLength(50);

    await expect(http.getJson(`${base}?_from=0&_to=50`, { retries: 0 })).rejects.toThrow();
    await expect(http.getJson(`${base}?_from=2550&_to=2599`, { retries: 0 })).rejects.toThrow();
  }, 60_000);
});
