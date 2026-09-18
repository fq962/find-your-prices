import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { metromediaStrategy } from './metromedia';

/**
 * Prueba de contrato contra el sitio real de Metromedia.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia.
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/metromedia.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('metromedia contra el sitio real', () => {
  test('Comics: excluye lo que ya esta en raices previas y atribuye la raiz', async () => {
    const http = createHttpClient({ delayMs: 300, timeoutMs: 60_000 });
    const started = Date.now();
    const result = await metromediaStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 30, kind: 'category', url: 'https://metromedia.hn/en_US/shop/category/comics-37' } as never,
      config: {},
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    const seconds = (Date.now() - started) / 1000;

    expect(result.errors ?? []).toHaveLength(0);
    // 404 en la categoria menos ~10 que ya estan en raices previas.
    expect(result.products.length).toBeGreaterThan(300);
    expect(result.stats).toMatchObject({ root: 'Comics', rank: 6 });
    // 1 (arbol) + 6 raices previas de una pagina + Comics.
    expect(result.pagesFetched).toBe(8);
    expect(seconds).toBeLessThan(120);
    expect(result.categories?.some((c) => c.external_id === '135')).toBe(false);
    expect(result.categories?.some((c) => c.external_parent_id === '84')).toBe(true);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/metromedia\.hn\/en_US\/shop\/product\/[^/?]+-\d+$/);
      expect(product.url.endsWith(`-${product.external_id}`)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
      expect(product.category_path).toEqual(['Comics']);
      expect(product.primary_image_url).toMatch(/^https:\/\/metromedia\.hn\/web\/image\/product\.template\/\d+\/image$/);
    }
  }, 180_000);

  test('la url canonica y la imagen responden', async () => {
    const http = createHttpClient({ delayMs: 300, timeoutMs: 60_000 });
    const result = await metromediaStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category', url: 'https://metromedia.hn/en_US/shop/category/agendas-107' } as never,
      config: { pageSize: 20 },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    const product = result.products[0];
    expect(product).toBeDefined();
    const page = await http.getText(product.url);
    expect(page).toContain(`/web/image/product.template/${product.external_id}/image`);
    const image = await fetch(product.primary_image_url as string, { method: 'HEAD' });
    expect(image.status).toBe(200);
  }, 60_000);
});
