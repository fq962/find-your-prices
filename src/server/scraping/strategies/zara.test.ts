import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { HttpError } from '../http';
import {
  accumulateZaraComponent,
  buildZaraProductUrl,
  findZaraNode,
  mapZaraAvailability,
  mapZaraModel,
  zaraCategoriesForRoots,
  zaraComponents,
  zaraFamilies,
  zaraPrice,
  zaraRootLabel,
  zaraStrategy,
  type ZaraCategoryNode,
  type ZaraComponent,
  type ZaraModelDraft,
} from './zara';

/** Arbol de /hn/es/categories?ajax=true recortado a unas ramas (2026-09-19). */
const TREE: ZaraCategoryNode[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'zara-categories.json'), 'utf8'),
).categories;
/** Componentes reales de Mujer > Pantalones (2420795), con la galeria recortada. */
const LISTING = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'zara-products.json'), 'utf8'));
const BASE = 'https://www.zara.com/hn/es';

const MUJER = 1881757;
const HOMBRE = 1885841;
const NINA = 2425905;
const BEBE_NINA = 2421860;

function draftsFrom(components: ZaraComponent[], category = null as ZaraModelDraft['category']) {
  const drafts = new Map<string, ZaraModelDraft>();
  for (const component of components) accumulateZaraComponent(drafts, component, category, 750);
  return drafts;
}

function fakeHttp(requested: string[], respond: (url: string) => unknown) {
  return {
    async getJson<T>(url: string): Promise<T> {
      requested.push(url);
      const body = respond(url);
      if (body instanceof Error) throw body;
      return body as T;
    },
    getText: async () => { throw new Error('no'); },
    postJson: async () => { throw new Error('no'); },
    stats: { requests: 0, errors: 0, bytes: 0 },
  };
}

function runWith(http: ReturnType<typeof fakeHttp>, config: Record<string, unknown>, log: string[] = []) {
  return zaraStrategy.run({
    store: { default_currency: 'HNL', user_agent: 'FindYourPricesBot/1.0' } as never,
    target: { max_pages: 100, kind: 'category', url: null } as never,
    config,
    http,
    signal: new AbortController().signal,
    log: (level, message) => log.push(`${level}: ${message}`),
  });
}

describe('zara / arbol', () => {
  test('familias de Mujer: grupos con nombre en orden de menu, genericos al final, alias deduplicados', () => {
    const families = zaraFamilies(findZaraNode(TREE, MUJER)!.node);
    expect(families.map((f) => `${f.group ? f.group.name : '-'} > ${f.node.name} -> ${f.fetchId}`)).toEqual([
      // COLECCIÓN y ZAPATOS | ACCESORIOS primero, en el orden del menu.
      'COLECCIÓN > PANTALONES -> 2420795',
      'COLECCIÓN > JEANS -> 2419185',
      'ZAPATOS | ACCESORIOS > ZAPATOS -> 2419160',
      // NOVEDADES es un grupo generico: sus familias van despues, aunque en el menu vaya antes.
      'NOVEDADES > THE NEW -> 2546081',
      'NOVEDADES > BACK TO WORK -> 2735932',
      // El grupo sin nombre (SPECIAL PRICES) va al final y no aparece en la ruta.
      '- > SPECIAL PRICES -> 2419737',
    ]);
    expect(families.map((f) => f.generic)).toEqual([false, false, false, true, true, true]);
    expect(families[0].path).toEqual(['MUJER', 'COLECCIÓN', 'PANTALONES']);
    expect(families[5].path).toEqual(['MUJER', 'SPECIAL PRICES']);
  });

  test('Hombre: VER TODO (tope de 3 000) y SPECIAL PRICES quedan detras de las familias reales', () => {
    const families = zaraFamilies(findZaraNode(TREE, HOMBRE)!.node);
    expect(families.map((f) => f.node.name)).toEqual(['PANTALONES', 'VER TODO', 'SPECIAL PRICES']);
  });

  test('las dos NIÑA de NIÑOS se distinguen: la de 1½-6 años lleva BEBÉ delante', () => {
    expect(zaraRootLabel(findZaraNode(TREE, NINA)!.node)).toBe('NIÑA');
    expect(zaraRootLabel(findZaraNode(TREE, BEBE_NINA)!.node)).toBe('BEBÉ NIÑA');
  });

  test('categorias publicadas: ancestros, raiz, grupos y familias con nivel y url', () => {
    const { categories, families, missing } = zaraCategoriesForRoots(TREE, [NINA, BEBE_NINA, 999], BASE);
    expect(missing).toEqual([999]);
    expect(families.map((f) => f.node.name)).toEqual(['PANTALONES', 'ZAPATOS']);
    expect(families[0].path).toEqual(['NIÑOS', 'NIÑA', 'COLECCIÓN', 'PANTALONES']);

    const byId = new Map(categories.map((c) => [c.external_id, c]));
    expect(byId.get('2112261')).toMatchObject({ name: 'NIÑOS', external_parent_id: null, level: 0 });
    expect(byId.get(String(NINA))).toMatchObject({ name: 'NIÑA', external_parent_id: '2112261', level: 1, url: `${BASE}/ninos-nina-l323.html` });
    expect(byId.get(String(BEBE_NINA))).toMatchObject({ name: 'BEBÉ NIÑA', external_parent_id: '2112261', level: 1 });
    expect(byId.get('2643261')).toMatchObject({ name: 'COLECCIÓN', external_parent_id: String(NINA), level: 2 });
    // Se publica el nodo visible (PANTALONES), no su alias VER TODO.
    expect(byId.get('2427327')).toMatchObject({ name: 'PANTALONES', external_parent_id: '2643261', level: 3, position: 0 });
    expect(byId.has('2427342')).toBe(false);
    // Los divisores del menu no son categorias.
    expect(byId.has('1881559')).toBe(false);
  });
});

describe('zara / mapeador', () => {
  const components = zaraComponents(LISTING);

  test('el fixture trae un banner, un modelo repetido con dos colores, una rebaja y un coming_soon', () => {
    expect(components).toHaveLength(6);
    expect(components.filter((c) => c.type === 'Bundle')).toHaveLength(1);
  });

  test('precio en centavos y disponibilidad', () => {
    expect(zaraPrice(159500)).toBe(1595);
    expect(zaraPrice(0)).toBeNull();
    expect(zaraPrice(undefined)).toBeNull();
    expect(mapZaraAvailability('in_stock')).toBe('in_stock');
    expect(mapZaraAvailability('coming_soon')).toBe('preorder');
    expect(mapZaraAvailability('out_of_stock')).toBe('out_of_stock');
    expect(mapZaraAvailability(undefined)).toBe('unknown');
  });

  test('url publica identica a la del sitio: /{keyword}-p{seoProductId}.html sin ?v1=', () => {
    expect(buildZaraProductUrl(components[0], BASE)).toBe(`${BASE}/pantalon-cropped-zw-collection-p04344241.html`);
    expect(buildZaraProductUrl({ seo: { keyword: 'x' } }, BASE)).toBeNull();
  });

  test('un modelo con dos colores es UN producto con dos variantes; el banner y el duplicado se descartan', () => {
    const drafts = draftsFrom(components);
    // 04344241 (dos colores), 02770151 (rebaja), 01478534 (coming soon).
    expect([...drafts.keys()]).toEqual(['04344241', '02770151', '01478534']);

    const product = mapZaraModel(drafts.get('04344241')!, BASE, 'HNL')!;
    expect(product).toMatchObject({
      external_id: '04344241',
      external_code: '4344/241',
      name: 'PANTALÓN CROPPED ZW COLLECTION',
      url: `${BASE}/pantalon-cropped-zw-collection-p04344241.html`,
      slug: 'pantalon-cropped-zw-collection',
      brand_raw: 'Zara',
      currency: 'HNL',
      price: 1595,
      list_price: null,
      discount_percent: null,
      // Ambos colores cuestan lo mismo: no hay rango.
      min_price: null,
      max_price: null,
      availability: 'in_stock',
      in_stock: true,
      tax_included: true,
      store_category_external_id: null,
      category_path: [],
    });
    // Orden estable por referencia, no por posicion en el listado: 321 antes que 800.
    expect(product.variants!.map((v) => `${v.external_id}:${v.color}`)).toEqual(['04344241321:Amarillo pastel', '04344241800:Negro']);
    expect(product.variants![0]).toMatchObject({ sku: '04344241321-I2026', price: 1595, list_price: null, availability: 'in_stock', options: { hex: '#E0DABA' } });
    expect(product.color).toBe('Amarillo pastel');
    expect(product.attributes).toMatchObject({ reference: '04344241-I2026', kind: 'Wear', colors: ['Amarillo pastel', 'Negro'] });
    // Imagen del color representante, sin `ts=` y con el ancho pedido.
    expect(product.primary_image_url).toBe(
      'https://static.zara.net/assets/public/476d/e8b6/3e4449e580ea/c858d9285b87/04344241321-a1/04344241321-a1.jpg?w=750',
    );
    expect(product.images).toHaveLength(2);
    expect(product.images![0]).toMatchObject({ position: 0, is_primary: true, width: 2048, height: 3072 });
  });

  test('rebaja real: list_price, descuento del sitio y badge', () => {
    const product = mapZaraModel(draftsFrom(components).get('02770151')!, BASE, 'HNL')!;
    expect(product).toMatchObject({ price: 795, list_price: 1295, discount_amount: 500, discount_percent: 38 });
  });

  test('coming_soon se traduce a preorder y no cuenta como en stock', () => {
    const product = mapZaraModel(draftsFrom(components).get('01478534')!, BASE, 'HNL')!;
    expect(product).toMatchObject({ availability: 'preorder', in_stock: false });
    expect(product.variants![0]).toMatchObject({ availability: 'preorder', in_stock: false });
  });

  test('list_price se descarta cuando "antes" no es mayor que el precio actual', () => {
    const fake: ZaraComponent = {
      ...components[0],
      detail: { ...components[0].detail, colors: [{ ...components[0].detail!.colors![0], price: 159500, oldPrice: 159500 }] },
    };
    const product = mapZaraModel(draftsFrom([fake]).get('04344241')!, BASE, 'HNL')!;
    expect(product.list_price).toBeNull();
  });

  test('rango de precios cuando los colores cuestan distinto: el mas barato representa al modelo', () => {
    const cheaper: ZaraComponent = {
      ...components[5],
      detail: { ...components[5].detail, colors: [{ ...components[5].detail!.colors![0], price: 99500, oldPrice: 159500 }] },
    };
    const product = mapZaraModel(draftsFrom([components[0], cheaper]).get('04344241')!, BASE, 'HNL')!;
    expect(product).toMatchObject({ price: 995, list_price: 1595, min_price: 995, max_price: 1595, color: 'Amarillo pastel' });
  });

  test('se descarta lo que no identifica a un modelo', () => {
    expect(draftsFrom([{ ...components[0], seo: undefined }]).size).toBe(0);
    expect(draftsFrom([{ ...components[0], name: '' }]).size).toBe(0);
    expect(draftsFrom([{ ...components[0], type: 'Bundle' }]).size).toBe(0);
  });

  test('la categoria es la primera familia en la que aparece el modelo', () => {
    const [first, second] = zaraFamilies(findZaraNode(TREE, MUJER)!.node);
    const drafts = new Map<string, ZaraModelDraft>();
    accumulateZaraComponent(drafts, components[0], first, 750);
    accumulateZaraComponent(drafts, components[5], second, 750);
    const product = mapZaraModel(drafts.get('04344241')!, BASE, 'HNL')!;
    expect(product).toMatchObject({
      store_category_external_id: '2420794',
      category_raw: 'PANTALONES',
      category_path: ['MUJER', 'COLECCIÓN', 'PANTALONES'],
    });
    // El segundo listado igual aporto su color.
    expect(product.variants).toHaveLength(2);
  });
});

describe('zara / run', () => {
  test('recorre las familias de las raices en orden y filtra los modelos de otra seccion', async () => {
    const requested: string[] = [];
    const foreign: ZaraComponent = { ...zaraComponents(LISTING)[3], sectionName: 'MAN', seo: { keyword: 'x', seoProductId: '99999999' } };
    const http = fakeHttp(requested, (url) => {
      if (url.endsWith('/categories?ajax=true')) return { categories: TREE };
      if (url.includes('/category/2420795/')) return LISTING;
      if (url.includes('/category/2419185/')) return { productGroups: [{ elements: [{ commercialComponents: [foreign] }] }] };
      return { productGroups: [] };
    });
    const log: string[] = [];
    const result = await runWith(http, { rootCategoryIds: String(MUJER) }, log);

    expect(requested[0]).toBe(`${BASE}/categories?ajax=true`);
    expect(requested.slice(1).map((u) => u.match(/category\/(\d+)\//)![1])).toEqual([
      '2420795', '2419185', '2419160', '2546081', '2735932', '2419737',
    ]);
    expect(result.pagesFetched).toBe(7);
    expect(result.errors).toEqual([]);
    expect(result.products.map((p) => p.external_id).sort()).toEqual(['01478534', '02770151', '04344241']);
    expect(result.categories!.length).toBeGreaterThan(5);
    expect(result.stats).toMatchObject({ section: 'WOMAN', families: 6, foreign: 1, marketing: 1, variants: 4 });
    expect((result.stats!.perFamily as Record<string, number>)['COLECCIÓN > PANTALONES']).toBe(5);
  });

  test('includeGenericListings=false deja fuera VER TODO, THE NEW y SPECIAL PRICES', async () => {
    const requested: string[] = [];
    const http = fakeHttp(requested, (url) => (url.endsWith('/categories?ajax=true') ? { categories: TREE } : LISTING));
    const log: string[] = [];
    const result = await runWith(http, { rootCategoryIds: String(MUJER), includeGenericListings: 'false' }, log);
    expect(requested.slice(1).map((u) => u.match(/category\/(\d+)\//)![1])).toEqual(['2420795', '2419185', '2419160']);
    expect(result.stats).toMatchObject({ families: 3 });
    expect(log.some((l) => l.includes('3 listados genericos omitidos'))).toBe(true);
  });

  test('una familia caida se anota y el resto sigue', async () => {
    const http = fakeHttp([], (url) => {
      if (url.endsWith('/categories?ajax=true')) return { categories: TREE };
      if (url.includes('/category/2420795/')) return new Error('timeout');
      if (url.includes('/category/2419185/')) return LISTING;
      return { productGroups: [] };
    });
    const result = await runWith(http, { rootCategoryIds: [MUJER] });
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]).toMatchObject({ stage: 'family', message: 'timeout' });
    expect(result.products).toHaveLength(3);
    // Sin PANTALONES esta vez, el modelo cae en la siguiente familia.
    expect(result.products.every((p) => p.category_raw === 'JEANS')).toBe(true);
  });

  test('un 403 deja en la bitacora que hay que revisar stores.user_agent', async () => {
    const log: string[] = [];
    const http = fakeHttp([], (url) => new HttpError('HTTP 403', 403, url));
    const result = await runWith(http, { rootCategoryIds: '1881757' }, log);
    expect(result.products).toEqual([]);
    expect(log.some((l) => l.includes('stores.user_agent'))).toBe(true);
  });

  test('configuracion invalida: sin raices, raices inexistentes o de secciones mezcladas', async () => {
    const http = fakeHttp([], () => ({ categories: TREE }));
    expect((await runWith(http, {})).errors![0].stage).toBe('config');

    const missing = await runWith(http, { rootCategoryIds: '123' });
    expect(missing.errors![0].message).toMatch(/123/);
    expect(missing.products).toEqual([]);

    const mixed = await runWith(http, { rootCategoryIds: `${MUJER},${NINA}` });
    expect(mixed.errors![0].message).toMatch(/mezclan secciones/);
    expect(mixed.pagesFetched).toBe(1);
  });
});
