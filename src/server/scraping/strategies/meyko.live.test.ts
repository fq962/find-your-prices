import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { meykoStrategy } from './meyko';

/**
 * Prueba de contrato contra el sitio real de Meyko.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia.
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/meyko.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('meyko contra el sitio real', () => {
  test('barre la rama Cuidado en casa y atribuye la subcategoria', async () => {
    const http = createHttpClient({ delayMs: 500 });
    const result = await meykoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 20, kind: 'category', url: 'https://meyko.com/shop/category/cuidado-en-casa-338' } as never,
      config: {},
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(80);
    expect(result.categories?.some((c) => c.external_id === '338')).toBe(true);
    expect(result.categories?.some((c) => c.external_parent_id === '338')).toBe(true);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/meyko\.com\/shop\/[^/?]+-\d+$/);
      expect(product.url.endsWith(`-${product.external_id}`)).toBe(true);
      if (product.price !== null) expect(product.price).toBeGreaterThan(0);
      expect(product.category_path?.[0]).toBe('Cuidado en casa');
      expect(product.primary_image_url).toMatch(/^https:\/\/meyko\.com\/web\/image\/product\.template\/\d+\/image_1024\//);
      expect(product.primary_image_url).not.toContain('unique=');
    }
    const specific = result.products.filter((p) => (p.category_path?.length ?? 0) >= 2).length;
    expect(specific).toBeGreaterThan(result.products.length / 2);
  }, 120_000);

  test('la url canonica y la imagen grande responden', async () => {
    const http = createHttpClient({ delayMs: 500 });
    const result = await meykoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category', url: 'https://meyko.com/shop/category/diabetes-330' } as never,
      config: { pageSize: 20 },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    const product = result.products[0];
    expect(product).toBeDefined();
    const page = await http.getText(product.url);
    expect(page).toContain(`data-product-template-id="${product.external_id}"`);
    const image = await http.getText(product.primary_image_url as string);
    expect(image.length).toBeGreaterThan(1000);
  }, 60_000);
});
