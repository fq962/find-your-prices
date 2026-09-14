import { describe, expect, test } from 'vitest';
import { mapPaizProduct, paizStrategy } from './paiz';
import { categoryPathFromUrl, mapWalmartHnProduct } from './walmarthn';

/**
 * Articulo real de https://www.paiz.com.hn/api/catalog_system/pub/products/search/abarrotes
 * (2026-09-14), con rebaja de verdad (L918.00 -> L550.80) y EAN publicado.
 * Es la misma cuenta VTEX que Walmart HN: si el esquema cambia, estas pruebas
 * fallan antes de que el scraper guarde precios inventados.
 */
const ACEITE_BORGES_2L = {
  productId: '43849',
  productName: 'Aceite Borges Oliva Puro 2000ml',
  productTitle: 'Comprar Aceite Borges Oliva Puro 2000ml | Walmart Honduras',
  brand: 'BORGES',
  brandId: 818,
  linkText: 'aceite-borges-oliva-puro-2000ml-7',
  link: 'https://www.paiz.com.hn/aceite-borges-oliva-puro-2000ml-7/p',
  productReference: 'GTIN-8410179010045',
  categoryId: '207',
  metaTagDescription: 'Aceite Borges Oliva Puro 2000ml',
  description:
    'Aceite de oliva puro de la marca Borges. Ideal para cocinar y sazonar tus platillos favoritos. Presentación de 2000ml, perfecta para uso familiar o en restaurantes. Su calidad garantiza un sabor único y saludable en cada preparación.\nInformación del producto: La información de este producto es proporcionada por fabricantes y distribuidores. Te recomendamos verificar las especificaciones con el fabricante para obtener detalles más actualizados.',
  releaseDate: '2025-08-19T00:00:00Z',
  categories: ['/Abarrotes/Aceites de cocina/Aceite de Oliva/', '/Abarrotes/Aceites de cocina/', '/Abarrotes/'],
  categoriesIds: ['/1/29/207/', '/1/29/', '/1/'],
  productClusters: {
    '3534': 'Alimentos Exclusiva',
    '3535': 'Colección General Exclusivas',
    '3854': 'Rebajas Alimentos',
    '3860': 'Mundo Rebajas Exclusivas en línea coleccion General',
  },
  allSpecifications: [
    'Artículo Keto',
    'Artículo con Ingredientes Naturales',
    'Tamaño (Gramaje, Volumen)',
    'Marca',
    'Fabricante',
    'Sabor',
    'Es comida ya preparada lista para consumir?',
    'Medida de profundidad',
    'Medida de ancho',
    'Medida de altura',
    'Medida de peso',
    'País de Origen - Ensamblaje',
    'Producto sujeto a expiración?',
    'Es producto sensible a la temperatura?',
    'Listado de ingredientes',
    'Cantidad de calorías por porción',
    'Cantidad de grasa saturada por porción',
    'Cantidad total de grasa por porción',
    'Rebaja Exclusiva en línea',
    'Exclusivo Walmart',
    'Exclusivo Super',
    '_allowlist',
  ],
  'Artículo Keto': ['NO'],
  'Artículo con Ingredientes Naturales': ['NO'],
  'Tamaño (Gramaje, Volumen)': ['2 Lt'],
  Marca: ['Borges'],
  Fabricante: ['Corporacion Supermecados Unidos S.R.L'],
  Sabor: ['Oiva'],
  'Es comida ya preparada lista para consumir?': ['Si'],
  'Medida de profundidad': ['107,83  mm'],
  'Medida de ancho': ['109,63  mm'],
  'Medida de altura': ['292  mm'],
  'Medida de peso': ['2000 Ml'],
  'País de Origen - Ensamblaje': ['España'],
  'Producto sujeto a expiración?': ['Si'],
  'Es producto sensible a la temperatura?': ['Si'],
  'Listado de ingredientes': ['Aceite De Oliva Refinado, Aceite De Oliva Virgen'],
  'Cantidad de calorías por porción': ['900  Kcal'],
  'Cantidad de grasa saturada por porción': ['12  gr'],
  'Cantidad total de grasa por porción': ['100  gr'],
  'Rebaja Exclusiva en línea': ['Rebaja Exclusiva en línea'],
  'Exclusivo Walmart': ['Exclusivo Walmart'],
  'Exclusivo Super': ['Exclusivo Super'],
  _allowlist: [
    'walmarthnsp4010;walmarthnsp4015;walmarthnsp4358;walmarthnsp633;walmarthnwm4041;walmarthnwm4410;walmarthnwm4415;walmarthnwm947',
  ],
  items: [
    {
      itemId: '43899',
      name: 'Aceite Borges Oliva Puro 2000ml',
      nameComplete: 'Aceite Borges Oliva Puro 2000ml',
      ean: '8410179010045',
      measurementUnit: 'un',
      unitMultiplier: 1,
      images: [
        {
          imageId: '567883',
          imageLabel: '43899',
          imageUrl: 'https://walmarthn.vteximg.com.br/arquivos/ids/567883/58559_01.jpg?v=638709305177200000',
          imageText: '58559_01.jpg',
        },
        {
          imageId: '567885',
          imageLabel: '43899',
          imageUrl: 'https://walmarthn.vteximg.com.br/arquivos/ids/567885/58559_02.jpg?v=638709305185570000',
          imageText: '58559_02.jpg',
        },
        {
          imageId: '567886',
          imageLabel: '43899',
          imageUrl: 'https://walmarthn.vteximg.com.br/arquivos/ids/567886/58559_03.jpg?v=638709305189170000',
          imageText: '58559_03.jpg',
        },
        {
          imageId: '567887',
          imageLabel: '43899',
          imageUrl: 'https://walmarthn.vteximg.com.br/arquivos/ids/567887/58559_04.jpg?v=638709305193300000',
          imageText: '58559_04.jpg',
        },
      ],
      sellers: [
        {
          sellerId: '1',
          sellerName: 'Paiz HN',
          sellerDefault: true,
          commertialOffer: {
            Price: 550.8,
            ListPrice: 918,
            PriceWithoutDiscount: 550.8,
            AvailableQuantity: 100,
            IsAvailable: true,
            Tax: 0,
            PriceValidUntil: '2027-08-31T00:00:00Z',
            PriceToken: 'eyJ.RECORTADO',
          },
        },
      ],
    },
  ],
};

describe('mapPaizProduct', () => {
  const product = mapPaizProduct(ACEITE_BORGES_2L, 'HNL')!;

  test('no guarda raw, por espacio en la base', () => {
    expect(product).not.toBeNull();
    expect(product.raw).toBeUndefined();
    expect('raw' in product).toBe(false);
  });

  test('el mismo articulo con la estrategia de Walmart si conserva raw', () => {
    const withRaw = mapWalmartHnProduct(ACEITE_BORGES_2L, 'HNL')!;
    expect(withRaw.raw).toBeDefined();
    // Fuera de raw, los dos mapeos son identicos: es la misma funcion.
    const rest = { ...withRaw };
    delete rest.raw;
    expect(product).toEqual(rest);
  });

  test('identidad: productId como external_id, EAN y url publica de paiz.com.hn', () => {
    expect(product.external_id).toBe('43849');
    expect(product.sku).toBe('43899');
    expect(product.barcode_raw).toBe('8410179010045');
    expect(product.ean).toBe('8410179010045');
    expect(product.url).toBe('https://www.paiz.com.hn/aceite-borges-oliva-puro-2000ml-7/p');
    expect(product.seller_name).toBe('Paiz HN');
  });

  test('precio con rebaja real: list_price, porcentaje y monto', () => {
    expect(product.price).toBe(550.8);
    expect(product.list_price).toBe(918);
    expect(product.discount_percent).toBe(40);
    expect(product.discount_amount).toBe(367.2);
    expect(product.badges).toContain('descuento');
    expect(product.currency).toBe('HNL');
  });

  test('sin rebaja real no hay list_price', () => {
    const clone = structuredClone(ACEITE_BORGES_2L);
    clone.items[0].sellers[0].commertialOffer.ListPrice = 550.8;
    const mapped = mapPaizProduct(clone, 'HNL')!;
    expect(mapped.list_price).toBeNull();
    expect(mapped.discount_percent).toBeNull();
    expect(mapped.badges).not.toContain('descuento');
  });

  test('clasificacion y ficha tecnica', () => {
    expect(product.store_category_external_id).toBe('207');
    expect(product.category_path).toEqual(['Abarrotes', 'Aceites de cocina', 'Aceite de Oliva']);
    expect(product.category_raw).toBe('Aceite de Oliva');
    expect(product.brand_raw).toBe('BORGES');
    expect(product.size).toBe('2 Lt');
    expect(product.manufacturer).toBe('Corporacion Supermecados Unidos S.R.L');
    expect(product.specs).not.toHaveProperty('_allowlist');
    expect(product.specs).toHaveProperty('Listado de ingredientes');
  });

  test('campos volatiles fuera del hash: sin price_valid_until ni stock_quantity', () => {
    expect(product.price_valid_until).toBeUndefined();
    expect(product.stock_quantity).toBeNull();
    expect(product.in_stock).toBe(true);
    expect(product.availability).toBe('in_stock');
  });

  test('galeria completa con la primera como principal', () => {
    expect(product.images).toHaveLength(4);
    expect(product.images?.[0]?.is_primary).toBe(true);
    expect(product.primary_image_url).toContain('walmarthn.vteximg.com.br');
  });

  test('descarta articulos sin id, nombre o url', () => {
    expect(mapPaizProduct({ ...ACEITE_BORGES_2L, productId: undefined }, 'HNL')).toBeNull();
    expect(mapPaizProduct({ ...ACEITE_BORGES_2L, productName: '  ' }, 'HNL')).toBeNull();
    expect(mapPaizProduct({ ...ACEITE_BORGES_2L, link: undefined }, 'HNL')).toBeNull();
  });
});

describe('rutas de categoria de Paiz', () => {
  test('la url con tilde del menu se normaliza a la ruta del sitemap', () => {
    // El menu enlaza a /l%C3%A1cteos; la API rechaza \"lácteos\" crudo y el sitemap
    // publica \"lacteos\". Sin esto el reparto por subcategorias no encontraria hijas.
    expect(categoryPathFromUrl('https://www.paiz.com.hn/l%C3%A1cteos')).toBe('lacteos');
    expect(categoryPathFromUrl('https://www.paiz.com.hn/lácteos')).toBe('lacteos');
    expect(categoryPathFromUrl('https://www.paiz.com.hn/abarrotes')).toBe('abarrotes');
    expect(categoryPathFromUrl('https://www.paiz.com.hn/limpieza/')).toBe('limpieza');
  });

  test('un porcentaje suelto no rompe la normalizacion', () => {
    expect(categoryPathFromUrl('https://www.paiz.com.hn/100%-natural')).toBe('100%-natural');
  });
});

describe('paizStrategy', () => {
  test('esta configurada con su propia clave y dominio', () => {
    expect(paizStrategy.key).toBe('paiz');
    expect(paizStrategy.supports).toEqual(['full_catalog', 'category']);
  });
});
