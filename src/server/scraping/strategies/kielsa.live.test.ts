// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { kielsaStrategy } from './kielsa';

/**
 * Prueba de contrato contra el DDP real de Kielsa.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia.
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/kielsa.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('kielsa contra el DDP real', () => {
  test('una suscripcion de 100 trae 100 articulos bien formados', async () => {
    const result = await kielsaStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 1, kind: 'full_catalog' } as never,
      config: { pageSize: 100 },
      http: {} as never,
      signal: new AbortController().signal,
      log: () => {},
    });

    // Con una sola suscripcion el barrido queda incompleto a proposito: el
    // runner no debe dar de baja nada, y eso se senala con un error no fatal.
    expect(result.products).toHaveLength(100);
    expect(result.stats?.complete).toBe(false);
    expect(result.errors?.some((e) => /Tope/.test(e.message))).toBe(true);

    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(100);
    for (const product of result.products) {
      expect(product.external_id).toMatch(/^[0-9A-Z]{6,}$/);
      expect(product.url).toMatch(/^https:\/\/kielsa\.com\/productDetail\/[A-Za-z0-9]{17}$/);
      expect(product.price).toBeGreaterThan(0);
      if (product.list_price != null) expect(product.list_price).toBeGreaterThan(product.price!);
      if (product.primary_image_url) expect(product.primary_image_url).toMatch(/^https:\/\//);
    }
    expect(result.categories?.length).toBeGreaterThan(3);
  }, 60_000);
});
