import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { radioshackStrategy } from './radioshack';

/**
 * Prueba de contrato contra el GraphQL real de RadioShack Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia (durante el desarrollo de esta
 * estrategia, la propia investigacion disparo un bloqueo temporal del WAF de
 * Grupo Unicomer por exceso de requests seguidos: usa un delay generoso). Se
 * ejecuta a mano cuando se sospecha que RadioShack cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/radioshack.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('radioshack contra el GraphQL real', () => {
  test('pagina una categoria, mapea y arma la jerarquia de categorias', async () => {
    const http = createHttpClient({ delayMs: 800 });

    const result = await radioshackStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 3, kind: 'category' } as never,
      config: { categoryUrlPath: 'c/audio/audifonos', syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(20);
    expect(result.products.length).toBe(result.totalReported);
    expect(result.categories?.length).toBeGreaterThan(0);

    // El external_id (sku) tiene que ser unico o el upsert por lote se rompe.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.radioshackla\.com\/honduras\//);
      expect(product.price).not.toBeNull();
      expect(product.availability).not.toBe('unknown');
    }
  }, 60_000);
});
