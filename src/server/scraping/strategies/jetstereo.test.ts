import { describe, expect, test } from 'vitest';
import { mapJetstereoProduct, round2, stripHtml } from './jetstereo';

/**
 * Los casos de abajo salen de datos reales: resultados tal cual los devuelve
 * https://jetstereo-search-engine.ent.us-west-1.aws.found.io/api/as/v1/engines
 * /jetstereo-main-engine/search (clave publica de busqueda). Si Jetstereo
 * cambia el esquema de su indice, estas pruebas fallan antes de que el
 * scraper guarde precios o categorias inventadas en la base.
 */

const CONFIG = { webBaseUrl: 'https://www.jetstereo.com' };

/** Articulo real con rebaja de verdad y jerarquia de 2 categorias. */
const HONOR_X6E = {
  id: { raw: '16922' },
  name: { raw: 'Honor X6e/ 4GB RAM/ 256GB/ Midnight Black' },
  sku: { raw: 'HONOR-X6E-BLACK-256GB' },
  model: { raw: 'HONOR-X6E-BLACK-256GB' },
  slug: { raw: 'honor-x6e-black-4-256gb-honor-x6e-black-256gb' },
  url: { raw: 'https://www.jetstereo.com/product/honor-x6e-black-4-256gb-honor-x6e-black-256gb' },
  main_image: {
    raw: '{"full":"https://jetstereo-retail.s3.us-east-2.amazonaws.com/images/catalog/public/products/product_HONOR_X6E_BLACK_128GB_6a9b2b7ecff04.webp","size75":"https://x/75.webp"}',
  },
  price: { raw: '{"sale":6995.000004999999,"regular":10495.000049999999}' },
  discount: { raw: '{"amount":3043.4782999999998,"percentage":33,"promoid":"100000097747"}' },
  currency: { raw: 'HNL' },
  stock: { raw: '125' },
  sale_status: { raw: 'AVAILABLE' },
  main_category: { raw: 'Celulares y Accesorios' },
  categories: {
    raw: [
      '{"slug":"celulares-y-accesorios","name":"Celulares y Accesorios","category_id":304}',
      '{"slug":"smartphones","name":"Celulares","category_id":26}',
    ],
  },
  brand: {
    raw: '{"id":166,"name":"HONOR","logo":"https://x/HONOR.png","slug":"honor","description":"<p>desc</p>","personalized":0,"sort_order":10}',
  },
  description: {
    raw: '{"meta_title":"Honor X6e","meta_description":"HONOR X6E BLACK 4+256GB.","meta_keyword":"HONOR X6E","description":"<p>El <strong>HONOR X6E</strong> es genial.</p>","shortDescription":"<p>Resumen corto.</p>","attributeDescription":""}',
  },
  specs: {
    raw: [
      '{"value":{"id":221,"name":"Almacenamiento","category":"Almacenamiento","value":"256GB","sortOrder":1}}',
      '{"value":{"id":1079,"name":"Memoria RAM","category":"Rendimiento","value":"4GB","sortOrder":2}}',
    ],
  },
  ratings: { raw: '{"average":0,"reviews":0}' },
  variants: { raw: [] },
  new: { raw: 'true' },
  exclusive: { raw: 'false' },
  coupon: { raw: null },
  has_discount_product: { raw: 'false' },
  available_compare: { raw: 'true' },
  available_for_pickup: { raw: 'true' },
  physical: { raw: '1' },
  shipping_price_id: { raw: 0 },
  published_at: { raw: '2026-09-04' },
};

/**
 * Articulo real SIN rebaja (regular repite a sale), con stock fraccionario,
 * nombre con espacio inicial y attributeDescription en null.
 */
const ECOFLOW_INVERSOR = {
  id: { raw: '16917' },
  name: { raw: ' Inversor EcoFlow/ Delta Pro Ultra X' },
  sku: { raw: 'ECOFLOW-DPUX-INVERSOR' },
  model: { raw: 'ECOFLOW-DPUX-INVERSOR' },
  slug: { raw: 'inversor-delta-pro-ultra-x-ecoflow-dpux-inversor' },
  url: { raw: 'https://www.jetstereo.com/product/inversor-delta-pro-ultra-x-ecoflow-dpux-inversor' },
  main_image: { raw: '{"full":"https://jetstereo-retail.s3.us-east-2.amazonaws.com/images/x.webp"}' },
  price: { raw: '{"sale":103995.00001999999,"regular":103995.00001999999}' },
  discount: { raw: '{"amount":0,"percentage":0,"promoid":""}' },
  currency: { raw: 'HNL' },
  stock: { raw: '28.421052631578945' },
  sale_status: { raw: 'AVAILABLE' },
  main_category: { raw: 'Respaldo Energético' },
  categories: {
    raw: [
      '{"slug":"respaldo-energetico","name":"Respaldo Energético","category_id":364}',
      '{"slug":"estaciones-portatiles","name":"Estaciones Portátiles","category_id":365}',
    ],
  },
  brand: {
    raw: '{"id":188,"name":"ECOFLOW","logo":"https://x/ecoflow.jpg","slug":"ecoflow","description":null,"personalized":1,"sort_order":1000}',
  },
  description: {
    raw: '{"meta_title":"Inversor EcoFlow","meta_description":"desc","meta_keyword":"inversor","description":"<p>Descripcion larga.</p>","shortDescription":"<p>Resumen.</p>","attributeDescription":null}',
  },
  specs: { raw: [] },
  ratings: { raw: '{"average":0,"reviews":0}' },
  variants: { raw: [] },
  new: { raw: 'true' },
  exclusive: { raw: 'false' },
  coupon: { raw: null },
  has_discount_product: { raw: 'false' },
  available_compare: { raw: 'true' },
  available_for_pickup: { raw: 'true' },
  physical: { raw: '1' },
  shipping_price_id: { raw: 0 },
  published_at: { raw: '2026-09-04' },
};

describe('round2', () => {
  test('limpia los artefactos de coma flotante de la API', () => {
    expect(round2(6995.000004999999)).toBe(6995);
    expect(round2(3043.4782999999998)).toBe(3043.48);
  });

  test('null se queda en null', () => {
    expect(round2(null)).toBeNull();
    expect(round2(undefined)).toBeNull();
  });
});

describe('stripHtml', () => {
  test('quita etiquetas y conserva el texto', () => {
    expect(stripHtml('<p>El <strong>HONOR X6E</strong> es genial.</p>')).toBe('El HONOR X6E es genial.');
  });

  test('vacio o nulo da cadena vacia', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('mapJetstereoProduct', () => {
  test('mapea identidad, url y slug tal cual los da el motor', () => {
    const mapped = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(mapped?.external_id).toBe('16922');
    expect(mapped?.sku).toBe('HONOR-X6E-BLACK-256GB');
    expect(mapped?.url).toBe('https://www.jetstereo.com/product/honor-x6e-black-4-256gb-honor-x6e-black-256gb');
    expect(mapped?.slug).toBe('honor-x6e-black-4-256gb-honor-x6e-black-256gb');
  });

  test('calcula precio de lista solo cuando regular es de verdad mayor', () => {
    const mapped = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(mapped?.price).toBe(6995);
    expect(mapped?.list_price).toBe(10495);
    expect(mapped?.discount_percent).toBe(33);
    expect(mapped?.discount_amount).toBe(3043.48);
  });

  test('sin rebaja de verdad, list_price y discount quedan en null', () => {
    const mapped = mapJetstereoProduct(ECOFLOW_INVERSOR, CONFIG, 'HNL');
    expect(mapped?.price).toBe(103995);
    expect(mapped?.list_price).toBeNull();
    expect(mapped?.discount_percent).toBeNull();
    expect(mapped?.discount_amount).toBeNull();
  });

  test('recorta espacios del nombre', () => {
    const mapped = mapJetstereoProduct(ECOFLOW_INVERSOR, CONFIG, 'HNL');
    expect(mapped?.name).toBe('Inversor EcoFlow/ Delta Pro Ultra X');
  });

  test('la categoria hoja es la ultima del array raiz -> hoja', () => {
    const mapped = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(mapped?.store_category_external_id).toBe('26');
    expect(mapped?.category_raw).toBe('Celulares');
    expect(mapped?.category_path).toEqual(['Celulares y Accesorios', 'Celulares']);
  });

  test('sale_status se traduce a disponibilidad normalizada', () => {
    const available = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(available?.availability).toBe('in_stock');
    expect(available?.in_stock).toBe(true);

    const outOfStock = mapJetstereoProduct(
      { ...HONOR_X6E, sale_status: { raw: 'OUT_OF_STOCK' } },
      CONFIG,
      'HNL',
    );
    expect(outOfStock?.availability).toBe('out_of_stock');
    expect(outOfStock?.in_stock).toBe(false);
    expect(outOfStock?.badges).toContain('agotado');
  });

  test('stock fraccionario se redondea, no se trunca a cero', () => {
    const mapped = mapJetstereoProduct(ECOFLOW_INVERSOR, CONFIG, 'HNL');
    expect(mapped?.stock_quantity).toBe(28);
  });

  test('reviews=0 hace que rating_average quede en null, no en 0 estrellas', () => {
    const mapped = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(mapped?.rating_count).toBe(0);
    expect(mapped?.rating_average).toBeNull();
  });

  test('agrupa specs por categoria', () => {
    const mapped = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(mapped?.specs).toEqual({
      Almacenamiento: { Almacenamiento: '256GB' },
      Rendimiento: { 'Memoria RAM': '4GB' },
    });
  });

  test('attributeDescription vacio o null no rompe el mapeo', () => {
    expect(mapJetstereoProduct(ECOFLOW_INVERSOR, CONFIG, 'HNL')?.attributes?.attributeDescription).toBeNull();
    expect(mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL')?.attributes?.attributeDescription).toBeNull();
  });

  test('una entrada de specs con value:null (visto en el catalogo real, id 4826) no rompe el mapeo', () => {
    const withBadSpec = {
      ...HONOR_X6E,
      specs: { raw: [...HONOR_X6E.specs.raw, '{"value":null}'] },
    };
    const mapped = mapJetstereoProduct(withBadSpec, CONFIG, 'HNL');
    expect(mapped?.specs).toEqual({
      Almacenamiento: { Almacenamiento: '256GB' },
      Rendimiento: { 'Memoria RAM': '4GB' },
    });
  });

  test('descarta un resultado sin id, nombre o url (paginas de marca/SEO)', () => {
    expect(mapJetstereoProduct({ id: { raw: '1' }, url: { raw: 'https://x' } } as never, CONFIG, 'HNL')).toBeNull();
    expect(
      mapJetstereoProduct(
        { id: { raw: '1' }, name: { raw: 'x' } } as never,
        CONFIG,
        'HNL',
      ),
    ).toBeNull();
  });

  test('imagen primaria sale de main_image.full', () => {
    const mapped = mapJetstereoProduct(HONOR_X6E, CONFIG, 'HNL');
    expect(mapped?.primary_image_url).toBe(
      'https://jetstereo-retail.s3.us-east-2.amazonaws.com/images/catalog/public/products/product_HONOR_X6E_BLACK_128GB_6a9b2b7ecff04.webp',
    );
    expect(mapped?.images).toHaveLength(1);
    expect(mapped?.images?.[0]?.is_primary).toBe(true);
  });
});
