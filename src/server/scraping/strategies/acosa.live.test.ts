import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { acosaStrategy } from './acosa';

/**
 * Prueba de contrato contra la Store API real de ACOSA.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que ACOSA cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/acosa.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('acosa contra la Store API real', () => {
  test('pagina una categoria, mapea y arma la jerarquia de categorias', async () => {
    const http = createHttpClient({ delayMs: 300 });

    const result = await acosaStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category' } as never,
      config: { categoryId: '16442', syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.categories?.length).toBeGreaterThan(0);

    // El external_id tiene que ser unico o el upsert por lote se rompe.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/acosa\.com\.hn\//);
      expect(product.price).not.toBeNull();
      expect(product.availability).not.toBe('unknown');
    }
  }, 60_000);
});
