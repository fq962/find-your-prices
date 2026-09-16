import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  categoryPath,
  mapPcbuildsCard,
  parsePcbuildsCards,
  parsePcbuildsCategories,
  parsePcbuildsCategoryUrl,
  parsePcbuildsLastPage,
  parsePcbuildsPrice,
  pcbuildsStrategy,
} from './pcbuilds';

/** Fragmento real de /shop/category/refrigeracion-80 (2026-09-16). */
const HTML = readFileSync(join(__dirname, 'fixtures', 'pcbuilds-refrigeracion.html'), 'utf8');
const BASE = 'https://www.pcbuildshonduras.com';

/** Tarjeta con rebaja, siguiendo la plantilla de Odoo (el sitio no tenia ninguna ese dia). */
const DISCOUNT_HTML = `
<article class="oe_product_cart h-100 d-flex " data-publish="on" aria-label="Producto rebajado">
  <a href="/shop/producto-rebajado-99" class="oe_product_image_link position-relative ">
    <img src="/web/image/product.product/1/image_1024/x?unique=abc" class="img img-fluid oe_product_image_img h-100 w-100" alt="x"/>
  </a>
  <h6 class="o_wsale_products_item_title text-break"><a class="text-decoration-none" href="/shop/producto-rebajado-99"><span>Producto &amp; rebajado</span></a></h6>
  <div class="product_price" aria-label="Información sobre precios">
    <del class="text-muted me-1 h6 mb-0" data-oe-type="monetary" data-oe-expression="template_price_vals[&#39;list_price&#39;]">L&nbsp;<span class="oe_currency_value">1.500,00</span></del>
    <span class="mb-0 fw-bold" data-oe-type="monetary" data-oe-expression="template_price_vals[&#39;price_reduce&#39;]">L <span class="oe_currency_value">1.200,00</span></span>
  </div>
  <button name="add_to_cart" data-product-id="7" data-product-template-id="99" data-product-type="consu"></button>
</article>
<article class="oe_product_cart h-100 d-flex " aria-label="Sin id">
  <a href="/shop/cart" class="oe_product_image_link"></a>
  <h6 class="o_wsale_products_item_title"><a href="/shop/cart"><span>Sin identificador</span></a></h6>
</article>`;

describe('pcbuilds', () => {
  const cards = parsePcbuildsCards(HTML);
  const categories = parsePcbuildsCategories(HTML, BASE);
  const byId = new Map(categories.map((c) => [c.external_id, c]));

  test('precio en formato es-HN y en-US', () => {
    expect(parsePcbuildsPrice('L <span class="oe_currency_value">3.900,00</span>')).toBe(3900);
    expect(parsePcbuildsPrice('L&nbsp;12.345,50')).toBe(12345.5);
    expect(parsePcbuildsPrice('L 800,00')).toBe(800);
    expect(parsePcbuildsPrice('L 1,690.00')).toBe(1690);
    expect(parsePcbuildsPrice('')).toBeNull();
    expect(parsePcbuildsPrice('N/D')).toBeNull();
  });

  test('extrae las tarjetas reales', () => {
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      templateId: '4388',
      variantId: '4332',
      // El listado de categoria enlaza /shop/refrigeracion-80/...: se recorta a la canonica.
      path: '/shop/ae240-v3-thermalright-aqua-elite-240-v3-black-4388',
      name: 'Thermalright Aqua Elite 240 V3 | BLACK',
      price: 2000,
      listPrice: null,
      productType: 'consu',
      ribbons: [],
    });
    // Imagen principal y secundaria, sin el `unique` volatil.
    expect(cards[0].imagePaths).toEqual([
      '/web/image/product.product/4332/image_1024/%5BAE240%20V3%5D%20Thermalright%20Aqua%20Elite%20240%20V3%20%7C%20BLACK',
      '/web/image/product.image/5774/image_1024/71tvKUkvqEL._SL1500_.webp',
    ]);
    expect(cards[1]).toMatchObject({ templateId: '1287', name: 'EK-Quantum Volume FLT 360 D-RGB - Plexi', price: 4300 });
    expect(cards[2]).toMatchObject({ templateId: '4454', path: '/shop/hp-smart-tank-580-impresora-multifuncion-wi-fi-4454', price: 6900 });
    for (const card of cards) {
      expect(card.path).toMatch(new RegExp(`-${card.templateId}$`));
      for (const img of card.imagePaths) expect(img).not.toContain('unique=');
    }
  });

  test('ribbon como badge y nombre con entidades', () => {
    const ribboned = cards.find((c) => c.ribbons.length > 0);
    expect(ribboned).toBeDefined();
    expect(ribboned?.ribbons).toEqual(['¡Nuevo!']);
    expect(ribboned?.name).toBe('HP Smart Tank 580 | Impresora multifunción | Wi-Fi');
    const mapped = mapPcbuildsCard(ribboned!, BASE, 'HNL');
    expect(mapped?.badges).toEqual(['nuevo']);
  });

  test('rebaja con <del> y descarte sin identificador', () => {
    const extra = parsePcbuildsCards(DISCOUNT_HTML);
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ templateId: '99', name: 'Producto & rebajado', price: 1200, listPrice: 1500 });
    const mapped = mapPcbuildsCard(extra[0], BASE, 'HNL');
    expect(mapped?.discount_amount).toBe(300);
    expect(mapped?.badges).toContain('descuento');
    // Sin rebaja real no hay list_price.
    expect(mapPcbuildsCard({ ...extra[0], listPrice: null }, BASE, 'HNL')?.list_price).toBeNull();
  });

  test('ultima pagina del paginador', () => {
    expect(parsePcbuildsLastPage(HTML, '/shop/category/refrigeracion-80')).toBe(5);
    expect(parsePcbuildsLastPage(HTML, '/shop')).toBeNull();
    expect(parsePcbuildsLastPage('<a href="/shop/page/2">2</a><a href="/shop/page/15">15</a>', '/shop')).toBe(15);
  });

  test('arbol de categorias con padres y niveles', () => {
    expect(categories.length).toBe(41);
    expect(byId.get('80')).toMatchObject({ name: 'Refrigeración', external_parent_id: null, level: 1, slug: 'refrigeracion' });
    expect(byId.get('35')).toMatchObject({ name: 'Watercooling', external_parent_id: '80', level: 2 });
    expect(byId.get('75')).toMatchObject({
      name: 'CPU Blocks',
      external_parent_id: '35',
      level: 3,
      url: `${BASE}/shop/category/refrigeracion-watercooling-cpu-blocks-75`,
    });
    expect(byId.get('37')).toMatchObject({ name: 'Productos en Camino', external_parent_id: null, level: 1 });
    expect(categoryPath('75', byId)).toEqual(['Refrigeración', 'Watercooling', 'CPU Blocks']);
    // Ids unicos.
    expect(new Set(categories.map((c) => c.external_id)).size).toBe(categories.length);
  });

  test('url de categoria', () => {
    expect(parsePcbuildsCategoryUrl(`${BASE}/shop/category/almacenamiento-m-2-13`)).toEqual({ slug: 'almacenamiento-m-2', id: '13' });
    expect(parsePcbuildsCategoryUrl('/shop/category/procesadores-1/page/2')).toEqual({ slug: 'procesadores', id: '1' });
    expect(parsePcbuildsCategoryUrl(`${BASE}/shop`)).toBeNull();
  });

  test('mapea sin raw, con categoria y preventa', () => {
    const p = mapPcbuildsCard(cards[0], `${BASE}/`, 'HNL', {
      category: byId.get('33')!,
      categoryPath: categoryPath('33', byId),
      preorder: true,
      marketplace: false,
    });
    expect(p).toMatchObject({
      external_id: '4388',
      url: `${BASE}/shop/ae240-v3-thermalright-aqua-elite-240-v3-black-4388`,
      slug: 'ae240-v3-thermalright-aqua-elite-240-v3-black',
      store_category_external_id: '33',
      category_raw: 'Refrigeración Líquida',
      category_path: ['Refrigeración', 'Refrigeración Líquida'],
      currency: 'HNL',
      price: 2000,
      list_price: null,
      availability: 'preorder',
      in_stock: false,
      primary_image_url: `${BASE}/web/image/product.product/4332/image_1024/%5BAE240%20V3%5D%20Thermalright%20Aqua%20Elite%20240%20V3%20%7C%20BLACK`,
      badges: ['en-camino'],
    });
    expect(p?.raw).toBeUndefined();
    expect(p?.attributes).toEqual({ variantId: '4332', productType: 'consu' });

    const plain = mapPcbuildsCard(cards[0], BASE, 'HNL');
    expect(plain?.availability).toBe('unknown');
    expect(plain?.in_stock).toBeNull();
    expect(plain?.store_category_external_id).toBeNull();
  });

  test('run: recorre hojas antes que padres y atribuye la categoria mas especifica', async () => {
    // Sitio simulado: el arbol real de la barra lateral; cada listado devuelve
    // las tarjetas del fixture salvo la hoja 33, que solo tiene la primera.
    const requested: string[] = [];
    const http = {
      async getText(url: string) {
        requested.push(url);
        if (/refrigeracion-refrigeracion-liquida-33$/.test(url)) {
          return HTML.replace(/<article class="oe_product_cart[\s\S]*?<\/article>/g, (m, offset, whole) =>
            whole.indexOf('<article class="oe_product_cart') === offset ? m : '',
          ).replace(/<div id="o_wsale_pager"[\s\S]*$/, '');
        }
        if (/\/shop\/category\//.test(url)) return HTML.replace(/<div id="o_wsale_pager"[\s\S]*$/, '');
        return HTML.replace(/<div id="o_wsale_pager"[\s\S]*$/, '');
      },
      getJson: async () => { throw new Error('no'); },
      postJson: async () => { throw new Error('no'); },
      stats: { requests: 0, errors: 0, bytes: 0 },
    };

    const result = await pcbuildsStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 100, kind: 'full_catalog', url: null } as never,
      config: {},
      http,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors ?? []).toHaveLength(0);
    // /shop + 41 categorias, una pagina cada una.
    expect(result.pagesFetched).toBe(42);
    expect(result.categories).toHaveLength(41);
    // Las hojas (nivel 3) se piden antes que las raices (nivel 1).
    const firstLeaf = requested.findIndex((u) => u.endsWith('-75'));
    const root = requested.findIndex((u) => u.endsWith('/refrigeracion-80'));
    expect(firstLeaf).toBeGreaterThan(0);
    expect(firstLeaf).toBeLessThan(root);

    expect(result.products).toHaveLength(3);
    const ids = new Set(result.products.map((p) => p.external_id));
    expect(ids.size).toBe(3);
    // Todas las tarjetas aparecen en todas las categorias del simulador, asi
    // que la atribuida es la primera hoja recorrida (nivel 3).
    for (const p of result.products) expect(p.category_path).toHaveLength(3);
    // Y como tambien aparecen en "Productos en Camino" y "PCB Marketplace",
    // llevan las etiquetas sin perder la categoria real.
    for (const p of result.products) {
      expect(p.availability).toBe('preorder');
      expect(p.badges).toEqual(expect.arrayContaining(['en-camino', 'marketplace']));
    }
  });

  test('run: target de categoria recorre solo su rama y deduce el id de la url', async () => {
    const requested: string[] = [];
    const http = {
      async getText(url: string) {
        requested.push(url);
        return HTML.replace(/<div id="o_wsale_pager"[\s\S]*$/, '');
      },
      getJson: async () => { throw new Error('no'); },
      postJson: async () => { throw new Error('no'); },
      stats: { requests: 0, errors: 0, bytes: 0 },
    };
    const result = await pcbuildsStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 100, kind: 'category', url: `${BASE}/shop/category/refrigeracion-watercooling-35` } as never,
      config: {},
      http,
      signal: new AbortController().signal,
      log: () => {},
    });
    // /shop + Watercooling y sus 6 hijas.
    expect(result.pagesFetched).toBe(8);
    expect(requested.filter((u) => u.includes('/shop/category/'))).toHaveLength(7);
    expect(result.categories?.map((c) => c.external_id).sort()).toEqual(['35', '66', '67', '68', '73', '74', '75'].sort());
    expect(result.products).toHaveLength(3);
    for (const p of result.products) expect(p.category_path?.[1]).toBe('Watercooling');
  });
});
