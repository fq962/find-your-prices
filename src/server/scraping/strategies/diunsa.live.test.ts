import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { diunsaStrategy } from './diunsa';

/**
 * Prueba de contrato contra la API real de Diunsa.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que Diunsa cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/diunsa.live.test.ts
 *
 * Ultima corrida verificada: 858 articulos en Jugueteria, 266 categorias,
 * 100% con precio, 850/858 con codigo de barras, en ~2.3 s.
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('diunsa contra la API real', () => {
  test('pagina, mapea y devuelve la categoria completa', async () => {
    const http = createHttpClient({ delayMs: 200 });

    const result = await diunsaStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 5, kind: 'category' } as never,
      config: { groupCode: '258', pageSize: 500, syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(500);
    expect(result.products.length).toBe(result.totalReported);
    expect(result.categories?.length).toBeGreaterThan(100);

    // El external_id tiene que ser unico o el upsert por lote se rompe.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    // Los campos que sostienen el producto: sin precio ni url no sirve de nada.
    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.diunsa\.hn\//);
      expect(product.price).not.toBeNull();
    }
  }, 120_000);
});
