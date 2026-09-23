import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { priveStrategy } from './prive';

/**
 * Prueba de contrato contra la tienda real de Prive Perfumes.
 *
 * No corre por defecto: golpea infraestructura de terceros. Se ejecuta a mano
 * cuando se sospecha que Prive cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/prive.live.test.ts
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

describe.skipIf(!enabled)('prive contra la tienda real', () => {
  test('perfumeria arabe: pagina, descarta los padres agrupadores y saca el tamaño', async () => {
    const result = await priveStrategy.run(
      context({ syncCategories: true }, 3, 'https://priveperfumes.com/collections/perfumeria-arabe'),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(200);
    expect(result.categories).toEqual([
      expect.objectContaining({ external_id: 'perfumeria-arabe', name: 'Perfumería Árabe' }),
    ]);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    let withMl = 0;
    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/priveperfumes\.com\/products\/[a-z0-9%-]+$/i);
      expect(product.price).not.toBeNull();
      expect(product.raw).toBeUndefined();
      expect(product.tags).not.toContain('combined_listing');
      if (product.unit_amount) withMl += 1;
    }
    // Medido 2026-09-22: casi todo es un frasco suelto con los ml en el nombre.
    expect(withMl / result.products.length).toBeGreaterThan(0.7);
  }, 90_000);

  test('la tienda sigue usando Combined Listings', async () => {
    const http = createHttpClient({ delayMs: 400 });
    const page = await http.getJson<{ products: Array<{ tags: string[] }> }>(
      'https://priveperfumes.com/collections/all/products.json?limit=250&page=1',
    );
    expect(page.products).toHaveLength(250);
    expect(page.products.some((p) => p.tags.includes('combined_listing'))).toBe(true);
  }, 60_000);
});
