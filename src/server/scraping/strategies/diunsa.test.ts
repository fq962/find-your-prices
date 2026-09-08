import { describe, expect, test } from 'vitest';
import { buildDiunsaProductUrl, diunsaSlug, diunsaUrlId, mapDiunsaItem } from './diunsa';

/**
 * Los casos de abajo salen de datos reales: un articulo tal cual lo devuelve
 * la API de Diunsa, y urls copiadas de la pagina publica de Jugueteria.
 * Si Diunsa cambia el formato de sus urls o de sus precios, estas pruebas
 * fallan antes de que el scraper guarde enlaces rotos en la base.
 */

const ITEM = {
  code: '000000001-0000134963',
  externalKeys: { id: 521439, code: '01064890', idSAP: '01064890' },
  name: 'MUÑECA BABY ALIVE FOODIE CUTIES DRINK BO',
  nameAlias: 'F69705L40',
  description: 'MUÑECA BABY ALIVE FOODIE CUTIES DRINK BO',
  tax: '15',
  unitMeasureCode: 'UN',
  unitMeasureName: 'UNIDAD',
  ratingsCount: 4,
  ratingsValue: 350,
  discount: '50',
  oldPrice: '590',
  newPrice: '295',
  ahorroMasPrice: null,
  availibilityCount: 100,
  cartCount: 1,
  brandId: 1234,
  brandName: 'BABY ALIVE',
  materialGroupCode: '258',
  materialGroupName: 'Juguetería',
  mainParentGroupName: null,
  barcode: '5010994203078',
  stock: 12,
  is_adult: '0',
  images: [
    {
      id: 1,
      fileLink: 'https://imgcdn.dapplications.tech/01064890_28c8dec7.jpg',
      fileName: '01064890_28c8dec7.jpg',
      displayName: '01064890_28c8dec7.jpg',
    },
  ],
  variants: [],
};

const CONFIG = { webBaseUrl: 'https://www.diunsa.hn' };

describe('diunsaSlug', () => {
  test('quita acentos', () => {
    expect(diunsaSlug('Juguetería')).toBe('jugueteria');
    expect(diunsaSlug('Niños')).toBe('ninos');
  });

  // Diunsa BORRA el apostrofe en vez de convertirlo en guion:
  // "SET DE JUEGO GABBY'S DOLLHOUSE" -> ".../set-de-juego-gabbys-dollhouse-..."
  // Tratarlo como separador generaria "gabby-s" y un enlace roto.
  test('elimina el apostrofe en vez de separarlo', () => {
    expect(diunsaSlug("SET DE JUEGO GABBY'S DOLLHOUSE SURTIDO")).toBe(
      'set-de-juego-gabbys-dollhouse-surtido',
    );
  });

  test('colapsa signos y recorta guiones sobrantes', () => {
    expect(diunsaSlug("MUÑECA BEBE 12'' COLOR AZUL COLG 3+")).toBe('muneca-bebe-12-color-azul-colg-3');
  });
});

describe('diunsaUrlId', () => {
  // La url publica usa el sufijo de `code` sin los ceros de relleno.
  test('extrae el sufijo numerico sin ceros a la izquierda', () => {
    expect(diunsaUrlId('000000001-0000134963')).toBe('134963');
    expect(diunsaUrlId('000000001-0010025869')).toBe('10025869');
  });
});

describe('buildDiunsaProductUrl', () => {
  test('reconstruye la url publica real del producto', () => {
    expect(buildDiunsaProductUrl(ITEM, CONFIG.webBaseUrl)).toBe(
      'https://www.diunsa.hn/jugueteria/muneca-baby-alive-foodie-cuties-drink-bo-134963',
    );
  });

  test('no duplica la barra final del dominio', () => {
    expect(buildDiunsaProductUrl(ITEM, 'https://www.diunsa.hn/')).toBe(
      'https://www.diunsa.hn/jugueteria/muneca-baby-alive-foodie-cuties-drink-bo-134963',
    );
  });
});

describe('mapDiunsaItem', () => {
  const mapped = mapDiunsaItem(ITEM, CONFIG, 'HNL')!;

  test('usa el code de la API como identificador estable', () => {
    expect(mapped.external_id).toBe('000000001-0000134963');
    expect(mapped.sku).toBe('01064890');
  });

  test('convierte los precios de string a numero', () => {
    expect(mapped.price).toBe(295);
    expect(mapped.list_price).toBe(590);
    expect(mapped.discount_percent).toBe(50);
    expect(mapped.discount_amount).toBe(295);
  });

  // Diunsa repite oldPrice = newPrice cuando no hay oferta. Tomarlo como
  // precio de lista mostraria un "descuento" del 0% en toda la portada.
  test('descarta el precio de lista cuando no hay descuento real', () => {
    const sinOferta = mapDiunsaItem({ ...ITEM, oldPrice: '295', newPrice: '295' }, CONFIG, 'HNL')!;
    expect(sinOferta.list_price).toBeNull();
    expect(sinOferta.discount_percent).toBeNull();
  });

  test('lleva las calificaciones a la escala 0-5', () => {
    // 350 puntos / 4 votos = 87.5 sobre 100 -> 4.38 sobre 5
    expect(mapped.rating_average).toBe(4.38);
    expect(mapped.rating_count).toBe(4);
  });

  test('deriva la disponibilidad del stock', () => {
    expect(mapped.availability).toBe('in_stock');
    expect(mapped.in_stock).toBe(true);
    expect(mapped.stock_quantity).toBe(12);

    expect(mapDiunsaItem({ ...ITEM, stock: 0 }, CONFIG, 'HNL')!.availability).toBe('out_of_stock');
    expect(mapDiunsaItem({ ...ITEM, stock: 3 }, CONFIG, 'HNL')!.availability).toBe('limited');
  });

  test('conserva el codigo de barras, clave para cruzar tiendas', () => {
    expect(mapped.barcode_raw).toBe('5010994203078');
  });

  test('expone la categoria de la tienda para que el runner la resuelva', () => {
    expect(mapped.store_category_external_id).toBe('258');
    expect(mapped.category_raw).toBe('Juguetería');
  });

  test('marca la primera imagen como principal', () => {
    expect(mapped.images).toHaveLength(1);
    expect(mapped.images![0].is_primary).toBe(true);
    expect(mapped.primary_image_url).toBe('https://imgcdn.dapplications.tech/01064890_28c8dec7.jpg');
  });

  test('descarta articulos sin code o sin nombre', () => {
    expect(mapDiunsaItem({ ...ITEM, code: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapDiunsaItem({ ...ITEM, name: '' }, CONFIG, 'HNL')).toBeNull();
  });
});
