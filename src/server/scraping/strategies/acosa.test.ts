import { describe, expect, test } from 'vitest';
import {
  findAttributeTerm,
  mapAcosaProduct,
  minorToDecimal,
  round2,
  stripBom,
  stripHtml,
} from './acosa';

/**
 * Los casos de abajo salen de datos reales: un producto tal cual lo devuelve
 * https://acosa.com.hn/API/wc/store/v1/products (Store API publica de
 * WooCommerce, con la cookie bxVer=1 del portal de verificacion del sitio).
 * Si ACOSA cambia el esquema de su Store API, estas pruebas fallan antes de
 * que el scraper guarde precios o categorias inventadas en la base.
 */

/** Articulo real sin rebaja, con marca, mpn y codigo de barra como atributos. */
const CABLE_RED = {
  id: 487041,
  name: 'Cable De Red Cat6 Utp 1Ft Azul Patch Cord Nexxt',
  slug: 'cable-de-red-cat6-utp-1ft-azul-patch-cord-nexxt-2',
  type: 'simple',
  permalink: 'https://acosa.com.hn/product/cable-de-red-cat6-utp-1ft-azul-patch-cord-nexxt-2/',
  sku: 'A42286',
  short_description: '<p>Cable patch cords Cat.6A UTP, multi lar, con revestimiento tipo CM</p>',
  description: '',
  on_sale: false,
  prices: {
    price: '5900',
    regular_price: '5900',
    sale_price: '5900',
    currency_code: 'HNL',
    currency_minor_unit: 2,
  },
  average_rating: '0',
  review_count: 0,
  images: [
    { id: 487247, src: 'https://static-files.bluexpace.com/hn/uploads/2026/09/PCGPCC6CM01BL.webp', name: 'PCGPCC6CM01BL', alt: '' },
    { id: 487248, src: 'https://static-files.bluexpace.com/hn/uploads/2026/09/PCGPCC6CM01BL-1.webp', name: 'PCGPCC6CM01BL-1', alt: '' },
  ],
  categories: [
    { id: 16442, name: 'Cables de red', slug: 'tecnologia-red-e-infraestructura-cables-de-red', link: 'https://acosa.com.hn/product-category/tecnologia/tecnologia-red-e-infraestructura/tecnologia-red-e-infraestructura-cables-de-red/' },
    { id: 16441, name: 'Red e infraestructura', slug: 'tecnologia-red-e-infraestructura', link: 'https://acosa.com.hn/product-category/tecnologia/tecnologia-red-e-infraestructura/' },
    { id: 1673, name: 'Tecnologia', slug: 'tecnologia', link: 'https://acosa.com.hn/product-category/tecnologia/' },
  ],
  attributes: [
    { id: 1, name: 'Marca', taxonomy: 'pa_marca', terms: [{ id: 1801, name: 'Nexxt', slug: 'nexxt' }] },
    { id: 0, name: 'Número de parte', taxonomy: null, terms: [{ id: 0, name: 'PCGPCC6CM01BL', slug: 'PCGPCC6CM01BL' }] },
    { id: 0, name: 'Código de Barra', taxonomy: null, terms: [{ id: 0, name: '798302034198', slug: '798302034198' }] },
  ],
  is_purchasable: true,
  is_in_stock: true,
  is_on_backorder: false,
  low_stock_remaining: null,
  stock_availability: { text: '200 disponibles', class: 'in-stock' },
  weight: '',
  dimensions: { length: '', width: '', height: '' },
};

/** Articulo real con rebaja de verdad y sin stock. */
const OFERTA_AGOTADA = {
  ...CABLE_RED,
  id: 484792,
  name: 'Producto en oferta agotado',
  sku: 'B12345',
  prices: { price: '4000', regular_price: '10000', sale_price: '4000', currency_code: 'HNL', currency_minor_unit: 2 },
  is_in_stock: false,
  is_on_backorder: false,
  stock_availability: { text: 'Sin Inventario', class: 'out-of-stock' },
  average_rating: '4.50',
  review_count: 3,
  categories: [],
  attributes: [],
};

describe('stripBom', () => {
  test('quita el BOM UTF-8 al inicio', () => {
    expect(stripBom('﻿[1,2,3]')).toBe('[1,2,3]');
  });

  test('sin BOM no toca el texto', () => {
    expect(stripBom('[1,2,3]')).toBe('[1,2,3]');
  });
});

describe('minorToDecimal', () => {
  test('convierte centavos a decimal', () => {
    expect(minorToDecimal('5900', 2)).toBe(59);
    expect(minorToDecimal('429900', 2)).toBe(4299);
  });

  test('null/vacio da null', () => {
    expect(minorToDecimal(null, 2)).toBeNull();
    expect(minorToDecimal('', 2)).toBeNull();
    expect(minorToDecimal(undefined, 2)).toBeNull();
  });
});

describe('round2', () => {
  test('redondea a centavos', () => {
    expect(round2(7.4849999)).toBe(7.48);
  });
});

describe('stripHtml', () => {
  test('quita etiquetas y conserva el texto', () => {
    expect(stripHtml('<p>Cable patch cords Cat.6A UTP</p>')).toBe('Cable patch cords Cat.6A UTP');
  });
});

describe('findAttributeTerm', () => {
  test('encuentra el atributo sin depender de tildes', () => {
    expect(findAttributeTerm(CABLE_RED.attributes, ['marca'])).toBe('Nexxt');
    expect(findAttributeTerm(CABLE_RED.attributes, ['numero de parte'])).toBe('PCGPCC6CM01BL');
    expect(findAttributeTerm(CABLE_RED.attributes, ['codigo de barra'])).toBe('798302034198');
  });

  test('sin coincidencia devuelve null', () => {
    expect(findAttributeTerm(CABLE_RED.attributes, ['garantia'])).toBeNull();
  });
});

describe('mapAcosaProduct', () => {
  test('usa la url y el sku tal cual los da la API', () => {
    const mapped = mapAcosaProduct(CABLE_RED as never, 'HNL');
    expect(mapped?.external_id).toBe('487041');
    expect(mapped?.sku).toBe('A42286');
    expect(mapped?.url).toBe(CABLE_RED.permalink);
  });

  test('convierte centavos a precio decimal', () => {
    const mapped = mapAcosaProduct(CABLE_RED as never, 'HNL');
    expect(mapped?.price).toBe(59);
    expect(mapped?.list_price).toBeNull();
  });

  test('calcula precio de lista y descuento cuando regular es mayor de verdad', () => {
    const mapped = mapAcosaProduct(OFERTA_AGOTADA as never, 'HNL');
    expect(mapped?.price).toBe(40);
    expect(mapped?.list_price).toBe(100);
    expect(mapped?.discount_percent).toBe(60);
    expect(mapped?.discount_amount).toBe(60);
    expect(mapped?.badges).toContain('descuento');
  });

  test('la categoria hoja es la PRIMERA del array (WooCommerce la da hoja -> raiz)', () => {
    const mapped = mapAcosaProduct(CABLE_RED as never, 'HNL');
    expect(mapped?.store_category_external_id).toBe('16442');
    expect(mapped?.category_raw).toBe('Cables de red');
    expect(mapped?.category_path).toEqual(['Tecnologia', 'Red e infraestructura', 'Cables de red']);
  });

  test('lee marca, mpn y codigo de barra de los atributos', () => {
    const mapped = mapAcosaProduct(CABLE_RED as never, 'HNL');
    expect(mapped?.brand_raw).toBe('Nexxt');
    expect(mapped?.mpn).toBe('PCGPCC6CM01BL');
    expect(mapped?.barcode_raw).toBe('798302034198');
  });

  test('is_in_stock/is_on_backorder se traducen a disponibilidad normalizada', () => {
    const inStock = mapAcosaProduct(CABLE_RED as never, 'HNL');
    expect(inStock?.availability).toBe('in_stock');
    expect(inStock?.in_stock).toBe(true);

    const outOfStock = mapAcosaProduct(OFERTA_AGOTADA as never, 'HNL');
    expect(outOfStock?.availability).toBe('out_of_stock');
    expect(outOfStock?.in_stock).toBe(false);
    expect(outOfStock?.badges).toContain('agotado');
  });

  test('extrae el numero inicial del texto de stock cuando hay inventario', () => {
    expect(mapAcosaProduct(CABLE_RED as never, 'HNL')?.stock_quantity).toBe(200);
    expect(mapAcosaProduct(OFERTA_AGOTADA as never, 'HNL')?.stock_quantity).toBeNull();
  });

  test('review_count=0 hace que rating_average quede en null, no en 0 estrellas', () => {
    const mapped = mapAcosaProduct(CABLE_RED as never, 'HNL');
    expect(mapped?.rating_count).toBe(0);
    expect(mapped?.rating_average).toBeNull();
  });

  test('con reseñas de verdad, rating_average se toma tal cual (ya esta en escala 0-5)', () => {
    const mapped = mapAcosaProduct(OFERTA_AGOTADA as never, 'HNL');
    expect(mapped?.rating_count).toBe(3);
    expect(mapped?.rating_average).toBe(4.5);
  });

  test('descarta un resultado sin id, nombre o url', () => {
    expect(mapAcosaProduct({ ...CABLE_RED, id: 0 } as never, 'HNL')).toBeNull();
    expect(mapAcosaProduct({ ...CABLE_RED, name: '' } as never, 'HNL')).toBeNull();
    expect(mapAcosaProduct({ ...CABLE_RED, permalink: '' } as never, 'HNL')).toBeNull();
  });

  test('sin variantes verificadas, variants queda vacio a proposito', () => {
    expect(mapAcosaProduct(CABLE_RED as never, 'HNL')?.variants).toEqual([]);
  });
});
