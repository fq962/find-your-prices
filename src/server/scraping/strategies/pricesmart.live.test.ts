import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { pricesmartStrategy } from './pricesmart';
import type { NormalizedProduct } from '../types';

/**
 * Prueba de contrato contra la API real de PriceSmart Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que PriceSmart cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/pricesmart.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

describe.skipIf(!enabled)('pricesmart contra la API real', () => {
  test('barre una categoria completa y arma el arbol', async () => {
    const http = createHttpClient({ delayMs: 500 });

    const result = await pricesmartStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 10, kind: 'category' } as never,
      config: { categoryCode: 'P10D51', syncCategories: true },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(20);
    // La cobertura tiene que ser total: si no, un full_catalog daria de baja
    // productos vivos.
    expect(result.products.length).toBe(result.totalReported);

    // external_id unico o el upsert por lote se rompe con ON CONFLICT.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    // El facet trae la categoria consultada y sus hijas.
    expect(result.categories?.some((c) => c.external_id === 'P10D51')).toBe(true);
    expect(result.categories?.some((c) => c.external_parent_id === 'P10D51')).toBe(true);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.pricesmart\.com\/es-hn\/producto\//);
      expect(product.external_id).toMatch(/^\d+$/);
      expect(product.price).toBeGreaterThan(0);
      expect(product.availability).not.toBe('unknown');
      // El precio de lista solo existe cuando hay rebaja real.
      if (product.list_price !== null && product.list_price !== undefined) {
        expect(product.list_price).toBeGreaterThan(product.price!);
      }
    }
  }, 120_000);

  test('la url publica construida responde 200', async () => {
    const http = createHttpClient({ delayMs: 500 });

    const result = await pricesmartStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 1, kind: 'category' } as never,
      config: { categoryCode: 'O10D25', syncCategories: false },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.products.length).toBeGreaterThan(0);

    // Tres al azar: si el patron de url se rompiera, cada ficha del catalogo
    // llevaria a un 404 sin que nada mas fallara.
    for (const product of result.products.slice(0, 3)) {
      const response = await fetch(product.url, {
        headers: { 'User-Agent': 'FindYourPricesBot/1.0 (+https://findyourprices.hn/bot)' },
      });
      expect(response.status, product.url).toBe(200);
    }
  }, 120_000);

  /**
   * La verificacion que el manual llama la mas importante, hecha sin base de
   * datos: si el hash de contenido cambiara entre dos corridas identicas, cada
   * corrida reescribiria el catalogo entero y llenaria price_history de basura.
   *
   * Reproduce el mismo calculo que `computeContentHash` del runner (que excluye
   * `raw`, justamente porque ahi es donde suelen vivir los campos volatiles).
   * Comprobado sobre el catalogo completo el 2026-09-10: 2763 articulos en
   * ambos barridos, 0 hashes distintos.
   */
  test('dos barridos seguidos dan el mismo hash de contenido', async () => {
    const contentHash = (product: NormalizedProduct) => {
      const content: Partial<NormalizedProduct> = { ...product };
      delete content.raw;
      delete content.content_hash;
      return createHash('sha1')
        .update(JSON.stringify(content, Object.keys(content).sort()))
        .digest('hex');
    };

    const sweep = async () => {
      const result = await pricesmartStrategy.run({
        store: { default_currency: 'HNL' } as never,
        target: { max_pages: 2, kind: 'category' } as never,
        config: { categoryCode: 'P10D51', syncCategories: false },
        http: createHttpClient({ delayMs: 500 }),
        signal: new AbortController().signal,
        log: () => {},
      });
      return new Map(result.products.map((p) => [p.external_id, contentHash(p)]));
    };

    const first = await sweep();
    const second = await sweep();

    expect(first.size).toBeGreaterThan(0);
    // Un alta o baja real entre los dos barridos no es un fallo; un hash
    // distinto para el mismo articulo si lo es.
    const changed = [...first].filter(([id, hash]) => second.has(id) && second.get(id) !== hash);
    expect(changed).toEqual([]);
  }, 120_000);
});
