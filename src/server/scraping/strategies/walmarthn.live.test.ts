import { describe, expect, test } from 'vitest';
import { createHttpClient } from '../http';
import { walmarthnStrategy } from './walmarthn';

/**
 * Prueba de contrato contra la Catalog System API real de Walmart Honduras.
 *
 * No corre por defecto: golpea infraestructura de terceros y fallaria en CI
 * cada vez que su servidor tenga un mal dia. Se ejecuta a mano cuando se
 * sospecha que Walmart cambio algo:
 *
 *   SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/walmarthn.live.test.ts
 */
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';

function context(config: Record<string, unknown>, maxPages: number) {
  return {
    store: { default_currency: 'HNL' } as never,
    target: { max_pages: maxPages, kind: 'category', url: null } as never,
    config,
    http: createHttpClient({ delayMs: 400 }),
    signal: new AbortController().signal,
    log: () => {},
  };
}

describe.skipIf(!enabled)('walmarthn contra la Catalog System API real', () => {
  test('pagina una categoria, mapea y arma la jerarquia', async () => {
    const result = await walmarthnStrategy.run(
      context({ categoryPath: 'abarrotes/azucar-y-postres', syncCategories: true }, 3),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.categories?.length).toBeGreaterThan(0);

    // El external_id tiene que ser unico o el upsert por lote se rompe.
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(result.products.length);

    for (const product of result.products) {
      expect(product.url).toMatch(/^https:\/\/www\.walmart\.com\.hn\/.+\/p$/);
      expect(product.price).not.toBeNull();
      expect(product.availability).not.toBe('unknown');
      // Como campo mapeado ensuciaria el hash a diario. Ver cabecera de walmarthn.ts.
      expect(product.price_valid_until).toBeUndefined();
    }
  }, 90_000);

  test('la ventana de paginacion sigue siendo de 50 y el desplazamiento tope 2500', async () => {
    // Si Walmart cambia estos limites, el reparto por subcategorias sobra o se
    // queda corto. Vale la pena que la prueba avise en vez de descubrirlo por
    // un barrido incompleto.
    const http = createHttpClient({ delayMs: 400 });
    const base = 'https://www.walmart.com.hn/api/catalog_system/pub/products/search/abarrotes';

    const ventana = await http.getJson<unknown[]>(`${base}?_from=0&_to=49&O=OrderByNameASC`);
    expect(ventana).toHaveLength(50);

    await expect(http.getJson(`${base}?_from=0&_to=50`, { retries: 0 })).rejects.toThrow();
    await expect(http.getJson(`${base}?_from=2550&_to=2599`, { retries: 0 })).rejects.toThrow();
  }, 60_000);

  test('reparte una categoria que no cabe en el limite de la API', async () => {
    // "Articulos para el hogar" declara 4430 articulos y la API entrega como
    // maximo 2550 por consulta: la corrida tiene que bajar al sitemap y barrer
    // las subcategorias. Con max_pages bajo no termina, pero si alcanza para
    // comprobar que el reparto se dispara.
    const result = await walmarthnStrategy.run(
      context({ categoryPath: 'articulos-para-el-hogar', partitionOversized: true }, 60),
    );

    expect(result.stats?.partitioned).toContain('articulos-para-el-hogar');
    expect((result.stats?.pathsSwept as string[]).length).toBeGreaterThan(1);
  }, 180_000);
});
