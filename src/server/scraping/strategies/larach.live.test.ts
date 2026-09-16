import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { larachStrategy } from './larach';

/**
 * Prueba de contrato contra la API real de Larach y Cia.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que Larach cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/larach.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('larach contra la API real', () => {
  test('barre el departamento Mascotas completo y arma su rama del arbol', async () => {
    const http = createHttpClient({ delayMs: 500 });

    const result = await larachStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 5, kind: 'category' } as never,
      config: { category: '12', pageSize: 100, syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(50);
    expect(result.products.length).toBe(result.totalReported);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    // El departamento se deriva del parent y sus hijas cuelgan de el.
    expect(result.categories?.some((c) => c.external_id === '12' && c.external_parent_id === null)).toBe(true);
    expect(result.categories?.some((c) => c.external_parent_id === '12')).toBe(true);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/larachycia\.com\/p\/[A-Za-z0-9_-]+\/\d+$/);
      expect(product.external_id).toMatch(/^\d+$/);
      expect(product.price).toBeGreaterThan(0);
      expect(product.category_path?.[0]).toBe('Mascotas');
      if (product.list_price !== null && product.list_price !== undefined) {
        expect(product.list_price).toBeGreaterThan(product.price!);
      }
      if (product.primary_image_url) {
        expect(product.primary_image_url).toMatch(/^https:\/\/media\.larachycia\.com\//);
      }
    }
  }, 120_000);

  test('la url publica construida y la imagen responden 200', async () => {
    const http = createHttpClient({ delayMs: 500 });
    const result = await larachStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 1, kind: 'category' } as never,
      config: { category: '12', pageSize: 3, syncCategories: false },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    const product = result.products[0];
    expect(product).toBeDefined();

    const html = await http.getText(product.url);
    expect(html).toContain(product.name);
    if (product.primary_image_url) {
      await expect(http.getText(product.primary_image_url)).resolves.toBeDefined();
    }
  }, 60_000);
});
