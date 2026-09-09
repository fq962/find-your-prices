import { describe, expect, test } from 'vitest';
import { buildRadioShackUrl, mapRadioShackProduct, round2, stripHtml } from './radioshack';

/**
 * Los casos de abajo salen de datos reales: un producto tal cual lo devuelve
 * https://www.radioshackla.com/honduras/graphql (endpoint publico de Adobe
 * Commerce/Magento, header "Store: rso_honduras_sv"). Si RadioShack cambia el
 * esquema de su GraphQL, estas pruebas fallan antes de que el scraper guarde
 * precios o categorias inventadas en la base.
 */

const CONFIG = { webBaseUrl: 'https://www.radioshackla.com/honduras' };

/** Articulo real con rebaja de verdad y jerarquia de 4 categorias. */
const JBL_AUDIFONOS = {
  sku: '470027100012',
  uid: 'Mjk3ODk1Mg==',
  name: 'Audífonos Inalámbricos JBL In Ear Ghost Black Tune Flex 2',
  canonical_url: 'audifonos-inalambricos-jbl-in-ear-ghost-black-tune-flex-2-470027100012/p',
  url_key: 'audifonos-inalambricos-jbl-in-ear-ghost-black-tune-flex-2-470027100012',
  stock_status: 'IN_STOCK' as const,
  quantity: null,
  only_x_left_in_stock: null,
  rating_summary: 0,
  review_count: 0,
  meta_title: null,
  meta_description: null,
  description: { html: '<p>Los Audífonos <strong>JBL Tune Flex 2</strong> combinan comodidad y sonido.</p>' },
  short_description: { html: '' },
  image: {
    url: 'https://www.radioshackla.com/media/catalog/product/4/7/470027100012_1.jpg',
    label: 'Audífonos Inalámbricos JBL In Ear Ghost Black Tune Flex 2',
  },
  media_gallery: [
    {
      url: 'https://www.radioshackla.com/media/catalog/product/4/7/470027100012_1.jpg',
      label: 'foto 1',
      position: 0,
      disabled: false,
    },
    {
      url: 'https://www.radioshackla.com/media/catalog/product/4/7/470027100012_2.jpg',
      label: 'foto 2',
      position: 1,
      disabled: false,
    },
    {
      url: 'https://www.radioshackla.com/media/catalog/product/4/7/470027100012_hidden.jpg',
      label: 'oculta',
      position: 2,
      disabled: true,
    },
  ],
  price_range: {
    minimum_price: {
      regular_price: { value: 2699, currency: 'HNL' },
      final_price: { value: 2497, currency: 'HNL' },
      discount: { amount_off: 202, percent_off: 7.48 },
    },
  },
  categories: [
    { uid: 'MTMyMA==', name: 'Productos', url_path: 'c' },
    { uid: 'MTMyMw==', name: 'Audio', url_path: 'c/audio' },
    { uid: 'MTM1Ng==', name: 'Audífonos', url_path: 'c/audio/audifonos' },
    { uid: 'MTQ4Mg==', name: 'Audífonos inalámbricos', url_path: 'c/audio/audifonos/audifonos-inalambricos' },
  ],
};

/** Articulo real SIN rebaja (regular == final) y con nombre con espacio inicial. */
const ALMOHADILLA = {
  sku: '437473100003',
  uid: 'Njg1Njc4',
  name: ' Almohadilla para Mouse RadioShack 2607009 Azul',
  canonical_url: 'almohadilla-para-mouse-radioshack-2607009-azul-437473100003/p',
  url_key: 'almohadilla-para-mouse-radioshack-2607009-azul-437473100003',
  stock_status: 'IN_STOCK' as const,
  quantity: null,
  only_x_left_in_stock: null,
  rating_summary: 80,
  review_count: 3,
  meta_title: 'Almohadilla para Mouse',
  meta_description: 'Comodidad para tu muñeca.',
  description: { html: '' },
  short_description: { html: '' },
  image: null,
  media_gallery: [],
  price_range: {
    minimum_price: {
      regular_price: { value: 199, currency: 'HNL' },
      final_price: { value: 199, currency: 'HNL' },
      discount: { amount_off: 0, percent_off: 0 },
    },
  },
  categories: [{ uid: 'MTMyMA==', name: 'Productos', url_path: 'c' }],
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
    expect(stripHtml('<p>Los Audífonos <strong>JBL</strong> combinan comodidad.</p>')).toBe(
      'Los Audífonos JBL combinan comodidad.',
    );
  });

  test('vacio o nulo da cadena vacia', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

describe('buildRadioShackUrl', () => {
  test('usa canonical_url cuando esta presente', () => {
    expect(buildRadioShackUrl(JBL_AUDIFONOS, CONFIG.webBaseUrl)).toBe(
      'https://www.radioshackla.com/honduras/audifonos-inalambricos-jbl-in-ear-ghost-black-tune-flex-2-470027100012/p',
    );
  });

  test('arma la url desde url_key si canonical_url falta', () => {
    expect(buildRadioShackUrl({ canonical_url: null, url_key: 'foo-123' }, CONFIG.webBaseUrl)).toBe(
      'https://www.radioshackla.com/honduras/foo-123/p',
    );
  });

  test('null si no hay ni canonical_url ni url_key', () => {
    expect(buildRadioShackUrl({ canonical_url: null, url_key: null }, CONFIG.webBaseUrl)).toBeNull();
  });
});

describe('mapRadioShackProduct', () => {
  test('usa sku como identidad y arma la url publica', () => {
    const mapped = mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL');
    expect(mapped?.external_id).toBe('470027100012');
    expect(mapped?.sku).toBe('470027100012');
    expect(mapped?.url).toContain('/audifonos-inalambricos-jbl-in-ear-ghost-black-tune-flex-2-470027100012/p');
  });

  test('calcula precio de lista solo cuando regular es de verdad mayor', () => {
    const mapped = mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL');
    expect(mapped?.price).toBe(2497);
    expect(mapped?.list_price).toBe(2699);
    expect(mapped?.discount_percent).toBe(7.48);
    expect(mapped?.discount_amount).toBe(202);
  });

  test('sin rebaja de verdad, list_price y discount quedan en null', () => {
    const mapped = mapRadioShackProduct(ALMOHADILLA, CONFIG, 'HNL');
    expect(mapped?.price).toBe(199);
    expect(mapped?.list_price).toBeNull();
    expect(mapped?.discount_percent).toBeNull();
    expect(mapped?.discount_amount).toBeNull();
  });

  test('recorta espacios del nombre', () => {
    expect(mapRadioShackProduct(ALMOHADILLA, CONFIG, 'HNL')?.name).toBe('Almohadilla para Mouse RadioShack 2607009 Azul');
  });

  test('la categoria hoja es la ultima del array raiz -> hoja', () => {
    const mapped = mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL');
    expect(mapped?.store_category_external_id).toBe('MTQ4Mg==');
    expect(mapped?.category_raw).toBe('Audífonos inalámbricos');
    expect(mapped?.category_path).toEqual(['Productos', 'Audio', 'Audífonos', 'Audífonos inalámbricos']);
  });

  test('stock_status se traduce a disponibilidad normalizada', () => {
    const inStock = mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL');
    expect(inStock?.availability).toBe('in_stock');
    expect(inStock?.in_stock).toBe(true);

    const outOfStock = mapRadioShackProduct({ ...JBL_AUDIFONOS, stock_status: 'OUT_OF_STOCK' }, CONFIG, 'HNL');
    expect(outOfStock?.availability).toBe('out_of_stock');
    expect(outOfStock?.in_stock).toBe(false);
    expect(outOfStock?.badges).toContain('agotado');
  });

  test('rating_summary (escala 0-100) se convierte a 0-5 solo si hay reseñas', () => {
    expect(mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL')?.rating_average).toBeNull();
    expect(mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL')?.rating_count).toBe(0);

    const rated = mapRadioShackProduct(ALMOHADILLA, CONFIG, 'HNL');
    expect(rated?.rating_average).toBe(4);
    expect(rated?.rating_count).toBe(3);
  });

  test('la galeria de imagenes descarta las deshabilitadas', () => {
    const mapped = mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL');
    expect(mapped?.images).toHaveLength(2);
    expect(mapped?.images?.every((img) => !img.url.includes('hidden'))).toBe(true);
    expect(mapped?.primary_image_url).toBe(JBL_AUDIFONOS.media_gallery[0].url);
  });

  test('sin galeria, cae al campo image', () => {
    const mapped = mapRadioShackProduct(ALMOHADILLA, CONFIG, 'HNL');
    expect(mapped?.images).toEqual([]);
    expect(mapped?.primary_image_url).toBeNull();
  });

  test('descarta un resultado sin sku, nombre o url', () => {
    expect(mapRadioShackProduct({ ...JBL_AUDIFONOS, sku: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapRadioShackProduct({ ...JBL_AUDIFONOS, name: '   ' }, CONFIG, 'HNL')).toBeNull();
    expect(
      mapRadioShackProduct({ ...JBL_AUDIFONOS, canonical_url: null, url_key: null }, CONFIG, 'HNL'),
    ).toBeNull();
  });

  test('brand_raw queda en null: custom_attributesV2 responde 500 en esta tienda', () => {
    expect(mapRadioShackProduct(JBL_AUDIFONOS, CONFIG, 'HNL')?.brand_raw).toBeNull();
  });
});
