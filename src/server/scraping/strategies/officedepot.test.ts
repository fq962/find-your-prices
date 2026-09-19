import { describe, expect, test } from 'vitest';
import {
  buildOdProductUrl,
  indexOdCategories,
  isLiveOdCategoryCode,
  mapOdImages,
  mapOdProduct,
  odAncestors,
  odImageUrl,
  odPrimaryCategorySlug,
  odSlug,
  parseOdDescription,
  resolveOdCategoryCode,
  type OdSearchProduct,
} from './officedepot';

const WEB = 'https://www.officedepot.com.hn';
const SITE_PATH = '/officedepotHN/en';
const OPTIONS = { webBaseUrl: WEB, sitePath: SITE_PATH, currency: 'HNL' };

/** Articulo real de /occ/v2/officedepotHN/products/search (2026-09-18). */
const BLOCK: OdSearchProduct = {
  categories: [
    { name: 'Blocks y hojas de repuesto' },
    { name: 'Escolares, Arte y Diseño' },
    { name: 'Cuadernos, libretas y blocks' },
  ],
  code: '1201000093',
  description:
    '\nBLOCK TAMA�O CARTA OFFICE DEPOT 8.5X 11.75 BLANCO RAYA PAQ. 6^|MARCA: OFFICE DEPOT|MODELO: L40292A|MPN: L40292A|',
  discountedPrice: { value: 189.0 },
  images: [
    { format: 'thumbnail', imageType: 'PRIMARY', url: '/officedepotocc/v2/medias/000008683T4.gif-96ftw?context=AAA' },
    { format: 'product', imageType: 'PRIMARY', url: '/officedepotocc/v2/medias/000008683T4.gif-300ftw?context=BBB' },
    { format: 'product', imageType: 'PRIMARY', url: '/officedepotocc/v2/medias/000008683T4.gif-515ftw?context=CCC' },
  ],
  name: 'BLOCK TAMAÑO CARTA OFFICE DEPOT 8.5X 11.75 BLANCO RAYA PAQ. 6',
  price: { currencyIso: 'HNL', value: 189.0 },
  stock: { stockLevel: 72, stockLevelStatus: 'inStock' },
  url: '/Blocks-y-hojas-de-repuesto/BLOCK-TAMA%C3%91O-CARTA-OFFICE-DEPOT-8-5X-11-75-BLANCO-RAYA-PAQ-6/p/1201000093',
};

/** Articulo real con rebaja: 299 -> 224.25. */
const CINTA: OdSearchProduct = {
  categories: [{ name: 'Oficina' }, { name: 'Básicos de papeleria' }, { name: 'Cintas de empaque' }],
  code: '1213000212',
  description: '\nCINTA EMPAQUE HYSTIK 48x45 CANELA PAQUETE DE 6^|MARCA: HYSTIK|MODELO: 880-CANELA|MPN: 880-CANELA|',
  discountedPrice: { value: 224.25 },
  price: { currencyIso: 'HNL', value: 299.0 },
  images: [],
  name: 'CINTA EMPAQUE HYSTIK 48x45 CANELA PAQUETE DE 6',
  stock: { stockLevel: 0, stockLevelStatus: 'outOfStock' },
  url: '/Cintas-de-empaque/CINTA-EMPAQUE-HYSTIK-48x45-CANELA-PAQUETE-DE-6/p/1213000212',
};

/** Recorte real del arbol: "Cartuchos de Tinta" cuelga de dos ramas. */
const TREE = [
  {
    id: 'ROOT',
    name: 'Categoría',
    subcategories: [
      {
        id: '0-0-0-0',
        name: 'Todas',
        subcategories: [
          {
            id: '01-0-0-0',
            name: 'Papel',
            subcategories: [{ id: '01-01-0-0', name: 'Papel de impresión y copiado' }],
          },
          {
            id: '06-0-0-0',
            name: 'Impresión',
            subcategories: [
              { id: '06-02-0-0', name: 'Consumibles', subcategories: [{ id: '06-02-01-0', name: 'Cartuchos de Tinta' }] },
            ],
          },
          {
            id: '13-0-0-0',
            name: 'Impresión',
            subcategories: [
              { id: '13-02-0-0', name: 'Consumibles', subcategories: [{ id: '13-02-01-0', name: 'Cartuchos de Tinta' }] },
            ],
          },
          {
            id: '07-0-0-0',
            name: 'Escolares, Arte y Diseño',
            subcategories: [
              {
                id: '07-02-0-0',
                name: 'Cuadernos, libretas y blocks',
                subcategories: [{ id: '07-02-09-0', name: 'Blocks y hojas de repuesto' }],
              },
              {
                id: '07-03-0-0',
                name: 'Escritura',
                subcategories: [{ id: '07-03-06-0', name: 'Resaltador' }],
              },
            ],
          },
          {
            id: '02-0-0-0',
            name: 'Oficina',
            subcategories: [
              { id: '02-03-0-0', name: 'Escritura', subcategories: [{ id: '02-03-11-0', name: 'Resaltador' }] },
              // Rama vieja: segmentos de tres digitos, sin un solo articulo.
              { id: '02-025-0-0', name: 'Escritura', subcategories: [{ id: '02-025-621-622', name: 'Resaltador' }] },
            ],
          },
        ],
      },
    ],
  },
];

const index = indexOdCategories(TREE);

describe('officedepot / utilidades', () => {
  test('slug sin acentos ni signos', () => {
    expect(odSlug('Escolares, Arte y Diseño')).toBe('escolares-arte-y-diseno');
    expect(odSlug('Artículos y accesorios de oficina')).toBe('articulos-y-accesorios-de-oficina');
  });

  test('la url publica es la que sirve la API con host y prefijo de sitio', () => {
    expect(buildOdProductUrl(BLOCK.url as string, WEB, SITE_PATH)).toBe(
      'https://www.officedepot.com.hn/officedepotHN/en/Blocks-y-hojas-de-repuesto/BLOCK-TAMA%C3%91O-CARTA-OFFICE-DEPOT-8-5X-11-75-BLANCO-RAYA-PAQ-6/p/1201000093',
    );
  });

  test('la imagen pierde el prefijo de la API, que da 404', () => {
    expect(odImageUrl('/officedepotocc/v2/medias/000008683T4.gif-515ftw?context=CCC', WEB)).toBe(
      'https://www.officedepot.com.hn/medias/000008683T4.gif-515ftw?context=CCC',
    );
    expect(odImageUrl('https://cdn.example.com/a.jpg', WEB)).toBe('https://cdn.example.com/a.jpg');
  });

  test('de los tres tamanos del mismo archivo queda solo el mayor', () => {
    const images = mapOdImages(BLOCK, WEB);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: 'https://www.officedepot.com.hn/medias/000008683T4.gif-515ftw?context=CCC',
      position: 0,
      is_primary: true,
      width: 515,
    });
  });

  test('la descripcion se parte en marca, modelo y mpn', () => {
    expect(parseOdDescription('\nLAPIZ AZUL^|MARCA: BIC|MODELO: X-1|MPN: X1B|')).toEqual({
      description: 'LAPIZ AZUL',
      brand: 'BIC',
      model: 'X-1',
      mpn: 'X1B',
    });
  });

  test('las vinetas rotas se vuelven saltos de linea', () => {
    const parsed = parseOdDescription('\n? Papel bond? Carta^|MARCA: OD|MODELO: A|MPN: A|');
    expect(parsed.description).toBe('Papel bond\nCarta');
  });

  test('una descripcion rota en origen se descarta, pero marca y modelo sobreviven', () => {
    const parsed = parseOdDescription(BLOCK.description);
    expect(parsed.description).toBeNull();
    expect(parsed).toMatchObject({ brand: 'OFFICE DEPOT', model: 'L40292A', mpn: 'L40292A' });
  });
});

describe('officedepot / arbol de categorias', () => {
  test('aplana el arbol e indexa por slug', () => {
    expect(index.names.get('07-02-09-0')).toBe('Blocks y hojas de repuesto');
    expect(index.bySlug.get('cartuchos-de-tinta')).toEqual(['06-02-01-0', '13-02-01-0']);
    expect(odAncestors(index, '07-02-09-0')).toEqual(['07-02-0-0', '07-0-0-0', '0-0-0-0', 'ROOT']);
  });

  test('los codigos con segmentos de tres digitos son ramas muertas', () => {
    expect(isLiveOdCategoryCode('02-03-11-0')).toBe(true);
    expect(isLiveOdCategoryCode('02-025-621-622')).toBe(false);
  });

  test('el primer segmento de la url es la categoria primaria', () => {
    expect(odPrimaryCategorySlug(BLOCK.url as string)).toBe('blocks-y-hojas-de-repuesto');
  });

  test('nombre unico en el arbol: resuelve sin sondear', () => {
    expect(resolveOdCategoryCode(index, BLOCK)).toEqual({ code: '07-02-09-0', candidates: [] });
  });

  test('nombre repetido: desempata por los ancestros que declara el articulo', () => {
    const resaltador: OdSearchProduct = {
      code: '1214000768',
      name: 'RESALTADOR',
      url: '/Resaltador/RESALTADOR/p/1214000768',
      categories: [{ name: 'Oficina' }, { name: 'Escritura' }],
    };
    // Solo 02-03-11-0 cuelga de Oficina > Escritura; la rama vieja se descarta
    // por el formato del codigo.
    expect(resolveOdCategoryCode(index, resaltador)).toEqual({ code: '02-03-11-0', candidates: [] });
  });

  test('ambiguedad real: devuelve candidatos para que la corrida los sondee', () => {
    const cartucho: OdSearchProduct = {
      code: '1307000145',
      name: 'CARTUCHO',
      url: '/Cartuchos-de-Tinta/CARTUCHO/p/1307000145',
      categories: [{ name: 'Impresión' }, { name: 'Consumibles' }],
    };
    expect(resolveOdCategoryCode(index, cartucho)).toEqual({
      code: null,
      candidates: ['06-02-01-0', '13-02-01-0'],
    });
  });

  test('categoria desconocida: ningun candidato', () => {
    expect(resolveOdCategoryCode(index, { code: 'x', name: 'x', url: '/Inexistente/x/p/1' })).toEqual({
      code: null,
      candidates: [],
    });
  });
});

describe('officedepot / mapeo del articulo', () => {
  test('articulo sin rebaja', () => {
    const mapped = mapOdProduct(BLOCK, OPTIONS, '07-02-09-0', [
      'Escolares, Arte y Diseño',
      'Cuadernos, libretas y blocks',
      'Blocks y hojas de repuesto',
    ]);
    expect(mapped).toMatchObject({
      external_id: '1201000093',
      sku: '1201000093',
      mpn: 'L40292A',
      model: 'L40292A',
      brand_raw: 'OFFICE DEPOT',
      name: 'BLOCK TAMAÑO CARTA OFFICE DEPOT 8.5X 11.75 BLANCO RAYA PAQ. 6',
      currency: 'HNL',
      price: 189,
      // Sin descuento real no hay precio de lista, aunque la tienda repita el numero.
      list_price: null,
      discount_percent: null,
      availability: 'in_stock',
      in_stock: true,
      stock_quantity: 72,
      store_category_external_id: '07-02-09-0',
      category_raw: 'Blocks y hojas de repuesto',
      primary_image_url: 'https://www.officedepot.com.hn/medias/000008683T4.gif-515ftw?context=CCC',
    });
    expect(mapped?.description).toBeNull();
    expect(mapped?.badges).toEqual([]);
  });

  test('articulo con rebaja y agotado', () => {
    const mapped = mapOdProduct(CINTA, OPTIONS, '02-02-05-0', ['Oficina', 'Cintas de empaque']);
    expect(mapped).toMatchObject({
      price: 224.25,
      list_price: 299,
      discount_amount: 74.75,
      discount_percent: 25,
      availability: 'out_of_stock',
      in_stock: false,
      stock_quantity: 0,
      badges: ['descuento'],
    });
  });

  test('descarta lo que no se puede identificar ni enlazar', () => {
    expect(mapOdProduct({ name: 'sin codigo', url: '/a/b/p/1' }, OPTIONS)).toBeNull();
    expect(mapOdProduct({ code: '1', name: 'sin url' }, OPTIONS)).toBeNull();
    expect(mapOdProduct({ code: '1', url: '/a/b/p/1' }, OPTIONS)).toBeNull();
  });
});
