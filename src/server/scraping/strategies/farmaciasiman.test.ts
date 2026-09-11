import { describe, expect, test } from 'vitest';
import {
  buildSimanImageUrl,
  buildSimanProductUrl,
  buildSimanSearchUrl,
  mapSimanProduct,
  rotateSeeds,
  round2,
  toAvailability,
} from './farmaciasiman';

/**
 * El primer caso sale de un documento real devuelto por
 * https://webmail.farmaciasiman.com/Farmacia-Ecommerce-General-Api/api/productos/buscador/
 * (sucursalId=5, descripcion="atacand"), tomado el 2026-09-11. Si Farmacia
 * Siman cambia el contrato, esta prueba falla antes de que el scraper guarde
 * precios o enlaces inventados en la base.
 */

const CONFIG = {
  webBaseUrl: 'https://www.farmaciasiman.com',
  imageBaseUrl: 'https://d2wuoo4cuot0vy.cloudfront.net',
};

/** Articulo con rebaja real: precioSinDescuento (403.54) > precioEcommerce (306.69). */
const BRONCOPULMIN = {
  imagenUrl: '/0010-3693/0010-3693_1.jpg',
  productoId: '0010-3693',
  prod_Desc: 'Broncopulmin Dia (Gripe Y Tos) Caja X 36 Gelcaps',
  descontinuado: 'N',
  invActual: 4.0,
  proveedor: 'LABORATORIOS FARSIMAN',
  lineaId: 102,
  precio: 306.69,
  precios: {
    precioSinDescuento: 403.54,
    precioPublico: 306.69,
    precioEcommerce: 306.69,
  },
  presentacion: {
    cantidad: 36.0,
    unidadMedida: 'caps',
    precios: { precioEcommerce: 8.52 },
  },
  disponibilidadStock: 1,
  esControlado: false,
  requiereReceta: false,
};

/** Articulo sin rebaja y agotado: precioSinDescuento igual al vigente, stock 0. */
const AGOTADO = {
  imagenUrl: '/0020-1111/0020-1111_1.jpg',
  productoId: '0020-1111',
  prod_Desc: 'Acetaminofen 500mg Tab X 20',
  descontinuado: 'N',
  invActual: 0,
  proveedor: 'LABORATORIOS FARSIMAN',
  lineaId: 88,
  precio: 45.0,
  precios: {
    precioSinDescuento: 45.0,
    precioPublico: 45.0,
    precioEcommerce: 45.0,
  },
  disponibilidadStock: 0,
  esControlado: false,
  requiereReceta: false,
};

describe('buildSimanSearchUrl', () => {
  test('arma la query con los parametros esperados', () => {
    const url = buildSimanSearchUrl('crema', 2, {
      searchApiUrl: 'https://webmail.farmaciasiman.com/Farmacia-Ecommerce-General-Api/api/productos/buscador/',
      pageSize: 100,
      sucursalId: 5,
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://webmail.farmaciasiman.com/Farmacia-Ecommerce-General-Api/api/productos/buscador/',
    );
    expect(parsed.searchParams.get('descripcion')).toBe('crema');
    expect(parsed.searchParams.get('pagina')).toBe('2');
    expect(parsed.searchParams.get('elementosPorPagina')).toBe('100');
    expect(parsed.searchParams.get('sucursalId')).toBe('5');
    expect(parsed.searchParams.get('busquedaSinInventario')).toBe('true');
  });
});

describe('buildSimanProductUrl', () => {
  test('sigue la ruta de Angular productoDetalle', () => {
    expect(buildSimanProductUrl('0010-3693', CONFIG.webBaseUrl)).toBe(
      'https://www.farmaciasiman.com/productos/detalle/0010-3693',
    );
  });
});

describe('buildSimanImageUrl', () => {
  test('antepone CloudFront a la ruta relativa', () => {
    expect(buildSimanImageUrl('/0010-3693/0010-3693_1.jpg', CONFIG.imageBaseUrl)).toBe(
      'https://d2wuoo4cuot0vy.cloudfront.net/0010-3693/0010-3693_1.jpg',
    );
  });

  test('null si no hay imagen', () => {
    expect(buildSimanImageUrl(null, CONFIG.imageBaseUrl)).toBeNull();
    expect(buildSimanImageUrl('', CONFIG.imageBaseUrl)).toBeNull();
  });
});

describe('toAvailability', () => {
  test('descontinuado manda por encima del stock', () => {
    expect(toAvailability('S', 50)).toBe('discontinued');
  });

  test('stock positivo es in_stock', () => {
    expect(toAvailability('N', 4)).toBe('in_stock');
  });

  test('stock cero o negativo es out_of_stock', () => {
    expect(toAvailability('N', 0)).toBe('out_of_stock');
  });

  test('sin dato de stock es unknown', () => {
    expect(toAvailability('N', null)).toBe('unknown');
  });
});

describe('mapSimanProduct', () => {
  test('mapea un articulo con rebaja real', () => {
    const mapped = mapSimanProduct(BRONCOPULMIN, CONFIG, 'HNL');
    expect(mapped).not.toBeNull();
    expect(mapped?.external_id).toBe('0010-3693');
    expect(mapped?.sku).toBe('0010-3693');
    expect(mapped?.name).toBe('Broncopulmin Dia (Gripe Y Tos) Caja X 36 Gelcaps');
    expect(mapped?.url).toBe('https://www.farmaciasiman.com/productos/detalle/0010-3693');
    expect(mapped?.brand_raw).toBe('LABORATORIOS FARSIMAN');
    expect(mapped?.store_category_external_id).toBe('102');
    expect(mapped?.price).toBe(306.69);
    expect(mapped?.list_price).toBe(403.54);
    expect(mapped?.discount_amount).toBeCloseTo(96.85, 2);
    expect(mapped?.availability).toBe('in_stock');
    expect(mapped?.in_stock).toBe(true);
    expect(mapped?.stock_quantity).toBe(4);
    expect(mapped?.primary_image_url).toBe(
      'https://d2wuoo4cuot0vy.cloudfront.net/0010-3693/0010-3693_1.jpg',
    );
    expect(mapped?.unit_measure_name).toBe('caps');
    expect(mapped?.unit_amount).toBe(36);
    expect(mapped?.badges).toContain('descuento');
  });

  test('no inventa list_price cuando no hay rebaja real', () => {
    const mapped = mapSimanProduct(AGOTADO, CONFIG, 'HNL');
    expect(mapped?.list_price).toBeNull();
    expect(mapped?.discount_amount).toBeNull();
    expect(mapped?.availability).toBe('out_of_stock');
    expect(mapped?.in_stock).toBe(false);
    expect(mapped?.badges).toContain('agotado');
    expect(mapped?.badges).not.toContain('descuento');
  });

  test('descarta articulos sin productoId', () => {
    expect(mapSimanProduct({ ...BRONCOPULMIN, productoId: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapSimanProduct({ ...BRONCOPULMIN, productoId: null }, CONFIG, 'HNL')).toBeNull();
  });

  test('descarta articulos sin nombre', () => {
    expect(mapSimanProduct({ ...BRONCOPULMIN, prod_Desc: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapSimanProduct({ ...BRONCOPULMIN, prod_Desc: undefined }, CONFIG, 'HNL')).toBeNull();
  });
});

describe('rotateSeeds', () => {
  test('sin corrida previa, no rota', () => {
    expect(rotateSeeds(['a', 'b', 'c'], null)).toEqual(['a', 'b', 'c']);
    expect(rotateSeeds(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c']);
  });

  test('fecha invalida no rota', () => {
    expect(rotateSeeds(['a', 'b', 'c'], 'no-es-una-fecha')).toEqual(['a', 'b', 'c']);
  });

  test('rota preservando el conjunto completo', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e'];
    const rotated = rotateSeeds(seeds, '2026-09-11T00:00:00.000Z');
    expect(rotated).toHaveLength(seeds.length);
    expect([...rotated].sort()).toEqual([...seeds].sort());
  });

  test('corridas distintas producen rotaciones distintas', () => {
    const seeds = Array.from({ length: 36 }, (_, i) => String.fromCharCode(97 + i));
    const a = rotateSeeds(seeds, '2026-09-11T00:00:00.000Z');
    const b = rotateSeeds(seeds, '2026-09-12T00:00:00.000Z');
    expect(a).not.toEqual(b);
  });

  test('lista vacia se devuelve tal cual', () => {
    expect(rotateSeeds([], '2026-09-11T00:00:00.000Z')).toEqual([]);
  });
});

describe('round2', () => {
  test('redondea a dos decimales', () => {
    expect(round2(96.849999)).toBe(96.85);
  });

  test('null para valores no finitos', () => {
    expect(round2(null)).toBeNull();
    expect(round2(undefined)).toBeNull();
    expect(round2(Number.NaN)).toBeNull();
  });
});
