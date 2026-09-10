import { describe, expect, test } from 'vitest';
import {
  barcodeFromVariants,
  buildPriceSmartUrl,
  collectCategories,
  mapPriceSmartProduct,
  minorToMajor,
  toAvailability,
  toNumber,
} from './pricesmart';

/**
 * Los casos de abajo salen de datos reales: documentos tal cual los devuelve
 * https://www.pricesmart.com/api/br_discovery/getProductsByKeyword (proxy del
 * sitio hacia Bloomreach Discovery) para el catalogo de Honduras, tomados el
 * 2026-09-10. Si PriceSmart cambia el contrato, estas pruebas fallan antes de
 * que el scraper guarde precios o enlaces inventados en la base.
 */

const CONFIG = { webBaseUrl: 'https://www.pricesmart.com', localePath: 'es-hn' };

/** Articulo con rebaja real. `original_price_without_saving_HN` viene en unidades. */
const KRAFT_BBQ = {
  pid: '50630',
  title: 'Kraft Salsa Barbacoa Original Cocida a Fuego Lento 2.3 kg',
  brand: 'Kraft',
  slug: 'kraft-salsa-barbacoa-original-cocida-a-fuego-lento-2-3-kg-50630',
  master_sku: '50630',
  description:
    'Eleva tus parrilladas y platillos a la excelencia culinaria con la Salsa Barbacoa de Sabor Original.',
  thumb_image:
    'https://d31f1ehqijlcua.cloudfront.net/n/c/f/1/d/cf1d31f2f7329a00a4b9111db101e28fa7a15f7d_Condiments_50630_01.jpg',
  // La API repite estos dos en 0 para todo el catalogo: el precio real es price_HN.
  price: 0,
  sale_price: 0,
  price_HN: 21995,
  fractionDigits: 2,
  currency: 'HNL',
  inventory_HN: 'in stock',
  availability_HN: 'true',
  original_price_without_saving_HN: '279.95',
  saving_amount_HN: '-60.0',
  promoid_HN: ['free-delivery', 'b2b-main', 'manufacturer savings', 'oktober-fest'],
  // Apunta al sitio de Costa Rica: no se usa.
  url: 'https://www.pricesmart.com/site/cr/es/pagina-producto/50630',
  variants: [{ skuid: '50630' }],
};

/** Articulo con variantes: sus skuid llevan el codigo de barras pegado al pid. */
const KINDER = {
  pid: '317825',
  title: 'Kinder Sorpresa 12 Unidades / 20 g',
  brand: 'Kinder',
  slug: 'kinder-sorpresa-12-unidades-20-g-317825',
  master_sku: '317825-8000500142943',
  description: 'Kinder Sorpresa contiene el sabor del chocolate Kinder.',
  thumb_image:
    'https://d31f1ehqijlcua.cloudfront.net/n/b/3/1/7/b3173e90d32942e76a7a440ab49c4911e2287ed7_CandyOrange_317825_01.jpg',
  price: 0,
  price_HN: 49995,
  fractionDigits: 2,
  currency: 'HNL',
  inventory_HN: 'in stock',
  availability_HN: 'true',
  promoid_HN: ['free-delivery', 'b2b-snacks', 'sweet-table'],
  variants: [
    { skuid: '317825' },
    { skuid: '317825-8000500142943' },
    { skuid: '317825-8000500142967' },
    { skuid: '317825-8000500142981' },
  ],
};

/** Articulo agotado y sin rebaja. */
const MUFFINS = {
  pid: '279042',
  title: "Member's Selection Muffins Sabores Variados Recién Horneados 35 Unidades",
  brand: "Member's Selection",
  slug: 'members-selection-muffins-sabores-variados-recien-horneados-35-unidades-279042',
  master_sku: '279042',
  thumb_image:
    'https://d31f1ehqijlcua.cloudfront.net/n/f/f/4/5/ff455cb957cda2d410f326447b6eb84e5aa2e376_Muffin_279042_01.jpg',
  price: 0,
  price_HN: 84995,
  fractionDigits: 2,
  currency: 'HNL',
  // availability_HN dice "true" incluso agotado: la señal real es inventory_HN.
  inventory_HN: 'out of stock',
  availability_HN: 'true',
  promoid_HN: ['b2b-oils', 'ms-top-sellers'],
  variants: [{ skuid: '279042' }],
};

describe('pricesmart / url publica', () => {
  /**
   * Estas dos urls estan copiadas del sitemap de PriceSmart. La verificacion
   * completa (707 productos del barrido contra el sitemap) dio 707 exactas y 0
   * diferencias; acá quedan congeladas las dos formas que existen: master_sku
   * igual al pid, y master_sku con el codigo de barras pegado.
   */
  test('reconstruye la url exacta que publica el sitemap', () => {
    expect(buildPriceSmartUrl(KRAFT_BBQ, CONFIG)).toBe(
      'https://www.pricesmart.com/es-hn/producto/kraft-salsa-barbacoa-original-cocida-a-fuego-lento-2-3-kg-50630/50630',
    );
    expect(
      buildPriceSmartUrl(
        {
          slug: 'kitchenaid-juego-de-guantes-para-horno-4-piezas-487508',
          master_sku: '487508-0028332852241',
          pid: '487508',
        },
        CONFIG,
      ),
    ).toBe(
      'https://www.pricesmart.com/es-hn/producto/kitchenaid-juego-de-guantes-para-horno-4-piezas-487508/487508-0028332852241',
    );
  });

  test('cae al pid cuando falta master_sku, y devuelve null sin slug', () => {
    expect(buildPriceSmartUrl({ slug: 'algo-123', master_sku: null, pid: '123' }, CONFIG)).toBe(
      'https://www.pricesmart.com/es-hn/producto/algo-123/123',
    );
    expect(buildPriceSmartUrl({ slug: null, master_sku: '123', pid: '123' }, CONFIG)).toBeNull();
  });
});

describe('pricesmart / conversiones', () => {
  test('price_HN viene en centavos y se convierte con fractionDigits', () => {
    expect(minorToMajor(21995, 2)).toBe(219.95);
    expect(minorToMajor(1329908, 2)).toBe(13299.08);
    // Monedas sin decimales (otra vista de la misma cuenta de Bloomreach).
    expect(minorToMajor(21995, 0)).toBe(21995);
    expect(minorToMajor(null, 2)).toBeNull();
  });

  test('toNumber no confunde vacio con cero', () => {
    expect(toNumber('279.95')).toBe(279.95);
    expect(toNumber('-60.0')).toBe(-60);
    expect(toNumber(0)).toBe(0);
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });

  test('la disponibilidad sale de inventory_HN, no de availability_HN', () => {
    expect(toAvailability('in stock')).toBe('in_stock');
    expect(toAvailability('out of stock')).toBe('out_of_stock');
    expect(toAvailability(null)).toBe('unknown');
  });

  test('el codigo de barras sale del skuid con forma pid-gtin', () => {
    expect(barcodeFromVariants(KINDER)).toBe('8000500142943');
    // Sin variantes con esa forma no se inventa nada.
    expect(barcodeFromVariants(KRAFT_BBQ)).toBeNull();
  });
});

describe('pricesmart / mapeo de producto', () => {
  test('mapea un articulo con rebaja real', () => {
    const product = mapPriceSmartProduct(KRAFT_BBQ, CONFIG, 'HNL', 'G10D03')!;

    expect(product.external_id).toBe('50630');
    expect(product.name).toBe('Kraft Salsa Barbacoa Original Cocida a Fuego Lento 2.3 kg');
    expect(product.price).toBe(219.95);
    expect(product.list_price).toBe(279.95);
    expect(product.discount_amount).toBe(60);
    expect(product.discount_percent).toBe(21.43);
    expect(product.availability).toBe('in_stock');
    expect(product.in_stock).toBe(true);
    expect(product.brand_raw).toBe('Kraft');
    expect(product.store_category_external_id).toBe('G10D03');
    expect(product.badges).toContain('descuento');
    expect(product.badges).toContain('envio gratis');
    // El precio de PriceSmart es el precio de socio.
    expect(product.member_price).toBe(219.95);
    expect(product.raw).toBe(KRAFT_BBQ);
  });

  test('sin rebaja no se inventa precio de lista ni descuento', () => {
    const product = mapPriceSmartProduct(MUFFINS, CONFIG, 'HNL', 'G10D03')!;

    expect(product.price).toBe(849.95);
    expect(product.list_price).toBeNull();
    expect(product.discount_amount).toBeNull();
    expect(product.discount_percent).toBeNull();
    expect(product.badges).not.toContain('descuento');
    expect(product.availability).toBe('out_of_stock');
    expect(product.in_stock).toBe(false);
    expect(product.badges).toContain('agotado');
  });

  test('external_id es el pid, no el master_sku que cambia con las variantes', () => {
    const product = mapPriceSmartProduct(KINDER, CONFIG, 'HNL', 'G10D03')!;

    // master_sku pasa de "317825" a "317825-8000500142943" cuando cambian las
    // presentaciones: usarlo de llave partiria el historico de precios.
    expect(product.external_id).toBe('317825');
    expect(product.external_code).toBe('317825-8000500142943');
    expect(product.barcode_raw).toBe('8000500142943');
    expect(product.variants).toHaveLength(4);
    expect(product.variants?.[1]).toMatchObject({
      external_id: '317825-8000500142943',
      barcode_raw: '8000500142943',
      price: 499.95,
    });
  });

  test('una sola variante que es el propio articulo no se guarda', () => {
    expect(mapPriceSmartProduct(KRAFT_BBQ, CONFIG, 'HNL', null)!.variants).toEqual([]);
  });

  test('descarta articulos sin identificador, sin nombre o sin url', () => {
    expect(mapPriceSmartProduct({ ...KRAFT_BBQ, pid: null }, CONFIG, 'HNL', null)).toBeNull();
    expect(mapPriceSmartProduct({ ...KRAFT_BBQ, title: '  ' }, CONFIG, 'HNL', null)).toBeNull();
    expect(mapPriceSmartProduct({ ...KRAFT_BBQ, slug: null }, CONFIG, 'HNL', null)).toBeNull();
  });
});

describe('pricesmart / arbol de categorias', () => {
  /** Facet real de la consulta a Mascotas (P10D51). */
  const FACETS = [
    { cat_id: 'P10D51', cat_name: 'Mascotas', crumb: '/P10D51', parent: '', count: 37 },
    {
      cat_id: 'P10D51004',
      cat_name: 'Alimento y golosinas para perros',
      crumb: '/P10D51/P10D51004',
      parent: 'P10D51',
      count: 13,
    },
    {
      cat_id: 'S20D23020',
      cat_name: 'Aspiradoras y cuidado de pisos',
      crumb: '/S20D23/S20D23020',
      parent: 'S20D23',
      count: 1,
    },
  ];

  test('arma la jerarquia con nombres y nivel a partir del facet', () => {
    const into = new Map();
    collectCategories(FACETS, into);

    expect(into.get('P10D51')).toMatchObject({
      external_id: 'P10D51',
      name: 'Mascotas',
      external_parent_id: null,
      level: 1,
      product_count: 37,
    });
    expect(into.get('P10D51004')).toMatchObject({
      external_parent_id: 'P10D51',
      level: 2,
      product_count: 13,
    });
    // Un articulo cruzado arrastra categorias de otro departamento: se guardan
    // igual, con su padre correcto.
    expect(into.get('S20D23020')).toMatchObject({ external_parent_id: 'S20D23', level: 2 });
  });

  test('la misma categoria vista dos veces se queda con el conteo mayor', () => {
    const into = new Map();
    collectCategories(FACETS, into);
    // La consulta a Electrodomesticos ve esa categoria completa.
    collectCategories(
      [{ cat_id: 'S20D23020', cat_name: 'Aspiradoras y cuidado de pisos', crumb: '/S20D23/S20D23020', parent: 'S20D23', count: 18 }],
      into,
    );

    expect(into.get('S20D23020').product_count).toBe(18);
  });

  test('descarta entradas sin id o sin nombre', () => {
    const into = new Map();
    collectCategories([{ cat_id: '', cat_name: 'X' }, { cat_id: 'A', cat_name: null }], into);
    expect(into.size).toBe(0);
  });
});
