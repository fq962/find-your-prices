import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { jetstereoStrategy } from './jetstereo';

/**
 * Prueba de contrato contra el motor de busqueda real de Jetstereo.
 *
 * No corre por defecto: golpea infraestructura de terceros (Elastic App
 * Search) y fallaria en CI cada vez que el catalogo o el indice tengan un mal
 * dia. Se ejecuta a mano cuando se sospecha que Jetstereo cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/jetstereo.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('jetstereo contra el motor de busqueda real', () => {
  test('pagina una categoria, mapea y arma la jerarquia de categorias', async () => {
    const http = createHttpClient({ delayMs: 200 });

    const result = await jetstereoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category' } as never,
      config: { mainCategory: 'Audio', includeOutOfStock: true, syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(50);
    expect(result.products.length).toBe(result.totalReported);
    expect(result.categories?.length).toBeGreaterThan(0);

    // El external_id tiene que ser unico o el upsert por lote se rompe.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.jetstereo\.com\//);
      expect(product.price).not.toBeNull();
      expect(product.availability).not.toBe('unknown');
    }
  }, 60_000);

  test('el catalogo completo excluye las paginas de marca/SEO del indice', async () => {
    const http = createHttpClient({ delayMs: 200 });

    const result = await jetstereoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 1, kind: 'full_catalog' } as never,
      config: { pageSize: 200, syncCategories: false },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products).toHaveLength(200);
    // Las paginas de marca/SEO no traen sku: si se colaran, esto fallaria.
    for (const product of result.products) {
      expect(product.sku).toBeTruthy();
    }
  }, 60_000);
});
