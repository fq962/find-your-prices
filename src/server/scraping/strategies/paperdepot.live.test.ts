import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { paperdepotStrategy } from './paperdepot';

/**
 * Prueba de contrato contra el sitio real de Paper Depot.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia.
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/paperdepot.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

const context = (config: Record<string, unknown>, target: Record<string, unknown>) => ({
  store: { default_currency: 'HNL' } as never,
  target: target as never,
  config,
  http: createHttpClient({ delayMs: 150, timeoutMs: 60_000 }),
  signal: new AbortController().signal,
  log: () => {},
});

describe.skipIf(!enabled)('paperdepot contra el sitio real', () => {
  test('un grupo chico, sin leer ofertas', async () => {
    // 108 = Libros Contables, 3 articulos en una sola pagina.
    const result = await paperdepotStrategy.run(
      context({ groups: '108', offers: 'skip' }, { max_pages: 5, kind: 'category' }),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.length).toBeLessThan(20);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.paperdepothn\.com\/producto\/.+$/);
      expect(product.price).toBeGreaterThan(0);
      expect(product.tax_included).toBe(false);
      expect(product.tax_rate).toBe(15);
      expect(product.primary_image_url).toMatch(/\/media\/image\.php\?file=/);
      expect(product.store_category_external_id).toBe('108');
    }
  }, 120_000);

  test('las ofertas pisan el precio que publica el listado', async () => {
    // 178 = Cuadernos, donde vive 06050: el listado dice L. 164.28 y /ofertas
    // L. 89.68. Si esta prueba falla, estamos publicando precios inflados.
    const result = await paperdepotStrategy.run(
      context({ groups: '178' }, { max_pages: 200, kind: 'category' }),
    );

    expect(result.errors ?? []).toHaveLength(0);
    const rebajados = result.products.filter((p) => p.list_price !== null);
    expect(rebajados.length).toBeGreaterThan(0);

    for (const product of rebajados) {
      expect(product.list_price as number).toBeGreaterThan(product.price as number);
    }

    const cuaderno = result.products.find((p) => p.external_id === '06050');
    expect(cuaderno).toBeDefined();
    expect(cuaderno?.list_price).toBeGreaterThan(cuaderno?.price as number);
  }, 300_000);

  test('la url publica y la imagen responden 200', async () => {
    const ctx = context({ groups: '108', offers: 'skip' }, { max_pages: 5, kind: 'category' });
    const result = await paperdepotStrategy.run(ctx);
    const product = result.products[0];
    expect(product).toBeDefined();

    const page = await ctx.http.getText(product.url);
    expect(page).toContain(`Código: `);
    expect(page).toContain(product.external_id);

    const image = await fetch(product.primary_image_url as string);
    expect(image.status).toBe(200);
    // /thumbs.php devuelve html; /media/image.php es la que sirve la imagen.
    expect(image.headers.get('content-type') ?? '').toMatch(/^image\//);
  }, 120_000);

  test('el catalogo entero entra en el presupuesto del runner', async () => {
    const started = Date.now();
    const result = await paperdepotStrategy.run(context({}, { max_pages: 500, kind: 'full_catalog' }));
    const seconds = (Date.now() - started) / 1000;

    expect(result.errors ?? []).toHaveLength(0);
    expect(seconds).toBeLessThan(200);
    expect(result.products.length).toBeGreaterThan(5000);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    // Todo lo que sale de un grupo del menu queda clasificado; lo unico sin
    // categoria son los articulos que solo viven en /ofertas.
    const sinCategoria = result.products.filter((p) => !p.store_category_external_id);
    expect(sinCategoria.length).toBeLessThan(700);
    expect(sinCategoria.length).toBe(result.stats?.orphansPublished);
    expect(result.stats).toMatchObject({ groups: 63, wholeMenu: true });
  }, 300_000);

  test('la categoria mas chica entra en el presupuesto del runner', async () => {
    const started = Date.now();
    const result = await paperdepotStrategy.run(
      context({ categories: 'ELT' }, { max_pages: 200, kind: 'category' }),
    );
    const seconds = (Date.now() - started) / 1000;

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(200);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);
    // Todo articulo de un grupo del menu sale clasificado.
    expect(result.products.every((p) => p.store_category_external_id)).toBe(true);
    expect(result.categories?.some((c) => c.name === 'Electrónica')).toBe(true);
  }, 300_000);
});
