import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { officedepotStrategy } from './officedepot';

/**
 * Prueba de contrato contra la API real de Office Depot Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia.
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/officedepot.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

const context = (config: Record<string, unknown>, target: Record<string, unknown>) => ({
  store: { default_currency: 'HNL' } as never,
  target: target as never,
  config,
  http: createHttpClient({ delayMs: 250, timeoutMs: 60_000 }),
  signal: new AbortController().signal,
  log: () => {},
});

describe.skipIf(!enabled)('officedepot contra la API real', () => {
  test('una categoria chica trae articulos completos y clasificados', async () => {
    const result = await officedepotStrategy.run(
      context({ category: '02-03-08-0' }, { max_pages: 3, kind: 'category' }),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(10);
    expect(result.totalReported).toBe(result.products.length);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(
        /^https:\/\/www\.officedepot\.com\.hn\/officedepotHN\/en\/.+\/p\/\d+$/,
      );
      expect(product.url.endsWith(`/p/${product.external_id}`)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
      expect(product.currency).toBe('HNL');
      // list_price solo cuando la rebaja es real.
      if (product.list_price !== null && product.list_price !== undefined) {
        expect(product.list_price).toBeGreaterThan(product.price as number);
      }
      expect(product.primary_image_url).toMatch(/^https:\/\/www\.officedepot\.com\.hn\/medias\//);
      expect(product.store_category_external_id).toBe('02-03-08-0');
      expect(product.description ?? '').not.toContain('�');
    }

    // El arbol se publica con la rama entera de la categoria barrida.
    expect(result.categories?.some((c) => c.external_id === '02-03-08-0')).toBe(true);
    expect(result.categories?.some((c) => c.external_id === '02-0-0-0')).toBe(true);
  }, 120_000);

  test('la url publica y la imagen responden 200', async () => {
    const ctx = context({ category: '02-03-08-0' }, { max_pages: 1, kind: 'category' });
    const result = await officedepotStrategy.run(ctx);
    const product = result.products[0];
    expect(product).toBeDefined();

    const page = await ctx.http.getText(product.url);
    expect(page).toContain(`/p/${product.external_id}`);

    const image = await fetch(product.primary_image_url as string);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type') ?? '').toMatch(/^image\//);
  }, 120_000);

  test('el catalogo completo entra en el presupuesto del runner', async () => {
    const started = Date.now();
    const result = await officedepotStrategy.run(context({}, { max_pages: 80, kind: 'full_catalog' }));
    const seconds = (Date.now() - started) / 1000;

    expect(result.errors ?? []).toHaveLength(0);
    // El barrido tiene que traer exactamente lo que la tienda declara: con
    // `:relevance` en vez de `:name-asc` se perdian ~150 articulos.
    expect(result.products.length).toBe(result.totalReported);
    expect(result.products.length).toBeGreaterThan(3500);
    expect(seconds).toBeLessThan(200);

    const sinCategoria = result.products.filter((p) => !p.store_category_external_id);
    expect(sinCategoria.length).toBe(0);
  }, 300_000);
});
