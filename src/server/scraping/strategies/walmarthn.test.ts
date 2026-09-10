import { describe, expect, test } from 'vitest';
import {
  categoryPathFromUrl,
  collectCategories,
  directChildren,
  extractSpecifications,
  mapWalmartHnProduct,
  parseCategorySitemap,
  round2,
  specValue,
  stripGtinPrefix,
} from './walmarthn';

/**
 * Los casos de abajo salen de datos reales de
 * https://www.walmart.com.hn/api/catalog_system/pub/products/search (la Catalog
 * System API de VTEX, publica y sin token). Si Walmart cambia el esquema, estas
 * pruebas fallan antes de que el scraper guarde precios o urls inventadas.
 */

/** Articulo real con rebaja de verdad (L150.00 -> L112.50) y EAN publicado. */
const ACEITE_BORGES = {
  "productId": "13900",
  "productName": "Aceite Borges Aromatico Soja y Jengibre - 200 ml",
  "productTitle": "Aceite Borges Aromat Soja Jengibre 200Ml",
  "brand": "BORGES",
  "brandId": 818,
  "linkText": "aceite-borges-aromat-soja-jengibre-200ml",
  "link": "https://www.walmart.com.hn/aceite-borges-aromat-soja-jengibre-200ml/p",
  "productReference": "GTIN-8410179000053",
  "categoryId": "207",
  "metaTagDescription": "Compra en línea | Aceite Borges Aromat Soja Jengibre 200Ml |  Contamos con gran cantidad de artículos de Abarrotes | Variedad de Aceite de Oliva | Llevamos todos los productos que necesitas para tu familia hasta la puerta de tu casa",
  "description": "Aceite de oliva aromatizado con soja y jengibre de la marca Borges. Ideal para añadir un toque exótico a tus platos favoritos. Presentación de 200 ml. Información del producto: La información de este producto es proporcionada por fabricantes y distribuidores. Te recomendamos verificar las especificaciones con el fabricante para obtener detalles más actualizados.",
  "releaseDate": "2025-12-04T00:00:00Z",
  "categories": [
    "/Abarrotes/Aceites de cocina/Aceite de Oliva/",
    "/Abarrotes/Aceites de cocina/",
    "/Abarrotes/"
  ],
  "categoriesIds": [
    "/1/29/207/",
    "/1/29/",
    "/1/"
  ],
  "productClusters": {
    "213": "Aceites, Salsas y especies",
    "3352": "CyberWeeks Ver Todo"
  },
  "allSpecifications": [
    "Marca",
    "Fabricante",
    "Sabor",
    "Medida de peso",
    "_allowlist"
  ],
  "Marca": [
    "Borges"
  ],
  "Fabricante": [
    "Borges"
  ],
  "Sabor": [
    "Jengibre"
  ],
  "Medida de peso": [
    "200 Ml"
  ],
  "_allowlist": [
    "walmarthnsp633;walmarthnwm4041"
  ],
  "items": [
    {
      "itemId": "13900",
      "name": "Aceite Borges Aromatico Soja y Jengibre - 200 ml",
      "nameComplete": "Aceite Borges Aromatico Soja y Jengibre - 200 ml",
      "ean": "8410179000053",
      "measurementUnit": "un",
      "unitMultiplier": 1.0,
      "images": [
        {
          "imageId": "621281",
          "imageLabel": "13900",
          "imageUrl": "https://walmarthn.vteximg.com.br/arquivos/ids/621281/13900_01.jpg?v=638754583803600000",
          "imageText": "13900_01.jpg"
        },
        {
          "imageId": "621283",
          "imageLabel": "13900",
          "imageUrl": "https://walmarthn.vteximg.com.br/arquivos/ids/621283/13900_02.jpg?v=638754583810930000",
          "imageText": "13900_02.jpg"
        }
      ],
      "sellers": [
        {
          "sellerId": "1",
          "sellerName": "Walmart HN",
          "sellerDefault": true,
          "commertialOffer": {
            "Price": 112.5,
            "ListPrice": 150.0,
            "PriceWithoutDiscount": 112.5,
            "AvailableQuantity": 100,
            "IsAvailable": true,
            "Tax": 0.0,
            "PriceToken": "eyJhbGciOiJFUzI1NiJ9.token-que-cambia-en-cada-peticion.firma",
            "PriceValidUntil": "2027-07-22T00:00:00Z"
          }
        }
      ]
    }
  ]
} as unknown as Parameters<typeof mapWalmartHnProduct>[0];

/** El mismo articulo sin rebaja: la API repite el precio actual en ListPrice. */
const SIN_REBAJA = {
  ...ACEITE_BORGES,
  items: [
    {
      ...ACEITE_BORGES.items![0],
      sellers: [
        {
          ...ACEITE_BORGES.items![0].sellers![0],
          commertialOffer: {
            ...ACEITE_BORGES.items![0].sellers![0].commertialOffer,
            Price: 112.5,
            ListPrice: 112.5,
          },
        },
      ],
    },
  ],
} as unknown as Parameters<typeof mapWalmartHnProduct>[0];

describe('mapWalmartHnProduct', () => {
  const mapped = mapWalmartHnProduct(ACEITE_BORGES, 'HNL')!;

  test('usa el productId de VTEX como identificador estable', () => {
    // No el itemId ni el slug: el slug cambia si editan el nombre y partiria
    // el historico de precios en dos.
    expect(mapped.external_id).toBe('13900');
    expect(mapped.sku).toBe('13900');
  });

  test('toma la url publica tal como la entrega la API', () => {
    // Verificado 10/10 contra los enlaces reales del html de /abarrotes.
    expect(mapped.url).toBe('https://www.walmart.com.hn/aceite-borges-aromat-soja-jengibre-200ml/p');
    expect(mapped.url).toBe(`https://www.walmart.com.hn/${ACEITE_BORGES.linkText}/p`);
  });

  test('convierte los precios y calcula el descuento', () => {
    expect(mapped.price).toBe(112.5);
    expect(mapped.list_price).toBe(150);
    expect(mapped.discount_amount).toBe(37.5);
    expect(mapped.discount_percent).toBe(25);
    expect(mapped.currency).toBe('HNL');
  });

  test('descarta list_price cuando no hay rebaja real', () => {
    const sinRebaja = mapWalmartHnProduct(SIN_REBAJA, 'HNL')!;
    expect(sinRebaja.price).toBe(112.5);
    expect(sinRebaja.list_price).toBeNull();
    expect(sinRebaja.discount_percent).toBeNull();
  });

  test('guarda el codigo de barras, que es lo que permite cruzar tiendas', () => {
    expect(mapped.barcode_raw).toBe('8410179000053');
    expect(mapped.ean).toBe('8410179000053');
    // productReference lo repite con prefijo GTIN-.
    expect(mapped.external_code).toBe('8410179000053');
  });

  test('no expone PriceValidUntil como campo ni guarda el PriceToken', () => {
    // PriceValidUntil es "hoy + un año": como campo mapeado cambiaria el hash
    // de cada articulo todos los dias. Queda solo dentro de `raw`, que el
    // runner excluye del hash. El PriceToken es un JWT nuevo en cada peticion:
    // ni siquiera eso, se recorta antes de guardar. Ver cabecera de walmarthn.ts.
    expect(mapped.price_valid_until).toBeUndefined();
    expect(JSON.stringify(mapped.raw)).not.toContain('PriceToken');
    expect(JSON.stringify(mapped.raw)).toContain('PriceValidUntil');
  });

  test('deja las colecciones de marketing fuera de los campos que entran al hash', () => {
    // Rotan con cada campaña; en `tags` marcarian media tienda como
    // "actualizada" sin que cambie precio ni ficha.
    expect(mapped.tags).toBeUndefined();
    expect(mapped.raw!.productClusters).toEqual(ACEITE_BORGES.productClusters);
  });

  test('arma la ficha tecnica desde las claves que nombra allSpecifications', () => {
    expect(mapped.specs).toEqual({
      Marca: ['Borges'],
      Fabricante: ['Borges'],
      Sabor: ['Jengibre'],
      'Medida de peso': ['200 Ml'],
    });
    // _allowlist es control de acceso interno de VTEX, no ficha tecnica.
    expect(mapped.specs).not.toHaveProperty('_allowlist');
    expect(mapped.manufacturer).toBe('Borges');
  });

  test('clasifica con el id de la categoria hoja y la ruta legible completa', () => {
    expect(mapped.store_category_external_id).toBe('207');
    expect(mapped.category_raw).toBe('Aceite de Oliva');
    expect(mapped.category_path).toEqual(['Abarrotes', 'Aceites de cocina', 'Aceite de Oliva']);
  });

  test('mapea disponibilidad, medios y vendedor', () => {
    expect(mapped.availability).toBe('in_stock');
    expect(mapped.in_stock).toBe(true);
    // `AvailableQuantity` es un tope de simulacion (5 valores distintos en toda
    // la tienda, 99999 entre ellos), no inventario: no se guarda como stock.
    expect(mapped.stock_quantity).toBeNull();
    expect(mapped.attributes!.availableQuantityRaw).toBe(100);
    expect(mapped.seller_name).toBe('Walmart HN');
    expect(mapped.primary_image_url).toContain('/arquivos/ids/621281/');
    expect(mapped.images).toHaveLength(2);
    expect(mapped.images![0].is_primary).toBe(true);
    // El texto de la imagen es el nombre del archivo: no sirve de alternativo.
    expect(mapped.images![0].alt_text).toBe(mapped.name);
  });

  test('descarta articulos sin identificador, sin nombre o sin url', () => {
    expect(mapWalmartHnProduct({ ...ACEITE_BORGES, productId: undefined }, 'HNL')).toBeNull();
    expect(mapWalmartHnProduct({ ...ACEITE_BORGES, productName: '' }, 'HNL')).toBeNull();
    expect(mapWalmartHnProduct({ ...ACEITE_BORGES, link: undefined }, 'HNL')).toBeNull();
  });
});

describe('collectCategories', () => {
  test('encadena la jerarquia raiz -> hoja con lo que trae el producto', () => {
    const map = new Map();
    collectCategories(ACEITE_BORGES, map);
    expect([...map.values()]).toEqual([
      { external_id: '1', name: 'Abarrotes', external_parent_id: null, level: 1 },
      { external_id: '29', name: 'Aceites de cocina', external_parent_id: '1', level: 2 },
      { external_id: '207', name: 'Aceite de Oliva', external_parent_id: '29', level: 3 },
    ]);
  });

  test('ignora productos cuyas rutas de id y de nombre no coinciden', () => {
    const map = new Map();
    collectCategories({ ...ACEITE_BORGES, categories: ['/Abarrotes/'] }, map);
    expect(map.size).toBe(0);
  });
});

describe('reparto de categorias que no caben en el limite de la API', () => {
  // Recorte real de https://www.walmart.com.hn/sitemap/category-0.xml
  const SITEMAP = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.walmart.com.hn/articulos-para-el-hogar</loc></url>
  <url><loc>https://www.walmart.com.hn/articulos-para-el-hogar/ferreteria</loc></url>
  <url><loc>https://www.walmart.com.hn/articulos-para-el-hogar/ferreteria/pegamentos</loc></url>
  <url><loc>https://www.walmart.com.hn/articulos-para-el-hogar/papeleria</loc></url>
  <url><loc>https://www.walmart.com.hn/abarrotes</loc></url>
  <url><loc>https://otro-sitio.com/abarrotes</loc></url>
</urlset>`;

  const paths = parseCategorySitemap(SITEMAP, 'https://www.walmart.com.hn');

  test('lee solo las rutas del sitio', () => {
    expect(paths).toEqual([
      'articulos-para-el-hogar',
      'articulos-para-el-hogar/ferreteria',
      'articulos-para-el-hogar/ferreteria/pegamentos',
      'articulos-para-el-hogar/papeleria',
      'abarrotes',
    ]);
  });

  test('las hijas directas son un nivel mas, no toda la rama', () => {
    expect(directChildren(paths, 'articulos-para-el-hogar')).toEqual([
      'articulos-para-el-hogar/ferreteria',
      'articulos-para-el-hogar/papeleria',
    ]);
    expect(directChildren(paths, 'articulos-para-el-hogar/ferreteria')).toEqual([
      'articulos-para-el-hogar/ferreteria/pegamentos',
    ]);
    expect(directChildren(paths, 'abarrotes')).toEqual([]);
  });
});

describe('utilidades', () => {
  test('categoryPathFromUrl saca la ruta de la url del target', () => {
    expect(categoryPathFromUrl('https://www.walmart.com.hn/abarrotes')).toBe('abarrotes');
    expect(categoryPathFromUrl('https://www.walmart.com.hn/articulos-para-el-hogar/ferreteria/')).toBe(
      'articulos-para-el-hogar/ferreteria',
    );
    expect(categoryPathFromUrl('higiene-y-belleza')).toBe('higiene-y-belleza');
    expect(categoryPathFromUrl('https://www.walmart.com.hn/')).toBeNull();
    expect(categoryPathFromUrl(null)).toBeNull();
  });

  test('stripGtinPrefix limpia el prefijo de productReference', () => {
    expect(stripGtinPrefix('GTIN-8410179000053')).toBe('8410179000053');
    expect(stripGtinPrefix('8410179000053')).toBe('8410179000053');
    expect(stripGtinPrefix(null)).toBeNull();
  });

  test('specValue encuentra la especificacion sin depender de tildes', () => {
    const specs = extractSpecifications(ACEITE_BORGES);
    expect(specValue(specs, ['fabricante'])).toBe('Borges');
    expect(specValue(specs, ['Pais de Origen - Ensamblaje'])).toBeNull();
  });

  test('round2 tolera nulos y valores no finitos', () => {
    expect(round2(112.499)).toBe(112.5);
    expect(round2(undefined)).toBeNull();
    expect(round2(Number.NaN)).toBeNull();
  });
});
