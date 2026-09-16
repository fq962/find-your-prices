import { describe, expect, test } from 'vitest';
import {
  enrichOkashiProduct,
  extractBarcode,
  extractSpecs,
  isValidEan13,
  isValidUpc12,
  languageFromTags,
  mapOkashiProduct,
  okashiStrategy,
} from './okashi';
import type { ShopifyProduct } from './ladylee';

/**
 * Los casos salen de datos reales: productos tal cual los devuelve
 * https://okashihn.com/collections/all/products.json (2026-09-16) y handles
 * copiados de los enlaces de esa misma pagina. Si Okashi cambia el formato de
 * su ficha o de sus precios, estas pruebas fallan antes de que el scraper
 * guarde codigos de barras inventados o descuentos del 0% en la base.
 */

const DEFAULT_VARIANT = {
  title: 'Default Title',
  option1: 'Default Title',
  option2: null,
  option3: null,
  sku: null,
  grams: 0,
  position: 1,
};
const DEFAULT_OPTIONS = [{ name: 'Title', position: 1, values: ['Default Title'] }];

/** Manga sin rebaja, con la ficha tipica (Formato/Tamaño/Paginas/Color/ISBN). */
const DRCL: ShopifyProduct = {
  id: 9185936113907,
  title: '# DRCL Midnight Children  - Volumen 1 (Español)',
  handle: 'drcl-midnight-children-volumen-1-espanol-1',
  body_html:
    '<p>Historia y arte por Shin ichi Sakamoto</p>\n<p>A finales del siglo XIX, en plena revolución industrial donde el avance tecnológico y el crecimiento económico estaban en su apogeo. El barco ruso Demeter zarpa del puerto de Varna rumbo a Inglaterra, transportando una inquietante caja de madera.</p>\n<div>\n<p><strong>Formato:</strong> Tapa blanda con sobrecubierta<br><strong>Tamaño:</strong> 13 x 18 cms<br><strong>Páginas:</strong> <span>188</span><br><strong>Color:</strong> B/N<br><strong>ISBN: </strong>9786076383025</p>\n</div>',
  vendor: 'Panini Mx',
  product_type: '',
  tags: ['Comedia', 'Drama', 'Español', 'NR0825', 'Panini Mx'],
  variants: [{ ...DEFAULT_VARIANT, id: 47625456779507, available: true, price: '409.00', compare_at_price: null }],
  images: [
    {
      id: 44520000000001,
      position: 1,
      src: 'https://cdn.shopify.com/s/files/1/0636/3568/5619/files/drcl1.jpg?v=1754600000',
      width: 600,
      height: 900,
    },
  ],
  options: DEFAULT_OPTIONS,
};

/** Rebaja de verdad: 490 -> 294. El editor mete <br data-mce-fragment="1">. */
const EYES: ShopifyProduct = {
  id: 8133720047859,
  title: '3 X 3 Eyes   - Volumen 1 (Español)',
  handle: '3-x-3-eyes-volumen-1-espanol',
  body_html:
    '<meta charset="UTF-8">\n<p data-mce-fragment="1">Historia y arte por Yuzo Takada</p>\n<div data-mce-fragment="1">\n<p>Yakumo Fuji era un estudiante normal y corriente.</p>\n<p data-mce-fragment="1"><strong data-mce-fragment="1">Formato:</strong> Tapa blanda con sobrecubierta <br data-mce-fragment="1"><strong data-mce-fragment="1">Tamaño:</strong> 11.5 x 17 cms<br data-mce-fragment="1"><strong data-mce-fragment="1">Páginas:</strong> 200<br data-mce-fragment="1"><strong data-mce-fragment="1">Color:</strong> B/N<br data-mce-fragment="1"><strong data-mce-fragment="1">ISBN:</strong> <span data-mce-fragment="1">9788417777906</span></p>\n</div>',
  vendor: 'Ivrea España',
  product_type: '',
  tags: ['Pack40'],
  variants: [{ ...DEFAULT_VARIANT, id: 44015103738099, available: true, price: '294.00', compare_at_price: '490.00' }],
  images: [
    {
      id: 39800565793011,
      position: 1,
      src: 'https://cdn.shopify.com/s/files/1/0636/3568/5619/files/3x3_eyes1.jpg?v=1699033520',
      width: 324,
      height: 455,
    },
  ],
  options: DEFAULT_OPTIONS,
};

/** "Antes" MENOR que el precio actual (529 < 549): no es rebaja. */
const ADABANA: ShopifyProduct = {
  id: 9222171853043,
  title: 'Adabana - Volumen 3 (Español)',
  handle: 'adabana-volumen-3-espanol',
  body_html: '<p>Historia y arte por Non</p>',
  vendor: 'Distrito Manga',
  product_type: '',
  tags: ['Pack40'],
  variants: [{ ...DEFAULT_VARIANT, id: 47752838152435, available: true, price: '549.00', compare_at_price: '529.00' }],
  images: [],
  options: DEFAULT_OPTIONS,
};

/** Figura: sin ISBN pero con JAN Code, y ficha de Marca/Serie/Escultor. */
const NENDOROID: ShopifyProduct = {
  id: 9286574735603,
  title: 'Ao no Hako - Chinatsu Kano (Nendoroid)',
  handle: 'ao-no-hako-chinatsu-kano-nendoroid',
  body_html:
    '<p><strong>Marca:</strong> Good Smile Company</p>\n<p><strong>Serie:</strong> Nendoroid</p>\n<p><strong>Escultor: </strong>Dogu </p>\n<p><strong>JAN Code: </strong>4580590204751</p>\n<p><strong>Tamaño:</strong> 100 mm</p>\n<p><strong>Material:</strong> ABS &amp; PVC</p>\n<p><strong>Set Contiene:</strong><br>- Figura principal<br>- Base</p>',
  vendor: 'Good Smile Company',
  product_type: '',
  tags: ['4A-S3', 'Figura', 'Nendoroid', 'NR1125'],
  variants: [{ ...DEFAULT_VARIANT, id: 48112612802803, available: false, price: '2049.00', compare_at_price: null }],
  images: [
    {
      id: 45276690088179,
      position: 1,
      src: 'https://cdn.shopify.com/s/files/1/0636/3568/5619/files/FIGURE-181448_02.jpg?v=1763070113',
      width: 600,
      height: 800,
    },
  ],
  options: DEFAULT_OPTIONS,
};

/** ISBN mal tipeado por la tienda: 12 digitos. Existe tal cual en el catalogo. */
const CHAKHO: ShopifyProduct = {
  id: 9000000000001,
  title: '7Fates Chakho - Volumen 2 (Inglés)',
  handle: '7fates-chakho-volumen-2-ingles',
  body_html: '<p><strong>Formato:</strong> Tapa blanda<br><strong>ISBN:</strong> 978400900587</p>',
  vendor: 'Ize Press',
  product_type: '',
  tags: ['Ingles'],
  variants: [{ ...DEFAULT_VARIANT, id: 48000000000001, available: true, price: '399.00', compare_at_price: null }],
  images: [],
  options: DEFAULT_OPTIONS,
};

/** Enlaces reales de /collections/all, tal cual los pinta el tema. */
const REAL_HREFS = [
  '/products/2-5-dimensional-seduction-liliel-angel-airborne-corps-ver-pop-up-parade',
  '/products/20th-century-boys-kanzenban-volumen-3-espanol',
  '/products/drcl-midnight-children-volumen-1-espanol-1',
  '/products/3-x-3-eyes-volumen-1-espanol',
];

describe('codigos de barras', () => {
  test('valida el digito verificador de EAN-13 / ISBN-13 / JAN', () => {
    expect(isValidEan13('9786076383025')).toBe(true);
    expect(isValidEan13('9788417777906')).toBe(true);
    expect(isValidEan13('4580590204751')).toBe(true);
    // Los mal tipeados del catalogo real: 12, 14 y 13 con digito incorrecto.
    expect(isValidEan13('978400900587')).toBe(false);
    expect(isValidEan13('97816456515639')).toBe(false);
    expect(isValidEan13('9786076346226')).toBe(false);
  });

  test('valida UPC-A de 12 digitos', () => {
    expect(isValidUpc12('036000291452')).toBe(true);
    expect(isValidUpc12('036000291453')).toBe(false);
  });

  test('extrae ISBN y JAN del texto de la ficha', () => {
    expect(extractBarcode('Formato: Tapa blanda\nISBN: 9786076383025')).toEqual({
      label: 'ISBN',
      digits: '9786076383025',
      valid: true,
    });
    expect(extractBarcode('Marca: Good Smile Company\nJAN Code: 4580590204751')).toEqual({
      label: 'JAN',
      digits: '4580590204751',
      valid: true,
    });
    expect(extractBarcode('ISBN: 978-84-17777-90-6')).toMatchObject({ digits: '9788417777906', valid: true });
    expect(extractBarcode('JAN / ISBN: 9788417777906')).toMatchObject({ label: 'ISBN', valid: true });
    expect(extractBarcode('Historia y arte por Non')).toBeNull();
    expect(extractBarcode(null)).toBeNull();
  });

  test('marca como invalido lo que no cuadra sin tirarlo', () => {
    expect(extractBarcode('ISBN: 978400900587')).toEqual({ label: 'ISBN', digits: '978400900587', valid: false });
  });
});

describe('ficha tecnica', () => {
  test('lee pares Rotulo: valor, una por linea', () => {
    const specs = extractSpecs('Historia y arte por Non\nFormato: Tapa blanda con sobrecubierta\nTamaño: 13 x 18 cms\nPáginas: 188\nColor: B/N\nISBN: 9786076383025');
    expect(specs).toEqual({
      Formato: 'Tapa blanda con sobrecubierta',
      Tamaño: '13 x 18 cms',
      Páginas: '188',
      Color: 'B/N',
      ISBN: '9786076383025',
    });
  });

  test('ignora la prosa con dos puntos y las claves largas', () => {
    const specs = extractSpecs(
      'Ahora solo tiene un objetivo: vengarse de todos.\nHistoria y arte por: Yuzo Takada\nMarca: Bandai\nNota: ' + 'x'.repeat(200),
    );
    expect(specs).toEqual({ Marca: 'Bandai' });
  });

  test('idioma desde los tags, con y sin tilde', () => {
    expect(languageFromTags(['Comedia', 'Español'])).toBe('es');
    expect(languageFromTags(['Ingles'])).toBe('en');
    expect(languageFromTags(['Inglés'])).toBe('en');
    expect(languageFromTags(['Japones'])).toBe('ja');
    expect(languageFromTags(['Pack40'])).toBeNull();
    expect(languageFromTags(undefined)).toBeNull();
  });
});

describe('mapOkashiProduct', () => {
  test('reconstruye la url publica igual a los enlaces reales', () => {
    const byHandle = new Map(
      [DRCL, EYES].map((p) => [`/products/${p.handle}`, mapOkashiProduct(p, 'HNL')!.url]),
    );
    for (const href of REAL_HREFS) {
      if (!byHandle.has(href)) continue;
      expect(byHandle.get(href)).toBe(`https://okashihn.com${href}`);
    }
    expect(mapOkashiProduct(DRCL, 'HNL')!.url).toBe(
      'https://okashihn.com/products/drcl-midnight-children-volumen-1-espanol-1',
    );
  });

  test('un handle con caracteres fuera de ascii se codifica como lo enlaza el tema', () => {
    // Enlace real de /collections/figura?page=2:
    // href="/products/naruto-shippuden-grandista-hatake-kakashi-%E2%85%B1-banpresto"
    const mapped = mapOkashiProduct(
      { ...NENDOROID, id: 9000000000002, handle: 'naruto-shippuden-grandista-hatake-kakashi-ⅱ-banpresto' },
      'HNL',
    )!;
    expect(mapped.url).toBe('https://okashihn.com/products/naruto-shippuden-grandista-hatake-kakashi-%E2%85%B1-banpresto');
    expect(mapped.slug).toBe('naruto-shippuden-grandista-hatake-kakashi-ⅱ-banpresto');
  });

  test('manga: ISBN a barcode_raw e isbn, ficha a specs, idioma a attributes', () => {
    const mapped = mapOkashiProduct(DRCL, 'HNL')!;

    expect(mapped.external_id).toBe('9185936113907');
    expect(mapped.name).toBe('# DRCL Midnight Children  - Volumen 1 (Español)');
    expect(mapped.price).toBe(409);
    expect(mapped.list_price).toBeNull();
    expect(mapped.discount_percent).toBeNull();
    expect(mapped.currency).toBe('HNL');
    expect(mapped.in_stock).toBe(true);
    expect(mapped.availability).toBe('in_stock');

    expect(mapped.barcode_raw).toBe('9786076383025');
    expect(mapped.isbn).toBe('9786076383025');
    expect(mapped.brand_raw).toBe('Panini Mx');
    expect(mapped.manufacturer).toBe('Panini Mx');
    expect(mapped.specs).toEqual({
      Formato: 'Tapa blanda con sobrecubierta',
      Tamaño: '13 x 18 cms',
      Páginas: '188',
      Color: 'B/N',
      ISBN: '9786076383025',
    });
    expect(mapped.attributes).toMatchObject({
      language: 'es',
      barcodeLabel: 'ISBN',
      barcodeValid: true,
      variantCount: 1,
    });
    expect(mapped.tags).toEqual(['Comedia', 'Drama', 'Español', 'NR0825', 'Panini Mx']);
    expect(mapped.variants).toEqual([]);
    expect(mapped.primary_image_url).toContain('drcl1.jpg');
    // La descripcion es texto plano, sin etiquetas ni entidades.
    expect(mapped.description).not.toMatch(/<[a-z]+/i);
    expect(mapped.description).toContain('Historia y arte por Shin ichi Sakamoto');
  });

  test('no manda raw: la ingesta lo descarta desde 0026', () => {
    expect(mapOkashiProduct(DRCL, 'HNL')!.raw).toBeUndefined();
  });

  test('rebaja real: list_price y descuento; <br> con atributos separa la ficha', () => {
    const mapped = mapOkashiProduct(EYES, 'HNL')!;
    expect(mapped.price).toBe(294);
    expect(mapped.list_price).toBe(490);
    expect(mapped.discount_percent).toBe(40);
    expect(mapped.discount_amount).toBe(196);
    expect(mapped.badges).toContain('descuento');
    expect(mapped.specs).toEqual({
      Formato: 'Tapa blanda con sobrecubierta',
      Tamaño: '11.5 x 17 cms',
      Páginas: '200',
      Color: 'B/N',
      ISBN: '9788417777906',
    });
    expect(mapped.barcode_raw).toBe('9788417777906');
  });

  test('"antes" menor que el precio no es rebaja', () => {
    const mapped = mapOkashiProduct(ADABANA, 'HNL')!;
    expect(mapped.price).toBe(549);
    expect(mapped.list_price).toBeNull();
    expect(mapped.discount_percent).toBeNull();
    expect(mapped.badges).not.toContain('descuento');
  });

  test('figura: JAN a barcode_raw pero no a isbn; agotada', () => {
    const mapped = mapOkashiProduct(NENDOROID, 'HNL', { handle: 'figura', title: 'Figuras' })!;
    expect(mapped.barcode_raw).toBe('4580590204751');
    expect(mapped.isbn).toBeNull();
    expect(mapped.attributes).toMatchObject({ barcodeLabel: 'JAN', language: null });
    expect(mapped.specs).toMatchObject({
      Marca: 'Good Smile Company',
      Serie: 'Nendoroid',
      Escultor: 'Dogu',
      Tamaño: '100 mm',
      Material: 'ABS & PVC',
    });
    expect(mapped.in_stock).toBe(false);
    expect(mapped.availability).toBe('out_of_stock');
    expect(mapped.badges).toContain('agotado');
    expect(mapped.store_category_external_id).toBe('figura');
    expect(mapped.category_raw).toBe('Figuras');
  });

  test('ISBN invalido: queda en attributes/specs pero NO en barcode_raw', () => {
    const mapped = mapOkashiProduct(CHAKHO, 'HNL')!;
    expect(mapped.barcode_raw).toBeNull();
    expect(mapped.isbn).toBeNull();
    expect(mapped.specs?.ISBN).toBe('978400900587');
    expect(mapped.attributes).toMatchObject({ barcodeText: '978400900587', barcodeValid: false, language: 'en' });
  });

  test('descarta articulos sin id, sin nombre o sin handle', () => {
    expect(mapOkashiProduct({ ...DRCL, id: 0 }, 'HNL')).toBeNull();
    expect(mapOkashiProduct({ ...DRCL, title: '' }, 'HNL')).toBeNull();
    expect(mapOkashiProduct({ ...DRCL, handle: '' }, 'HNL')).toBeNull();
  });

  test('enrichOkashiProduct conserva lo que ya venia mapeado', () => {
    const base = mapOkashiProduct(DRCL, 'HNL')!;
    const enriched = enrichOkashiProduct(base, DRCL);
    expect(enriched.external_id).toBe(base.external_id);
    expect(enriched.attributes).toMatchObject({ shopifyProductId: 9185936113907 });
  });
});

describe('okashiStrategy', () => {
  test('esta registrada con la clave y los targets esperados', () => {
    expect(okashiStrategy.key).toBe('okashi');
    expect(okashiStrategy.supports).toEqual(['full_catalog', 'category']);
    expect(okashiStrategy.configSchema?.map((f) => f.key)).toEqual([
      'collectionHandle',
      'categoryHandles',
      'includeUncategorized',
      'pageSize',
      'syncCategories',
    ]);
  });

  /** Simula Shopify: cada coleccion devuelve sus productos, y "all" todos. */
  function fakeHttp(collections: Record<string, ShopifyProduct[]>) {
    const requested: string[] = [];
    return {
      requested,
      http: {
        stats: { requests: 0, errors: 0, bytes: 0 },
        async getJson<T>(url: string): Promise<T> {
          requested.push(url);
          const products = /\/collections\/([a-z0-9-]+)\/products\.json/.exec(url);
          if (products) return { products: collections[products[1]] ?? [] } as T;
          const ficha = /\/collections\/([a-z0-9-]+)\.json$/.exec(url);
          if (ficha) {
            const handle = ficha[1];
            return { collection: { id: 1, handle, title: handle.toUpperCase(), products_count: 99 } } as T;
          }
          throw new Error(`url inesperada: ${url}`);
        },
        async postJson<T>(): Promise<T> {
          throw new Error('no se usa');
        },
        async getText(): Promise<string> {
          throw new Error('no se usa');
        },
      },
    };
  }

  function context(kind: 'full_catalog' | 'category', http: unknown, config: Record<string, unknown> = {}, url: string | null = null) {
    return {
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 5, kind, url } as never,
      config,
      http: http as never,
      signal: new AbortController().signal,
      log: () => {},
    };
  }

  test('full_catalog: la coleccion del menu gana y lo que solo esta en "all" cae en Manga y Comics', async () => {
    const { http } = fakeHttp({
      figura: [NENDOROID],
      all: [DRCL, EYES, NENDOROID],
    });

    const result = await okashiStrategy.run(
      context('full_catalog', http, { categoryHandles: ['figura'], syncCategories: true }),
    );

    expect(result.errors ?? []).toHaveLength(0);
    expect(result.products).toHaveLength(3);

    const byId = new Map(result.products.map((p) => [p.external_id, p]));
    expect(byId.get('9286574735603')).toMatchObject({ store_category_external_id: 'figura', category_raw: 'Figuras' });
    expect(byId.get('9185936113907')).toMatchObject({ store_category_external_id: 'manga', category_raw: 'Manga y Cómics' });
    expect(byId.get('8133720047859')).toMatchObject({ store_category_external_id: 'manga' });

    // Las dos categorias llegan al runner: la real (con el rotulo del menu,
    // no el titulo de Shopify) y la sintetica.
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ external_id: 'manga', name: 'Manga y Cómics', url: 'https://okashihn.com/collections/all' }),
        expect.objectContaining({ external_id: 'figura', name: 'Figuras', product_count: 99 }),
      ]),
    );
    expect(result.categories!.find((c) => c.external_id === 'figura')!.raw).toBeUndefined();
    expect(result.stats).toMatchObject({ perCollection: { figura: 1, all: 2 }, includeUncategorized: true });
  });

  test('category sobre /collections/all NO etiqueta todo como manga', async () => {
    const { http } = fakeHttp({ all: [DRCL, NENDOROID] });
    const result = await okashiStrategy.run(
      context('category', http, {}, 'https://okashihn.com/collections/all'),
    );
    expect(result.products).toHaveLength(2);
    for (const p of result.products) expect(p.store_category_external_id).toBeNull();
    expect(result.categories).toBeUndefined();
  });

  test('category deduce el handle de la url del target', async () => {
    const { http, requested } = fakeHttp({ figura: [NENDOROID] });
    const result = await okashiStrategy.run(
      context('category', http, { syncCategories: false }, 'https://okashihn.com/collections/figura'),
    );
    expect(result.products).toHaveLength(1);
    expect(requested).toEqual(['https://okashihn.com/collections/figura/products.json?limit=250&page=1']);
  });
});
