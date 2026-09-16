import { describe, expect, test } from 'vitest';
import {
  buildLarachProductUrl,
  larachSlug,
  mapLarachCategories,
  mapLarachItem,
  parseAdditionalInfo,
  type LarachItem,
} from './larach';

/** Articulo real de POST /items (2026-09-15), con rebaja del 50 %. */
const ITEM: LarachItem = {
  id: 3094,
  itemCode: '01010152',
  suppCatNum: 'MT1197HM',
  itemName: 'Cinta Metrica 3/4X5 mts',
  foreigName: 'Cinta Metrica Mt1197H 3/4X5Mts',
  sellUnit: 'UNID',
  itemsPerUnit: 1,
  taxCode: 'ISV',
  taxPercent: 15,
  stock: 245,
  category: { id: 318, name: 'Cintas Metricas' },
  supplier: 'P0154',
  brand: 'EL CASTOR',
  longDescription: '',
  shortDescription: null,
  additionalInfo:
    '<table class="table table-sm table-striped"><tbody><tr><td>Colores disponibles</td><td>Negro, Amarillo</td></tr><tr><td>Peso</td><td>0.45 lb (0.20 kg)</td></tr><tr><td>N° catalogo</td><td>MT1197HM</td></tr></tbody></table>',
  isActive: true,
  url: null,
  maxSalesQuantity: 0,
  minSalesQuantity: 0,
  weight2: 0.2,
  weightUnit2: 'kg',
  width1: 10.5,
  height1: 4,
  len1: 15.5,
  dimensionUnit1: 'cm',
  storeOnly: false,
  discount: 50,
  lastPrice: 94,
  price: 47,
  isNew: false,
  media: [{ id: '01010152', fileName: '01010152.webp', url: 'media/items/01010152.webp', main: false }],
  measures: [],
};

const CONFIG = { webBaseUrl: 'https://larachycia.com', mediaBaseUrl: 'https://media.larachycia.com' };

describe('larach', () => {
  test('slug identico al del sitio (enlaces reales de /c/Brocas/305 y /c/Electricidad/3)', () => {
    expect(larachSlug('Accesorio Angulo Externo para Canaleta Shneider 100X45mm')).toBe(
      'Accesorio-Angulo-Externo-para-Canaleta-Shneider-100X45mm',
    );
    expect(larachSlug('Broca Avellanador 5-Cortes Para Metal 12Mm (1/2-Plg)')).toBe(
      'Broca-Avellanador-5-Cortes-Para-Metal-12Mm-1-2-Plg',
    );
    expect(larachSlug('Cepillo Truper N.4 Liso')).toBe('Cepillo-Truper-N-4-Liso');
    expect(larachSlug('Construcción')).toBe('Construcci-C3-B3n');
    expect(larachSlug('Accesorios para Baño')).toBe('Accesorios-para-Ba-C3-B1o');
  });

  test('url publica', () => {
    expect(buildLarachProductUrl(ITEM, 'https://larachycia.com/')).toBe(
      'https://larachycia.com/p/Cinta-Metrica-3-4X5-mts/01010152',
    );
    // Si la tienda define url propia, manda.
    expect(buildLarachProductUrl({ ...ITEM, url: 'mi-ruta' }, 'https://larachycia.com')).toBe(
      'https://larachycia.com/p/mi-ruta/01010152',
    );
  });

  test('ficha tecnica a clave/valor', () => {
    expect(parseAdditionalInfo(ITEM.additionalInfo)).toEqual({
      'Colores disponibles': 'Negro, Amarillo',
      Peso: '0.45 lb (0.20 kg)',
      'N° catalogo': 'MT1197HM',
    });
    expect(parseAdditionalInfo(null)).toEqual({});
  });

  test('mapea el articulo con rebaja real', () => {
    const p = mapLarachItem(ITEM, CONFIG, 'HNL', new Map([['318', 'Herramientas Manuales']]));
    expect(p).not.toBeNull();
    expect(p).toMatchObject({
      external_id: '01010152',
      sku: '01010152',
      mpn: 'MT1197HM',
      name: 'Cinta Metrica 3/4X5 mts',
      name_alias: 'Cinta Metrica Mt1197H 3/4X5Mts',
      url: 'https://larachycia.com/p/Cinta-Metrica-3-4X5-mts/01010152',
      brand_raw: 'EL CASTOR',
      store_category_external_id: '318',
      category_raw: 'Cintas Metricas',
      category_path: ['Herramientas Manuales', 'Cintas Metricas'],
      currency: 'HNL',
      price: 47,
      list_price: 94,
      discount_percent: 50,
      discount_amount: 47,
      tax_rate: 15,
      availability: 'in_stock',
      in_stock: true,
      stock_quantity: 245,
      primary_image_url: 'https://media.larachycia.com/media/items/01010152.webp',
      weight_grams: 200,
      width_mm: 105,
      height_mm: 40,
      length_mm: 155,
      badges: ['descuento'],
    });
    expect(p!.description).toBeNull();
    expect(p!.min_order_quantity).toBeNull();
    expect(p!.raw).toBeUndefined();
    expect(p!.specs).toMatchObject({ Peso: '0.45 lb (0.20 kg)' });
  });

  test('sin rebaja no hay precio de lista; sin stock queda agotado', () => {
    const p = mapLarachItem({ ...ITEM, lastPrice: 47, discount: 0, stock: 0 }, CONFIG, 'HNL');
    expect(p!.list_price).toBeNull();
    expect(p!.discount_percent).toBeNull();
    expect(p!.badges).toEqual([]);
    expect(p!.availability).toBe('out_of_stock');
    expect(p!.category_path).toEqual(['Cintas Metricas']);
  });

  test('descripcion html a texto plano', () => {
    const p = mapLarachItem({ ...ITEM, longDescription: '<p> Instalación Electrica</p>' }, CONFIG, 'HNL');
    expect(p!.description).toBe('Instalación Electrica');
  });

  test('descarta articulos sin codigo o sin nombre', () => {
    expect(mapLarachItem({ ...ITEM, itemCode: undefined }, CONFIG, 'HNL')).toBeNull();
    expect(mapLarachItem({ ...ITEM, itemName: '' }, CONFIG, 'HNL')).toBeNull();
  });

  test('arbol: los departamentos se derivan de los parent', () => {
    const { categories, departmentByCategoryId } = mapLarachCategories(
      [
        { id: 318, name: 'Cintas Metricas', position: 3, level: 2, parent: { id: 7, name: 'Herramientas Manuales' } },
        { id: 305, name: 'Brocas', position: 1, level: 2, parent: { id: 7, name: 'Herramientas Manuales' } },
        { id: 127, name: 'Canaletas y Accesorios', level: 2, parent: { id: 3, name: 'Electricidad' } },
      ],
      'https://larachycia.com',
    );
    expect(categories.map((c) => c.external_id)).toEqual(['7', '3', '318', '305', '127']);
    expect(categories[0]).toMatchObject({
      external_id: '7',
      name: 'Herramientas Manuales',
      external_parent_id: null,
      level: 1,
      url: 'https://larachycia.com/c/Herramientas-Manuales/7',
    });
    expect(categories[2]).toMatchObject({ external_parent_id: '7', level: 2, position: 3 });
    expect(departmentByCategoryId.get('127')).toBe('Electricidad');
  });
});
