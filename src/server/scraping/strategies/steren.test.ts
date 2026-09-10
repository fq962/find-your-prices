import { describe, expect, test } from 'vitest';
import {
  buildSterenUrl,
  categoryPathFor,
  leafCategory,
  mapSterenProduct,
  round2,
  stripHtml,
} from './steren';

/**
 * Los casos de abajo salen de datos reales: productos tal cual los devuelve
 * https://www.steren.com.hn/graphql (endpoint publico de Adobe
 * Commerce/Magento, sin autenticacion ni header de tienda). Si Steren cambia
 * el esquema de su GraphQL, estas pruebas fallan antes de que el scraper
 * guarde precios o categorias inventadas en la base.
 */

const CONFIG = { webBaseUrl: 'https://www.steren.com.hn' };

/** Articulo real sin rebaja, con categorias mezclando catalogo real y marketing. */
const SUBWOOFER = {
  sku: 'SUB-1800PRO',
  uid: 'MjMwNzk=',
  name: 'Subwoofer profesional de 18”',
  url_key: 'subwoofer-profesional-de-18',
  url_suffix: '.html',
  canonical_url: null,
  manufacturer: null,
  stock_status: 'IN_STOCK' as const,
  only_x_left_in_stock: null,
  rating_summary: 0,
  review_count: 0,
  meta_title: null,
  meta_description: null,
  description: { html: '<p>Con este subwoofer eleva la potencia.</p>' },
  short_description: { html: '<div>Eleva la potencia, graves y profundidad.</div>' },
  thumbnail: {
    url: 'https://www.steren.com.hn/media/catalog/product/cache/x/s/u/sub-1800pro_x1.jpg',
    label: 'Subwoofer profesional de 18”',
  },
  media_gallery: [
    {
      url: 'https://www.steren.com.hn/media/catalog/product/cache/x/s/u/sub-1800pro_x1.jpg',
      label: null,
      position: 1,
      disabled: false,
    },
    {
      url: 'https://www.steren.com.hn/media/catalog/product/cache/x/s/u/sub-1800pro_hidden.jpg',
      label: null,
      position: 2,
      disabled: true,
    },
  ],
  price_range: {
    minimum_price: {
      regular_price: { value: 27490.000001, currency: 'HNL' },
      final_price: { value: 27490.000001, currency: 'HNL' },
      discount: { amount_off: 0, percent_off: 0 },
    },
  },
  categories: [
    { id: 3, name: 'AUDIO', url_path: 'audio', level: 2 },
    { id: 240, name: 'Envíos Gratis', url_path: 'productos-envio-gratis', level: 2 },
    { id: 667, name: 'Bocinas amplificadas', url_path: 'audio/bocinas-amplificadas', level: 3 },
    { id: 770, name: 'Envíos Gratis HN', url_path: 'envios-gratis-hn', level: 2 },
  ],
};

/** Articulo real CON rebaja de verdad y jerarquia limpia de 2 niveles. */
const CORREA = {
  sku: 'SMW-020',
  uid: 'MjAwMDA=',
  name: 'Correa de 22 mm de nylon para Smart Watch',
  url_key: 'correa-de-22-mm-de-nylon-para-smart-watch',
  url_suffix: '.html',
  canonical_url: null,
  manufacturer: null,
  stock_status: 'IN_STOCK' as const,
  only_x_left_in_stock: null,
  rating_summary: 0,
  review_count: 0,
  meta_title: null,
  meta_description: null,
  description: { html: '' },
  short_description: { html: '' },
  thumbnail: null,
  media_gallery: [],
  price_range: {
    minimum_price: {
      regular_price: { value: 149.010001, currency: 'HNL' },
      final_price: { value: 129.57, currency: 'HNL' },
      discount: { amount_off: 19.44, percent_off: 13.05 },
    },
  },
  categories: [
    { id: 75, name: 'TELEFONÍA CELULARES Y TABLETS', url_path: 'telefonia-celulares-y-tablets', level: 2 },
    {
      id: 735,
      name: 'Smart Watches (Relojes Inteligentes)',
      url_path: 'telefonia-celulares-y-tablets/smart-watches-relojes-inteligentes',
      level: 3,
    },
  ],
};

/** Articulo real sin categorias asignadas: no debe reventar el mapeo. */
const MONITOR = {
  sku: 'MNT-027',
  uid: 'MTAwMDE=',
  name: 'Monitor de 27” IPS',
  url_key: 'monitor-de-27-pulgadas',
  url_suffix: '.html',
  canonical_url: null,
  manufacturer: null,
  stock_status: 'OUT_OF_STOCK' as const,
  only_x_left_in_stock: null,
  rating_summary: 0,
  review_count: 0,
  meta_title: null,
  meta_description: null,
  description: { html: '' },
  short_description: { html: '' },
  thumbnail: null,
  media_gallery: [],
  price_range: {
    minimum_price: {
      regular_price: { value: 4790.000001, currency: 'HNL' },
      final_price: { value: 4790.000001, currency: 'HNL' },
      discount: null,
    },
  },
  categories: [],
};

describe('round2', () => {
  test('redondea a centavos', () => {
    expect(round2(7.484999999)).toBe(7.48);
  });

  test('null se queda en null', () => {
    expect(round2(null)).toBeNull();
    expect(round2(undefined)).toBeNull();
  });
});

describe('stripHtml', () => {
  test('quita etiquetas y conserva el texto', () => {
    expect(stripHtml('<div>Eleva la potencia, graves y profundidad.</div>')).toBe(
      'Eleva la potencia, graves y profundidad.',
    );
  });

  test('vacio o nulo da cadena vacia', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

describe('buildSterenUrl', () => {
  test('arma la url desde url_key + url_suffix cuando canonical_url falta', () => {
    expect(buildSterenUrl(SUBWOOFER, CONFIG.webBaseUrl)).toBe(
      'https://www.steren.com.hn/subwoofer-profesional-de-18.html',
    );
  });

  test('usa canonical_url cuando esta presente', () => {
    expect(
      buildSterenUrl({ canonical_url: 'foo-bar', url_key: null, url_suffix: null }, CONFIG.webBaseUrl),
    ).toBe('https://www.steren.com.hn/foo-bar');
  });

  test('null si no hay ni canonical_url ni url_key', () => {
    expect(buildSterenUrl({ canonical_url: null, url_key: null, url_suffix: null }, CONFIG.webBaseUrl)).toBeNull();
  });
});

describe('leafCategory / categoryPathFor', () => {
  test('la hoja es la de level mas alto, no la ultima del array', () => {
    const leaf = leafCategory(SUBWOOFER.categories);
    expect(leaf?.name).toBe('Bocinas amplificadas');
  });

  test('el path solo incluye ancestros reales, no las categorias de marketing', () => {
    const leaf = leafCategory(SUBWOOFER.categories);
    expect(categoryPathFor(SUBWOOFER.categories, leaf)).toEqual(['AUDIO', 'Bocinas amplificadas']);
  });

  test('jerarquia limpia de 2 niveles', () => {
    const leaf = leafCategory(CORREA.categories);
    expect(leaf?.name).toBe('Smart Watches (Relojes Inteligentes)');
    expect(categoryPathFor(CORREA.categories, leaf)).toEqual([
      'TELEFONÍA CELULARES Y TABLETS',
      'Smart Watches (Relojes Inteligentes)',
    ]);
  });

  test('sin categorias, hoja y path quedan vacios', () => {
    expect(leafCategory(MONITOR.categories)).toBeNull();
    expect(categoryPathFor(MONITOR.categories, null)).toEqual([]);
  });
});

describe('mapSterenProduct', () => {
  test('usa sku como identidad y arma la url publica', () => {
    const mapped = mapSterenProduct(SUBWOOFER, CONFIG, 'HNL');
    expect(mapped?.external_id).toBe('SUB-1800PRO');
    expect(mapped?.sku).toBe('SUB-1800PRO');
    expect(mapped?.url).toBe('https://www.steren.com.hn/subwoofer-profesional-de-18.html');
  });

  test('sin rebaja de verdad, list_price y discount quedan en null', () => {
    const mapped = mapSterenProduct(SUBWOOFER, CONFIG, 'HNL');
    expect(mapped?.price).toBe(27490);
    expect(mapped?.list_price).toBeNull();
    expect(mapped?.discount_percent).toBeNull();
    expect(mapped?.discount_amount).toBeNull();
    expect(mapped?.badges).not.toContain('descuento');
  });

  test('calcula precio de lista y descuento solo cuando regular es de verdad mayor', () => {
    const mapped = mapSterenProduct(CORREA, CONFIG, 'HNL');
    expect(mapped?.price).toBe(129.57);
    expect(mapped?.list_price).toBe(149.01);
    expect(mapped?.discount_percent).toBe(13.05);
    expect(mapped?.discount_amount).toBe(19.44);
    expect(mapped?.badges).toContain('descuento');
  });

  test('la categoria hoja es la de level mas alto, no la ultima del array', () => {
    const mapped = mapSterenProduct(SUBWOOFER, CONFIG, 'HNL');
    expect(mapped?.store_category_external_id).toBe('667');
    expect(mapped?.category_raw).toBe('Bocinas amplificadas');
    expect(mapped?.category_path).toEqual(['AUDIO', 'Bocinas amplificadas']);
  });

  test('stock_status se traduce a disponibilidad normalizada', () => {
    const inStock = mapSterenProduct(SUBWOOFER, CONFIG, 'HNL');
    expect(inStock?.availability).toBe('in_stock');
    expect(inStock?.in_stock).toBe(true);

    const outOfStock = mapSterenProduct(MONITOR, CONFIG, 'HNL');
    expect(outOfStock?.availability).toBe('out_of_stock');
    expect(outOfStock?.in_stock).toBe(false);
    expect(outOfStock?.badges).toContain('agotado');
  });

  test('sin categorias, no revienta y deja la clasificacion en null', () => {
    const mapped = mapSterenProduct(MONITOR, CONFIG, 'HNL');
    expect(mapped?.store_category_external_id).toBeNull();
    expect(mapped?.category_raw).toBeNull();
    expect(mapped?.category_path).toEqual([]);
  });

  test('rating_summary (escala 0-100) se convierte a 0-5 solo si hay resenas', () => {
    expect(mapSterenProduct(SUBWOOFER, CONFIG, 'HNL')?.rating_average).toBeNull();
    expect(mapSterenProduct(SUBWOOFER, CONFIG, 'HNL')?.rating_count).toBe(0);

    const rated = mapSterenProduct({ ...SUBWOOFER, rating_summary: 90, review_count: 2 }, CONFIG, 'HNL');
    expect(rated?.rating_average).toBe(4.5);
    expect(rated?.rating_count).toBe(2);
  });

  test('la galeria de imagenes descarta las deshabilitadas', () => {
    const mapped = mapSterenProduct(SUBWOOFER, CONFIG, 'HNL');
    expect(mapped?.images).toHaveLength(1);
    expect(mapped?.images?.every((img) => !img.url.includes('hidden'))).toBe(true);
    expect(mapped?.primary_image_url).toBe(SUBWOOFER.media_gallery[0].url);
  });

  test('sin galeria, cae al thumbnail', () => {
    const mapped = mapSterenProduct(CORREA, CONFIG, 'HNL');
    expect(mapped?.images).toEqual([]);
    expect(mapped?.primary_image_url).toBeNull();
  });

  test('descarta un resultado sin sku, nombre o url', () => {
    expect(mapSterenProduct({ ...SUBWOOFER, sku: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapSterenProduct({ ...SUBWOOFER, name: '   ' }, CONFIG, 'HNL')).toBeNull();
    expect(
      mapSterenProduct({ ...SUBWOOFER, canonical_url: null, url_key: null }, CONFIG, 'HNL'),
    ).toBeNull();
  });

  test('brand_raw queda en null: manufacturer es un id de atributo sin resolver', () => {
    expect(mapSterenProduct(SUBWOOFER, CONFIG, 'HNL')?.brand_raw).toBeNull();
  });
});
