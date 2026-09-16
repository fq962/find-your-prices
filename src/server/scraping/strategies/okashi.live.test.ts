import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { okashiStrategy } from './okashi';

/**
 * Prueba de contrato contra la tienda real de Okashi HN.
 *
 * No corre por defecto: golpea infraestructura de terceros. Se ejecuta a mano
 * cuando se sospecha que Okashi cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/okashi.live.test.ts
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

describe.skipIf(!enabled)('okashi contra la tienda real', () => {
  test('figuras: pagina, mapea sin raw y saca el JAN de la ficha', async () => {
    const result = await okashiStrategy.run(
      context({ syncCategories: true }, 2, 'https://okashihn.com/collections/figura'),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(100);
    expect(result.categories).toEqual([expect.objectContaining({ external_id: 'figura', name: 'Figuras' })]);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    let withBarcode = 0;
    for (const product of result.products) {
      // Handles ascii o con caracteres codificados (%E2%85%B1), como enlaza el tema.
      expect(product.url).toMatch(/^https:\/\/okashihn\.com\/products\/[a-z0-9%-]+$/i);
      expect(product.price).not.toBeNull();
      expect(product.raw).toBeUndefined();
      expect(product.store_category_external_id).toBe('figura');
      if (product.barcode_raw) withBarcode += 1;
    }
    // Medido 2026-09-16: la gran mayoria de las figuras publica el JAN.
    expect(withBarcode / result.products.length).toBeGreaterThan(0.7);
  }, 90_000);

  test('el catalogo completo sigue cabiendo en 250 por pagina y "all" trae manga con ISBN', async () => {
    const http = createHttpClient({ delayMs: 400 });
    const page = await http.getJson<{ products: Array<{ body_html: string }> }>(
      'https://okashihn.com/collections/all/products.json?limit=250&page=1',
    );
    expect(page.products).toHaveLength(250);
    const withIsbn = page.products.filter((p) => /ISBN/i.test(p.body_html)).length;
    expect(withIsbn).toBeGreaterThan(150);
  }, 60_000);
});
