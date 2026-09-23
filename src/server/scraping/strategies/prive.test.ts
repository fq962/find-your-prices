import { describe, expect, test } from 'vitest';
import {
  genderOf,
  isCombinedListingParent,
  isGiftCard,
  mapPriveProduct,
  millilitersOf,
  presentationOf,
  priveStrategy,
} from './prive';
import type { ShopifyProduct } from './ladylee';

/**
 * Los casos salen de datos reales: productos tal cual los devuelve
 * https://priveperfumes.com/collections/all/products.json (2026-09-22), con la
 * descripcion recortada. Si Prive cambia la forma de agrupar tamaños o de
 * rotular genero y concentracion, estas pruebas fallan antes de que el scraper
 * duplique el catalogo o pierda el tamaño.
 */

const TAMANO_OPTIONS = [{ name: 'Tamaño', position: 1, values: ['100 ml', '170 ml'] }];
const DEFAULT_OPTIONS = [{ name: 'Title', position: 1, values: ['Default Title'] }];

/** Ficha agrupadora (Combined Listings): sus dos tamaños existen como productos propios. */
const PARENT_4711: ShopifyProduct = {
  id: 8200276049989,
  title: '4711 Acqua Colonia Pink Pepper & Grapefruit EDC (U)',
  handle: 'echt-kolnisch-wasser-no-4711-acqua-colonia-pink-pepper-grapefruit-edc-u',
  body_html: '',
  vendor: '4711',
  product_type: '',
  tags: ['combined_listing', 'commercial', 'Concentración_Eau de Cologne', 'global', 'jmcl_9c967f394fa1', 'Para_Unisex'],
  variants: [
    { id: 42510369325125, title: '100 ml', option1: '100 ml', option2: 'Default Title', option3: null, sku: 'G809456', available: true, price: '1250.00', compare_at_price: null, grams: 454 },
    { id: 44817478680645, title: '170 ml', option1: '170 ml', option2: 'Default Title', option3: null, sku: 'G810347', available: true, price: '1405.00', compare_at_price: null, grams: 0 },
  ],
  images: [],
  options: TAMANO_OPTIONS,
};

/** Hijo de la ficha anterior: mismo id de variante, un solo tamaño. */
const CHILD_4711: ShopifyProduct = {
  id: 7559401013317,
  title: '4711 Acqua Colonia Pink Pepper & Grapefruit EDC (U) / 100 ml',
  handle: 'perfume-echt-kolnisch-wasser-no-4711-acqua-colonia-pink-pepper-grapefruit-edc-u-100-ml',
  body_html:
    '<p><b>4711 Acqua Colonia Pink Pepper &amp; Grapefruit</b> de <b>Muelhens</b> es una fragancia de la familia olfativa Aromática Especiada.</p>',
  vendor: '4711',
  product_type: 'Perfume',
  tags: ['commercial', 'Concentración_Eau de Cologne', 'global', 'jmcl_9c967f394fa1', 'new-release', 'Para_Unisex'],
  variants: [
    { id: 42510369325125, title: '100 ml', option1: '100 ml', option2: 'Default Title', option3: null, sku: 'G809456', available: true, price: '1250.00', compare_at_price: null, grams: 454 },
  ],
  images: [
    {
      id: 36476365340741,
      position: 1,
      src: 'https://cdn.shopify.com/s/files/1/0196/2088/8676/files/perfume-4711-acqua-colonia-pink-pepper-grapefruit-edc-u-100-ml-1-prive-perfumes.webp?v=1786691511',
      width: 500,
      height: 500,
    },
  ],
  options: TAMANO_OPTIONS,
};

/** Rebaja real (2355 -> 1649), "Default Title" y el tamaño solo en el nombre. */
const AFNAN: ShopifyProduct = {
  id: 7060595867717,
  title: 'Afnan Her Highness IV Red EDP (W) / 100 ml',
  handle: 'perfume-afnan-her-highness-iv-red-edp-w-100-ml',
  body_html: '<p><b>Highness IV</b> de <b>Afnan</b> es una fragancia de la familia olfativa Oriental Vainilla.</p>',
  vendor: 'Afnan',
  product_type: 'Perfume',
  tags: ['arabe', 'bf-2024-arabe', 'black-friday-clearance', 'Concentración_Eau de Parfum', 'd2025-cyber-monday-c', 'Para_Damas'],
  variants: [
    { id: 41082165493829, title: 'Default Title', option1: 'Default Title', option2: null, option3: null, sku: 'G805857', available: true, price: '1649.00', compare_at_price: '2355.00', grams: 454 },
  ],
  images: [],
  options: DEFAULT_OPTIONS,
};

/** Estuche: la presentacion no es un frasco suelto, no hay precio por ml. */
const ESTUCHE: ShopifyProduct = {
  id: 8240086581317,
  title: 'Antonio Banderas Her Secret Desire EDT (W) / 2 Pc SP 80 ml; BL 75 ml',
  handle: 'estuche-antonio-banderas-her-secret-desire-edt-w-2-pc-sp-80-ml-bl-75-ml',
  body_html: '',
  vendor: 'Antonio Banderas',
  product_type: 'Estuche',
  tags: ['autorizado', 'commercial', 'Concentración_Eau de Toilette', 'new-august-2026', 'Para_Damas', 'remarco', 'VINETA-DIV8'],
  variants: [
    { id: 45584890822725, title: 'Estuche 80 ml · Kit 2', option1: 'Estuche 80 ml · Kit 2', option2: 'Default Title', option3: null, sku: 'R810806', available: true, price: '1215.00', compare_at_price: null, grams: 0 },
  ],
  images: [],
  options: [{ name: 'Tamaño', position: 1, values: ['Estuche 80 ml · Kit 2'] }],
};

/** Sin tag Para_: el genero sale del rotulo del titulo. */
const MUJERES: ShopifyProduct = {
  id: 7766232825925,
  title: 'Antonio Banderas The Icon Supreme EDP (Mujeres) / 100 ml',
  handle: 'perfume-antonio-banderas-the-icon-supreme-edp-mujeres-100-ml',
  body_html: '',
  vendor: 'Antonio Banderas',
  product_type: 'Perfume',
  tags: ['autorizado', 'commercial', 'Concentración_Eau de Parfum', 'new-august-2026', 'remarco', 'RMC-ACTIVE-DIV8'],
  variants: [
    { id: 43583954714693, title: 'Default Title', option1: 'Default Title', option2: null, option3: null, sku: 'R809966', available: false, price: '1277.00', compare_at_price: null, grams: 454 },
  ],
  images: [],
  options: DEFAULT_OPTIONS,
};

const GIFT_CARD: ShopifyProduct = {
  id: 7827730726981,
  title: 'Gift Card - Tarjeta Física',
  handle: 'gift-cards-gift-card-tarjeta-fisica',
  body_html: '',
  vendor: 'Prive Perfumes',
  product_type: 'Gift Cards',
  tags: ['commercial', 'global'],
  variants: [
    { id: 43945700098117, title: 'L 1500', option1: 'L 1500', option2: null, option3: null, sku: 'E809999', available: true, price: '1500.00', compare_at_price: null, grams: 0 },
  ],
  images: [],
  options: [{ name: 'Monto', position: 1, values: ['L 1500'] }],
};

describe('filtros', () => {
  test('descarta la ficha agrupadora y conserva el hijo', () => {
    expect(isCombinedListingParent(PARENT_4711)).toBe(true);
    expect(isCombinedListingParent(CHILD_4711)).toBe(false);
    expect(mapPriveProduct(PARENT_4711, 'HNL')).toBeNull();
    expect(mapPriveProduct(CHILD_4711, 'HNL')).not.toBeNull();
  });

  test('descarta gift cards', () => {
    expect(isGiftCard(GIFT_CARD)).toBe(true);
    expect(isGiftCard(AFNAN)).toBe(false);
    expect(mapPriveProduct(GIFT_CARD, 'HNL')).toBeNull();
  });
});

describe('presentacion y mililitros', () => {
  test('usa el titulo de la variante cuando es real', () => {
    expect(presentationOf(CHILD_4711)).toBe('100 ml');
    expect(presentationOf(ESTUCHE)).toBe('Estuche 80 ml · Kit 2');
  });

  test('con "Default Title" la saca del nombre', () => {
    expect(presentationOf(AFNAN)).toBe('100 ml');
  });

  test('solo un frasco suelto da mililitros', () => {
    expect(millilitersOf('100 ml')).toBe(100);
    expect(millilitersOf('50 ml UL')).toBe(50);
    expect(millilitersOf('7,5 ml')).toBe(7.5);
    expect(millilitersOf('Estuche 80 ml · Kit 2')).toBeNull();
    expect(millilitersOf('3 Pc SP 100 ml; SG 100 ml; Mini SP 15 ml UL')).toBeNull();
    expect(millilitersOf(null)).toBeNull();
  });
});

describe('genero', () => {
  test('sale del tag Para_', () => {
    expect(genderOf(AFNAN)).toBe('mujer');
    expect(genderOf(CHILD_4711)).toBe('unisex');
  });

  test('sin tag, del rotulo del titulo', () => {
    expect(genderOf(MUJERES)).toBe('mujer');
  });
});

describe('mapPriveProduct', () => {
  test('arma url, precio y tamaño del hijo', () => {
    const p = mapPriveProduct(CHILD_4711, 'HNL', { handle: 'perfumeria-comercial', title: 'Perfumería Comercial' })!;
    expect(p.external_id).toBe('7559401013317');
    expect(p.url).toBe(
      'https://priveperfumes.com/products/perfume-echt-kolnisch-wasser-no-4711-acqua-colonia-pink-pepper-grapefruit-edc-u-100-ml',
    );
    expect(p.price).toBe(1250);
    expect(p.list_price).toBeNull();
    expect(p.sku).toBe('G809456');
    expect(p.brand_raw).toBe('4711');
    expect(p.size).toBe('100 ml');
    expect(p.unit_amount).toBe(100);
    expect(p.unit_measure_code).toBe('ml');
    expect(p.variants).toEqual([]);
    expect(p.store_category_external_id).toBe('perfumeria-comercial');
    expect(p.primary_image_url).toContain('cdn.shopify.com');
    expect(p.specs).toMatchObject({ Concentración: 'Eau de Cologne', Presentación: '100 ml', Género: 'unisex' });
    expect(p).not.toHaveProperty('raw');
  });

  test('conserva la rebaja real', () => {
    const p = mapPriveProduct(AFNAN, 'HNL')!;
    expect(p.price).toBe(1649);
    expect(p.list_price).toBe(2355);
    expect(p.discount_percent).toBeCloseTo(29.98, 2);
    expect(p.badges).toContain('descuento');
  });

  test('deja fuera los tags de campaña, que rotan', () => {
    const p = mapPriveProduct(AFNAN, 'HNL')!;
    expect(p.tags).toEqual(['arabe', 'Concentración_Eau de Parfum', 'Para_Damas']);
  });

  test('estuche sin mililitros y agotado marcado', () => {
    expect(mapPriveProduct(ESTUCHE, 'HNL')!.unit_amount).toBeNull();
    const agotado = mapPriveProduct(MUJERES, 'HNL')!;
    expect(agotado.in_stock).toBe(false);
    expect(agotado.availability).toBe('out_of_stock');
  });
});

test('estrategia registrada con la clave de la tienda', () => {
  expect(priveStrategy.key).toBe('prive');
  expect(priveStrategy.supports).toEqual(['full_catalog', 'category']);
});
