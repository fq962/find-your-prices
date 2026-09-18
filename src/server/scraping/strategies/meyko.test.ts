import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { categoryPath } from './pcbuilds';
import { mapMeykoCard, meykoStrategy, parseMeykoCards, parseMeykoCategories } from './meyko';

/** Fragmento real de /shop?ppg=1000 (2026-09-17). */
const HTML = readFileSync(join(__dirname, 'fixtures', 'meyko-shop.html'), 'utf8');
const BASE = 'https://meyko.com';

describe('meyko', () => {
  const cards = parseMeykoCards(HTML);
  const categories = parseMeykoCategories(HTML, BASE);
  const byId = new Map(categories.map((c) => [c.external_id, c]));

  test('extrae las tarjetas reales: normal, con rebaja y ribbon, sin precio', () => {
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      templateId: '12869',
      variantId: '27284',
      // El href trae ?order=name+asc: se recorta a la canonica.
      path: '/shop/aerocamara-con-mascara-flow-vu-aerochamber-plus-12869',
      name: 'AEROCAMARA CON MASCARA Flow-Vu - AeroChamber Plus',
      price: 800,
      listPrice: null,
      currency: 'HNL',
      ribbons: [],
      // image_256 -> image_1024 y sin `unique`.
      imagePath: '/web/image/product.template/12869/image_1024/AEROCAMARA%20CON%20MASCARA%20Flow-Vu%20-%20AeroChamber%20Plus',
    });
    expect(cards[1]).toMatchObject({
      templateId: '34939',
      price: 399,
      listPrice: 999.99,
      ribbons: ['Precio exclusivo web'],
    });
    // 0.0 no es gratis: sin precio.
    expect(cards[2]).toMatchObject({ templateId: '33195', name: 'BOTA ANTIROTATORIA - Kamex®', price: null, listPrice: null });
  });

  test('el microdato con float sin redondear queda en centavos', () => {
    const html = HTML.replace('>800.0<', '>1.1500000000000001<');
    expect(parseMeykoCards(html)[0].price).toBe(1.15);
  });

  test('el <del> con d-none no cuenta como rebaja', () => {
    const html = HTML.replace(/class="text-danger ml-1 h6 "/, 'class="text-danger ml-1 h6 d-none"');
    expect(parseMeykoCards(html)[1].listPrice).toBeNull();
  });

  test('arbol de categorias con padres y niveles', () => {
    expect(categories).toHaveLength(46);
    expect(categories.filter((c) => c.level === 1)).toHaveLength(11);
    expect(byId.get('338')).toMatchObject({ name: 'Cuidado en casa', external_parent_id: null, level: 1, slug: 'cuidado-en-casa' });
    expect(byId.get('385')).toMatchObject({
      name: 'Almohadas y cojines',
      external_parent_id: '338',
      level: 2,
      url: `${BASE}/shop/category/cuidado-en-casa-almohadas-y-cojines-385`,
    });
    expect(byId.get('330')).toMatchObject({ name: 'Diabetes', external_parent_id: null, level: 1 });
    expect(categoryPath('385', byId)).toEqual(['Cuidado en casa', 'Almohadas y cojines']);
    expect(new Set(categories.map((c) => c.external_id)).size).toBe(46);
  });

  test('mapea sin raw, con categoria, rebaja y badges', () => {
    const p = mapMeykoCard(cards[1], `${BASE}/`, 'HNL', { category: byId.get('385')!, categoryPath: categoryPath('385', byId) });
    expect(p).toMatchObject({
      external_id: '34939',
      url: `${BASE}/shop/100094-agarradera-para-sanitario-medko-34939`,
      slug: '100094-agarradera-para-sanitario-medko',
      store_category_external_id: '385',
      category_path: ['Cuidado en casa', 'Almohadas y cojines'],
      currency: 'HNL',
      price: 399,
      list_price: 999.99,
      discount_amount: 600.99,
      discount_percent: 60.1,
      availability: 'unknown',
      primary_image_url: `${BASE}/web/image/product.template/34939/image_1024/%5B100094%5D%20AGARRADERA%20PARA%20SANITARIO%20-%20medKo`,
      badges: ['descuento', 'precio exclusivo web'],
    });
    expect(p?.raw).toBeUndefined();
    const plain = mapMeykoCard(cards[2], BASE, 'HNL');
    expect(plain?.price).toBeNull();
    expect(plain?.store_category_external_id).toBeNull();
  });

  test('run: hojas antes que padres, ppg en cada url, /shop al final', async () => {
    const requested: string[] = [];
    const http = {
      async getText(url: string) {
        requested.push(url);
        return HTML;
      },
      getJson: async () => { throw new Error('no'); },
      postJson: async () => { throw new Error('no'); },
      stats: { requests: 0, errors: 0, bytes: 0 },
    };
    const result = await meykoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 100, kind: 'full_catalog', url: null } as never,
      config: { pageSize: 500 },
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    expect(result.errors ?? []).toHaveLength(0);
    // /shop + 46 categorias, una pagina cada una (3 tarjetas < 500).
    expect(result.pagesFetched).toBe(47);
    expect(requested.every((u) => u.includes('ppg=500'))).toBe(true);
    const firstChild = requested.findIndex((u) => u.includes('-385?'));
    const parent = requested.findIndex((u) => u.includes('cuidado-en-casa-338?'));
    expect(firstChild).toBeGreaterThan(0);
    expect(firstChild).toBeLessThan(parent);
    expect(result.products).toHaveLength(3);
    for (const p of result.products) expect(p.category_path).toHaveLength(2);
  });

  test('run: target de categoria recorre solo su rama', async () => {
    const requested: string[] = [];
    const http = {
      async getText(url: string) { requested.push(url); return HTML; },
      getJson: async () => { throw new Error('no'); },
      postJson: async () => { throw new Error('no'); },
      stats: { requests: 0, errors: 0, bytes: 0 },
    };
    const result = await meykoStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 100, kind: 'category', url: `${BASE}/shop/category/cuidado-en-casa-338` } as never,
      config: {},
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    const branch = categories.filter((c) => c.external_id === '338' || c.external_parent_id === '338');
    expect(result.pagesFetched).toBe(1 + branch.length);
    expect(result.categories?.map((c) => c.external_id).sort()).toEqual(branch.map((c) => c.external_id).sort());
    for (const p of result.products) expect(p.category_path?.[0]).toBe('Cuidado en casa');
  });
});
