import { describe, expect, test } from 'vitest';
import {
  buildComisariatoImageUrl,
  buildComisariatoProductUrl,
  comisariatoShortCode,
  comisariatoSlug,
  comisariatoSnakeSlug,
  mapComisariatoItem,
} from './comisariato';

/**
 * Los casos de abajo salen de datos reales: dos articulos tal cual los
 * devuelve `POST https://andes.aveapplications.com/api/em/material/paginate`,
 * y una url copiada de
 * https://comisariatolosandes.com/sitemaps/products-sitemap.xml (2026-09-11).
 * Si el sitio cambia el formato de sus urls o de sus precios, estas pruebas
 * fallan antes de que el scraper guarde enlaces rotos en la base.
 */

const CONFIG = {
  webBaseUrl: 'https://comisariatolosandes.com',
  imageBaseUrl: 'https://comisariatolosandesfiles.s3.us-east-2.amazonaws.com/folder',
};

/** Con existencia. Url real verificada contra el sitemap de productos. */
const ADEREZO = {
  code: '0001-000099001005224',
  name: 'Ready to go aderezo para ensaladas',
  description: 'Ready to go aderezo para ensaladas',
  tax: '15.000',
  unitMeasureCode: 'UN',
  unitMeasureName: 'UNIDAD',
  discount: null,
  oldPrice: null,
  newPrice: 149.95,
  price: 149.95,
  // Siempre 100 en lo observado, pese a que availibilityCount varia: no es el
  // stock real (ver mismo campo en BIMBOLETES, agotado, con stock tambien 100).
  stock: 100,
  availibilityCount: 1000,
  minimunStock: 1,
  cartCount: 1,
  brandId: 1,
  brandName: 'Marca COMANDES',
  materialGroupCode: '1112',
  materialGroupName: 'READY TO GO',
  is_adult: '0',
  images: [
    {
      id: 243,
      fileName: '_0001_Ready_to_go_aderezo_para_ensaladas_-_99001005224_74ae411_2b2f61b.webp',
      displayName: 'READY TO GO ADEREZO PARA ENSALADAS',
    },
  ],
};

/** Agotado (availibilityCount: 0) pero con el mismo stock:100 fijo que ADEREZO. */
const BIMBOLETES = {
  code: '0001-000000007400051',
  name: 'Bimbo bimboletes 2 und',
  description: 'Bimbo bimboletes 2 und',
  tax: '0.000',
  unitMeasureCode: 'UN',
  unitMeasureName: 'UNIDAD',
  discount: null,
  oldPrice: null,
  newPrice: 18.9,
  price: 18.9,
  stock: 100,
  availibilityCount: 0,
  minimunStock: 1,
  cartCount: 1,
  brandId: 1,
  brandName: 'Marca COMANDES',
  materialGroupCode: '1111',
  materialGroupName: 'PANADERIA Y REPOSTERIA',
  is_adult: '0',
  images: [
    { id: 23697, fileName: '7400051-1_577810c9.webp', displayName: 'BIMBO BIMBOLETES 2 UND' },
  ],
};

describe('comisariatoSnakeSlug', () => {
  test('mayúsculas y espacios a kebab-case', () => {
    expect(comisariatoSnakeSlug('READY TO GO')).toBe('ready-to-go');
  });

  test('quita acentos', () => {
    expect(comisariatoSnakeSlug('PANADERÍA Y REPOSTERÍA')).toBe('panaderia-y-reposteria');
  });
});

describe('comisariatoSlug', () => {
  test('nombre real a slug, igual al sitemap', () => {
    expect(comisariatoSlug('Ready to go aderezo para ensaladas')).toBe('ready-to-go-aderezo-para-ensaladas');
  });
});

describe('comisariatoShortCode', () => {
  test('recorta ceros a la izquierda del segundo segmento', () => {
    expect(comisariatoShortCode('0001-000099001005224')).toBe('99001005224');
  });
});

describe('buildComisariatoProductUrl', () => {
  test('coincide con la entrada real del sitemap de productos', () => {
    expect(buildComisariatoProductUrl(ADEREZO, CONFIG.webBaseUrl)).toBe(
      'https://comisariatolosandes.com/ready-to-go/ready-to-go-aderezo-para-ensaladas-99001005224',
    );
  });
});

describe('buildComisariatoImageUrl', () => {
  test('antepone el bucket S3 y la carpeta de tamaño', () => {
    expect(buildComisariatoImageUrl('7400051-1_577810c9.webp', CONFIG.imageBaseUrl)).toBe(
      'https://comisariatolosandesfiles.s3.us-east-2.amazonaws.com/folder/products/500X500/7400051-1_577810c9.webp',
    );
  });

  test('null si no hay archivo', () => {
    expect(buildComisariatoImageUrl(null, CONFIG.imageBaseUrl)).toBeNull();
    expect(buildComisariatoImageUrl('', CONFIG.imageBaseUrl)).toBeNull();
  });
});

describe('mapComisariatoItem', () => {
  test('mapea un articulo con existencia', () => {
    const mapped = mapComisariatoItem(ADEREZO, CONFIG, 'HNL');
    expect(mapped).not.toBeNull();
    expect(mapped?.external_id).toBe('0001-000099001005224');
    expect(mapped?.name).toBe('Ready to go aderezo para ensaladas');
    expect(mapped?.url).toBe(
      'https://comisariatolosandes.com/ready-to-go/ready-to-go-aderezo-para-ensaladas-99001005224',
    );
    expect(mapped?.brand_raw).toBe('Marca COMANDES');
    expect(mapped?.store_category_external_id).toBe('1112');
    expect(mapped?.price).toBe(149.95);
    expect(mapped?.list_price).toBeNull();
    expect(mapped?.availability).toBe('in_stock');
    expect(mapped?.in_stock).toBe(true);
    // availibilityCount (1000), no el stock:100 fijo.
    expect(mapped?.stock_quantity).toBe(1000);
    expect(mapped?.primary_image_url).toBe(
      'https://comisariatolosandesfiles.s3.us-east-2.amazonaws.com/folder/products/500X500/' +
        '_0001_Ready_to_go_aderezo_para_ensaladas_-_99001005224_74ae411_2b2f61b.webp',
    );
  });

  test('availibilityCount 0 es unknown, no out_of_stock (no esconde el articulo del catalogo)', () => {
    const mapped = mapComisariatoItem(BIMBOLETES, CONFIG, 'HNL');
    expect(mapped?.availability).toBe('unknown');
    expect(mapped?.in_stock).toBeNull();
    // El numero se conserva tal cual lo trae la API, solo cambia como se
    // interpreta para el filtro del catalogo (ver toAvailability).
    expect(mapped?.stock_quantity).toBe(0);
    expect(mapped?.badges).not.toContain('agotado');
  });

  test('availibilityCount > 5 es in_stock', () => {
    const mapped = mapComisariatoItem(ADEREZO, CONFIG, 'HNL');
    expect(mapped?.availability).toBe('in_stock');
    expect(mapped?.in_stock).toBe(true);
  });

  test('calcula discount_percent del precio, no del campo discount crudo', () => {
    // Regresion: un lote real trajo un `discount` fuera de 0-100 y violo el
    // check `store_products_discount_percent_check`. El campo crudo ya no se
    // usa para nada; se deja aca con basura a proposito para probar que se
    // ignora.
    const mapped = mapComisariatoItem(
      { ...ADEREZO, oldPrice: 200, newPrice: 150, price: 150, discount: 9999 },
      CONFIG,
      'HNL',
    );
    expect(mapped?.list_price).toBe(200);
    expect(mapped?.discount_percent).toBe(25);
    expect(mapped?.discount_percent).toBeGreaterThanOrEqual(0);
    expect(mapped?.discount_percent).toBeLessThanOrEqual(100);
  });

  test('descarta articulos sin code o sin name', () => {
    expect(mapComisariatoItem({ ...ADEREZO, code: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapComisariatoItem({ ...ADEREZO, name: '' }, CONFIG, 'HNL')).toBeNull();
  });
});
