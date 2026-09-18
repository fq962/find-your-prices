import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  canonicalMetromediaPath,
  mapMetromediaCard,
  metromediaRootPriority,
  metromediaStrategy,
  parseMetromediaCards,
  parseMetromediaCategories,
} from './metromedia';

/** Barra lateral de /en_US/shop?ppg=1 y tarjetas reales (2026-09-18). */
const HTML = readFileSync(join(__dirname, 'fixtures', 'metromedia-shop.html'), 'utf8');
const BASE = 'https://metromedia.hn';

function fakeHttp(requested: string[], respond: (url: string) => string = () => HTML) {
  return {
    async getText(url: string) {
      requested.push(url);
      return respond(url);
    },
    getJson: async () => { throw new Error('no'); },
    postJson: async () => { throw new Error('no'); },
    stats: { requests: 0, errors: 0, bytes: 0 },
  };
}

function runWith(http: ReturnType<typeof fakeHttp>, url: string | null, config: Record<string, unknown> = {}) {
  return metromediaStrategy.run({
    store: { default_currency: 'HNL' } as never,
    target: { max_pages: 100, kind: 'category', url } as never,
    config,
    http,
    signal: new AbortController().signal,
    log: () => {},
  });
}

describe('metromedia', () => {
  const cards = parseMetromediaCards(HTML);
  const categories = parseMetromediaCategories(HTML, BASE);
  const byId = new Map(categories.map((c) => [c.external_id, c]));

  test('extrae las tarjetas reales: sin rebaja y con rebaja', () => {
    // La primera tarjeta (ppg=1) es la misma que la segunda: el parser no deduplica, run() si.
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      templateId: '283659',
      variantId: '286758',
      path: '/shop/product/viento-en-contra-283659',
      name: 'Viento en contra',
      price: 385,
      listPrice: null,
      currency: 'HNL',
      // 350x350?unique=X -> la original, sin `unique`.
      imagePath: '/web/image/product.template/283659/image',
    });
    expect(cards[0].description).toMatch(/^Este libro está inspirado en el conflicto de 1969/);
    expect(cards[0].description).not.toMatch(/<br>/);
    // El href dentro de una categoria trae ?category=135: se recorta a la canonica.
    expect(cards[2]).toMatchObject({
      templateId: '282068',
      variantId: '285173',
      path: '/shop/product/con-amor-mama-282068',
      name: 'Con amor, mama',
      price: 517.5,
      listPrice: 690,
    });
  });

  test('el <del> con d-none no cuenta como rebaja', () => {
    const html = HTML.replace(/class="text-danger mr8 "/, 'class="text-danger mr8 d-none"');
    expect(parseMetromediaCards(html)[2].listPrice).toBeNull();
  });

  test('ruta canonica sin idioma ni query', () => {
    expect(canonicalMetromediaPath('/en_US/shop/product/con-amor-mama-282068?category=135')).toBe('/shop/product/con-amor-mama-282068');
    expect(canonicalMetromediaPath('/shop/product/x-1')).toBe('/shop/product/x-1');
  });

  test('arbol de la barra lateral: 68 nodos, 16 raices, generos bajo Libros', () => {
    expect(categories).toHaveLength(68);
    const roots = categories.filter((c) => !c.external_parent_id);
    expect(roots).toHaveLength(16);
    expect(byId.get('98')).toMatchObject({ name: 'Novedades', level: 1, position: 1 });
    expect(byId.get('84')).toMatchObject({ name: 'Libros en Español', external_parent_id: null, slug: 'libros-en-espanol' });
    expect(byId.get('43')).toMatchObject({
      name: 'Novela contemporanea',
      external_parent_id: '84',
      level: 2,
      url: `${BASE}/en_US/shop/category/libros-en-espanol-novela-contemporanea-43`,
    });
    expect(byId.get('88')).toMatchObject({ name: 'Mystery & horror', external_parent_id: '85' });
    expect(byId.get('104')).toMatchObject({ name: 'Literatura Hondureña', external_parent_id: null });
    expect(new Set(categories.map((c) => c.external_id)).size).toBe(68);
  });

  test('prioridad: sin hijas primero en orden de barra, con hijas al final, promos fuera', () => {
    const priority = metromediaRootPriority(categories, ['98', '135', '99']);
    expect(priority.map((c) => c.external_id)).toEqual([
      '107', '80', '40', '118', '108', '132', '37', '196', '79', '186', '104', // sin hijas
      '84', '85', // Libros en Español, Libros en Ingles
    ]);
  });

  test('mapea sin raw, con categoria raiz, rebaja y descripcion recortada', () => {
    const p = mapMetromediaCard(cards[2], `${BASE}/`, 'HNL', byId.get('84')!);
    expect(p).toMatchObject({
      external_id: '282068',
      url: `${BASE}/en_US/shop/product/con-amor-mama-282068`,
      slug: 'con-amor-mama',
      store_category_external_id: '84',
      category_raw: 'Libros en Español',
      category_path: ['Libros en Español'],
      currency: 'HNL',
      price: 517.5,
      list_price: 690,
      discount_amount: 172.5,
      discount_percent: 25,
      availability: 'unknown',
      primary_image_url: `${BASE}/web/image/product.template/282068/image`,
      badges: ['descuento'],
    });
    expect(p?.raw).toBeUndefined();
    expect(p?.short_description?.length).toBeLessThanOrEqual(300);
    expect(mapMetromediaCard(cards[0], BASE, 'HNL', null)?.store_category_external_id).toBeNull();
  });

  test('run: excluye lo que ya esta en raices de mayor prioridad', async () => {
    const requested: string[] = [];
    // Comics (37) trae ambos libros; Literatura Hondureña (104) solo "Con amor".
    const withoutViento = HTML.replace(/<div class="oe_product_cart"[\s\S]*?<\/form>/g, (card) =>
      card.includes('283659') ? '' : card,
    );
    const http = fakeHttp(requested, (url) => (url.includes('-104?') ? withoutViento : HTML));
    const result = await runWith(http, `${BASE}/en_US/shop/category/literatura-hondurena-104`);
    expect(result.errors ?? []).toHaveLength(0);
    // ppg=1 para el arbol + 10 raices previas + la propia.
    expect(result.pagesFetched).toBe(12);
    expect(requested[0]).toBe(`${BASE}/en_US/shop?ppg=1`);
    expect(requested.slice(1).every((u) => u.endsWith('?ppg=1000'))).toBe(true);
    expect(requested.some((u) => u.includes('/category/novedades-98'))).toBe(false);
    expect(requested.some((u) => u.includes('/category/libros-en-espanol-84'))).toBe(false);
    // Todo lo de Literatura Hondureña ya estaba en Agendas (la primera de la lista): nada propio.
    expect(result.products).toHaveLength(0);
    expect(result.stats).toMatchObject({ root: 'Literatura Hondureña', rank: 10, skipped: 1 });
    expect(result.categories?.some((c) => c.external_id === '98')).toBe(false);
    expect(result.categories).toHaveLength(65);
  });

  test('run: la primera raiz no excluye nada y deduplica por id', async () => {
    const requested: string[] = [];
    const result = await runWith(fakeHttp(requested), `${BASE}/en_US/shop/category/agendas-107`);
    expect(result.pagesFetched).toBe(2);
    expect(result.products.map((p) => p.external_id)).toEqual(['283659', '282068']);
    for (const p of result.products) expect(p.category_raw).toBe('Agendas');
  });

  test('run: un genero se sube a su raiz', async () => {
    const requested: string[] = [];
    const result = await runWith(fakeHttp(requested), null, { categoryId: '43' });
    expect(result.stats).toMatchObject({ root: 'Libros en Español', rank: 11 });
    expect(requested.some((u) => u.includes('/category/libros-en-espanol-84?'))).toBe(true);
    expect(requested.some((u) => u.includes('-43?'))).toBe(false);
  });

  test('run: sin categoryId o con una promo no recorre nada', async () => {
    const requested: string[] = [];
    const none = await runWith(fakeHttp(requested), null);
    expect(none.products).toHaveLength(0);
    expect(none.errors?.[0]?.stage).toBe('config');
    const promo = await runWith(fakeHttp(requested), `${BASE}/en_US/shop/category/descuentos-135`);
    expect(promo.products).toHaveLength(0);
    expect(promo.errors?.[0]?.stage).toBe('config');
  });

  test('run: si falla una raiz del indice se corta sin productos', async () => {
    const requested: string[] = [];
    const http = fakeHttp(requested, (url) => {
      if (url.includes('-80?')) throw new Error('500');
      return HTML;
    });
    const result = await runWith(http, `${BASE}/en_US/shop/category/comics-37`);
    expect(result.products).toHaveLength(0);
    expect(result.errors?.[0]?.stage).toBe('paginate');
    expect(result.stats).toMatchObject({ excludedFrom: 'Accesorios' });
  });
});
