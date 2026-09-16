import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { pcbuildsStrategy } from './pcbuilds';

/**
 * Prueba de contrato contra el sitio real de PC Builds Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que la tienda cambio la plantilla:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/pcbuilds.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('pcbuilds contra el sitio real', () => {
  test('barre la rama Refrigeracion y atribuye la subcategoria', async () => {
    const http = createHttpClient({ delayMs: 500 });
    const result = await pcbuildsStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 40, kind: 'category', url: 'https://www.pcbuildshonduras.com/shop/category/refrigeracion-80' } as never,
      config: {},
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(40);
    expect(result.categories?.some((c) => c.external_id === '80')).toBe(true);
    expect(result.categories?.some((c) => c.external_parent_id === '35')).toBe(true);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.pcbuildshonduras\.com\/shop\/[^/]+-\d+$/);
      expect(product.url.endsWith(`-${product.external_id}`)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
      expect(product.category_path?.[0]).toBe('Refrigeración');
      expect(product.primary_image_url).toMatch(/^https:\/\/www\.pcbuildshonduras\.com\/web\/image\//);
      expect(product.primary_image_url).not.toContain('unique=');
    }
    // La mayoria cuelga de una subcategoria, no de la raiz.
    const specific = result.products.filter((p) => (p.category_path?.length ?? 0) >= 2).length;
    expect(specific).toBeGreaterThan(result.products.length / 2);
  }, 120_000);

  test('la url canonica y la imagen responden 200', async () => {
    const http = createHttpClient({ delayMs: 500 });
    const result = await pcbuildsStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category', url: 'https://www.pcbuildshonduras.com/shop/category/monitores-16' } as never,
      config: {},
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
