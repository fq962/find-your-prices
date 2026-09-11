import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { farmaciasimanStrategy } from './farmaciasiman';

/**
 * Prueba de contrato contra la API real de Farmacia Siman.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que Farmacia Siman cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/farmaciasiman.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('farmaciasiman contra la API real', () => {
  test('barre un puñado de terminos semilla y trae productos', async () => {
    const http = createHttpClient({ delayMs: 300 });

    const result = await farmaciasimanStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 30, kind: 'category' } as never,
      config: { seedTerms: ['acetaminofen', 'ibuprofeno', 'vitamina'] },
      http,
      signal: new AbortController().signal,
      log: (level, message) => console.log(`[${level}]`, message),
    });

    console.log('pagesFetched', result.pagesFetched);
    console.log('errors', JSON.stringify(result.errors, null, 2));
    console.log('products', result.products.length);
    console.log('stats', JSON.stringify(result.stats, null, 2));
    if (result.products[0]) console.log('sample', JSON.stringify(result.products[0], null, 2));

    expect(result.products.length).toBeGreaterThan(0);
  }, 120_000);
});
