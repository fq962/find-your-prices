import type {
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { decodeEntities, stripHtml, stripLoneSurrogates, truncate } from './ladylee';
import { parsePcbuildsCategoryUrl, parsePcbuildsPrice } from './pcbuilds';

/**
 * Estrategia para Metromedia (https://metromedia.hn), libreria: libros en
 * espanol e ingles, comics, biblias, agendas, libretas y accesorios. Corre
 * sobre Odoo eCommerce v13 (website_sale con tema te_*): la tarjeta es un
 * <div class="oe_product_cart"> con microdatos schema.org y las urls llevan
 * el prefijo de idioma /en_US.
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-18)
 * ---------------------------------------------------------------------------
 *   - El html de /en_US/shop es SSR real: nombre, descripcion corta, precio
 *     (`itemprop="price"` numerico y `priceCurrency`), precio de lista en
 *     <del> (con `d-none` cuando no hay rebaja), imagen y url. El id de
 *     product.template va en `data-id` del boton de vista rapida y al final
 *     de la url; el de la variante en <input name="product_id">.
 *   - `?ppg=` se honra sin tope (probado hasta 5000), pero el servidor rinde
 *     ~50 tarjetas por segundo sea cual sea el tamano: 1000 tarjetas tardan
 *     ~16 s. Con 12 899 articulos el catalogo entero son ~260 s, mas que el
 *     presupuesto del runner (240 s): NO cabe en una corrida y por eso no hay
 *     target full_catalog. Se reparte en un target por categoria raiz.
 *   - Pedir una pagina mas alla de la ultima devuelve la ultima otra vez, no
 *     una vacia: el bucle corta cuando no aparece ningun id nuevo.
 *   - La tarjeta no dice la categoria; la barra lateral trae el arbol (68
 *     nodos: 13 raices reales, 3 listas promocionales y 52 generos bajo
 *     "Libros en Espanol" e "Ingles"). Un libro suele estar en varias
 *     categorias a la vez (Novelas ∩ Novela contemporanea = 337 de 703), y
 *     como cada target corre por separado y la ingesta pisa
 *     store_category_id, hace falta una regla estable entre corridas para
 *     que un articulo no cambie de categoria segun que target corrio ultimo.
 *     La regla: las raices se ordenan por prioridad (sin hijas primero, en
 *     el orden de la barra; las que tienen hijas al final) y cada target
 *     EXCLUYE los articulos que aparecen en cualquier raiz de mayor
 *     prioridad. Las raices chicas suman ~1 450 tarjetas, asi que ese indice
 *     cuesta ~11 peticiones y ~30 s. Las raices con hijas (Libros en
 *     Espanol e Ingles) no se excluyen entre si: comparten 32 titulos, pero
 *     leer una para recorrer la otra son 140 s mas y la corrida no cabe
 *     (medido: 228 s contra 240 de presupuesto). Esos 32 alternan de raiz
 *     segun el ultimo target que corrio; la categoria canonica es la misma.
 *   - Medido el 2026-09-18 con ppg=1000 y 300 ms de cortesia: Libros en
 *     Espanol 167 s (21 peticiones, 8 177 articulos propios); Libros en
 *     Ingles ~85 s; cualquier raiz chica < 60 s.
 *   - Los generos (hijas) no se recorren: son ~11 000 tarjetas mas para una
 *     granularidad que el arbol canonico (dos niveles) no conserva. Se
 *     publican en el arbol de la tienda, pero los libros se atribuyen a la
 *     raiz. "Novedades", "Descuentos" y "Lo mas leido" son listas
 *     promocionales, no categorias: se saltan (`skipCategoryIds`).
 *   - Cobertura medida: las raices reales cubren 12 549 de 12 899 (97%).
 *     Los ~350 restantes no cuelgan de ninguna categoria y solo se ven en
 *     /shop; recogerlos obligaria a barrer todo el catalogo. Quedan fuera.
 *   - Imagenes: /web/image/product.template/{id}/image/350x350?unique=X.
 *     Sin sufijo de tamano responde la original (75 KB); se guarda esa y sin
 *     `unique` (cambia con cualquier escritura del registro).
 *   - Ninguna tarjeta publica ISBN ni stock. Ningun articulo con precio 0.
 */

interface MetromediaConfig {
  webBaseUrl: string;
  /** Prefijo de idioma de las urls publicas (/en_US). */
  langPrefix: string;
  /** Id numerico de la categoria raiz a recorrer. Obligatorio. */
  categoryId: string;
  /** Tarjetas por pagina (`?ppg=`). */
  pageSize: number;
  /** Raices que son listas promocionales y no cuentan como categoria. */
  skipCategoryIds: string[];
}

const DEFAULTS: MetromediaConfig = {
  webBaseUrl: 'https://metromedia.hn',
  langPrefix: '/en_US',
  categoryId: '',
  pageSize: 1000,
  // Novedades, Descuentos, Lo mas leido.
  skipCategoryIds: ['98', '135', '99'],
};

const MAX_PAGE_SIZE = 2000;
/** Tope duro de peticiones por corrida; la raiz mas grande usa ~21. */
const MAX_PAGES_HARD_LIMIT = 60;

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

function clean(text: string): string {
  return stripLoneSurrogates(decodeEntities(text.replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

export interface MetromediaCard {
  templateId: string;
  variantId: string | null;
  /** Ruta canonica sin prefijo de idioma ni query: /shop/product/{slug}-{id}. */
  path: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  price: number | null;
  listPrice: number | null;
  currency: string | null;
}

/** "/en_US/shop/product/con-amor-mama-282068?category=135" -> "/shop/product/con-amor-mama-282068" */
export function canonicalMetromediaPath(href: string): string {
  const path = href.replace(/[?#].*$/, '').replace(/^\/[a-z]{2}_[A-Z]{2}(?=\/)/, '');
  const last = path.split('/').filter(Boolean).pop() ?? '';
  return `/shop/product/${last}`;
}

/** Extrae las tarjetas <div class="oe_product_cart"> de un listado. */
export function parseMetromediaCards(html: string): MetromediaCard[] {
  const cards: MetromediaCard[] = [];
  const re = /<div class="oe_product_cart"[^>]*>([\s\S]*?)<\/form>/g;
  for (const m of html.matchAll(re)) {
    const body = m[1];
    const rawPath = /<a[^>]*itemprop="url"[^>]*href="([^"]+)"/.exec(body)?.[1];
    const title = /<a[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/a>/.exec(body)?.[1];
    if (!rawPath || !title) continue;
    const path = canonicalMetromediaPath(decodeEntities(rawPath));
    // El id de product.template esta en la vista rapida y al final de la url.
    const templateId = /quick-view-a"[^>]*data-id="(\d+)"/.exec(body)?.[1] ?? /-(\d+)$/.exec(path)?.[1];
    if (!templateId) continue;

    const microPrice = /itemprop="price"[^>]*>([^<]*)</.exec(body)?.[1];
    const visiblePrice = /combination_info\['price'\][^>]*>([\s\S]*?)<\/span>\s*<\/span>/.exec(body)?.[1];
    const price = round2(parsePcbuildsPrice(microPrice ?? visiblePrice));

    // Odoo pinta siempre el <del> del precio de lista y lo esconde con d-none
    // cuando no hay rebaja: solo cuenta si esta visible Y es mayor.
    const delTag = /<del[^>]*>/.exec(body)?.[0] ?? '';
    const delVisible = delTag !== '' && !/\bd-none\b/.test(delTag);
    const old = delVisible ? round2(parsePcbuildsPrice(/<del[^>]*>([\s\S]*?)<\/del>/.exec(body)?.[1])) : null;

    const image = /<img[^>]*\ssrc="([^"]+)"/.exec(body)?.[1] ?? null;
    const description = /<div itemprop="description">([\s\S]*?)<\/div>/.exec(body)?.[1] ?? null;

    cards.push({
      templateId,
      variantId: /name="product_id"[^>]*value="(\d+)"/.exec(body)?.[1] ?? null,
      path,
      name: clean(title),
      description: description ? stripHtml(description) || null : null,
      // .../image/350x350?unique=X -> .../image (la original, sin `unique`).
      imagePath: image ? decodeEntities(image).replace(/\?.*$/, '').replace(/(\/image)\/\d+x\d+$/, '$1') : null,
      price: price !== null && price > 0 ? price : null,
      listPrice: old !== null && price !== null && old > price ? old : null,
      currency: /itemprop="priceCurrency"[^>]*>([^<]*)</.exec(body)?.[1]?.trim() || null,
    });
  }
  return cards;
}

/**
 * Lee el arbol de la barra lateral (v13): <ul id="o_shop_collapse_category">
 * con un <li> por raiz y, para las que tienen hijas, un <ul class="nav
 * nav-pills flex-column nav-hierarchy"> anidado. El enlace es un <a href>
 * normal. Se sigue la pila de <ul>/<\/ul>; el padre de cada enlace es el
 * ultimo visto en el nivel de arriba. "All Products" (/shop) se ignora.
 */
export function parseMetromediaCategories(html: string, webBaseUrl: string, langPrefix = DEFAULTS.langPrefix): NormalizedCategory[] {
  const marker = html.indexOf('id="o_shop_collapse_category"');
  if (marker < 0) return [];
  const start = html.lastIndexOf('<ul', marker);
  const end = html.indexOf('</form>', marker);
  const section = html.slice(start, end > start ? end : undefined);
  const base = webBaseUrl.replace(/\/+$/, '');

  const categories: NormalizedCategory[] = [];
  const lastAtLevel: Array<string | null> = [];
  let depth = 0;
  const positionByParent = new Map<string | null, number>();
  const re = /<ul\b[^>]*>|<\/ul>|<a href="([^"]*\/shop\/category\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of section.matchAll(re)) {
    if (m[0].startsWith('</ul')) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (m[0].startsWith('<ul')) {
      depth += 1;
      continue;
    }
    const parsed = parsePcbuildsCategoryUrl(decodeEntities(m[1]));
    const name = clean(m[2]);
    if (!parsed || !name) continue;
    const parentId = depth >= 2 ? (lastAtLevel[depth - 1] ?? null) : null;
    lastAtLevel[depth] = parsed.id;
    lastAtLevel.length = depth + 1;
    const position = (positionByParent.get(parentId) ?? 0) + 1;
    positionByParent.set(parentId, position);
    categories.push({
      external_id: parsed.id,
      name,
      external_parent_id: parentId,
      slug: parsed.slug,
      url: `${base}${langPrefix}/shop/category/${parsed.slug}-${parsed.id}`,
      level: depth,
      position,
    });
  }
  return categories;
}

/**
 * Raices en orden de prioridad: primero las que no tienen hijas (en el orden
 * de la barra), despues las que si. Un articulo pertenece a la primera de
 * esta lista en la que aparece, sin importar que target lo recogio.
 */
export function metromediaRootPriority(categories: NormalizedCategory[], skipIds: string[]): NormalizedCategory[] {
  const skip = new Set(skipIds);
  const withChildren = new Set(categories.map((c) => c.external_parent_id).filter(Boolean));
  const roots = categories.filter((c) => !c.external_parent_id && !skip.has(c.external_id));
  return [...roots.filter((c) => !withChildren.has(c.external_id)), ...roots.filter((c) => withChildren.has(c.external_id))];
}

/** Traduce una tarjeta al contrato comun del sistema. */
export function mapMetromediaCard(
  card: MetromediaCard,
  webBaseUrl: string,
  currency: string,
  category: NormalizedCategory | null,
  langPrefix = DEFAULTS.langPrefix,
): NormalizedProduct | null {
  if (!card.templateId || !card.name || !card.path) return null;
  const base = webBaseUrl.replace(/\/+$/, '');
  const images: NormalizedImage[] = card.imagePath
    ? [{ url: /^https?:\/\//.test(card.imagePath) ? card.imagePath : `${base}${card.imagePath}`, position: 0, is_primary: true, alt_text: card.name }]
    : [];

  return {
    external_id: card.templateId,
    name: card.name,
    url: `${base}${langPrefix}${card.path}`,
    slug: card.path.replace(/^\/shop\/product\//, '').replace(/-\d+$/, ''),
    short_description: card.description ? truncate(card.description, 300) : null,
    description: card.description,
    condition: 'new',

    store_category_external_id: category?.external_id ?? null,
    category_raw: category?.name ?? null,
    category_path: category ? [category.name] : [],

    currency: card.currency ?? currency,
    price: card.price,
    list_price: card.listPrice,
    discount_amount:
      card.listPrice !== null && card.price !== null ? Number((card.listPrice - card.price).toFixed(2)) : null,
    discount_percent:
      card.listPrice !== null && card.price !== null
        ? Number((((card.listPrice - card.price) / card.listPrice) * 100).toFixed(2))
        : null,
    tax_included: true,

    // La tarjeta no publica stock.
    availability: 'unknown',
    in_stock: null,

    primary_image_url: images[0]?.url ?? null,
    images,

    attributes: { variantId: card.variantId },
    badges: card.listPrice !== null ? ['descuento'] : [],
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>, targetUrl: string | null): MetromediaConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const pageSize = Number(raw.pageSize);
  const skipRaw = raw.skipCategoryIds;
  const skipCategoryIds = Array.isArray(skipRaw)
    ? skipRaw.map(String)
    : typeof skipRaw === 'string' && skipRaw.trim()
      ? skipRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULTS.skipCategoryIds;
  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    langPrefix: str('langPrefix', DEFAULTS.langPrefix).replace(/\/+$/, ''),
    categoryId: str('categoryId', parsePcbuildsCategoryUrl(targetUrl)?.id ?? DEFAULTS.categoryId),
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    skipCategoryIds,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const metromediaStrategy: ScrapeStrategy = {
  key: 'metromedia',
  label: 'Metromedia (HTML Odoo)',
  // Sin full_catalog a proposito: ~260 s de listados no caben en una corrida.
  supports: ['category'],
  configSchema: [
    {
      key: 'categoryId',
      label: 'Id de categoria raiz',
      required: true,
      example: '84',
      description:
        'Id numerico al final de /shop/category/{slug}-{id}. Se deduce de la url del target. Tiene que ser una raiz de la barra lateral; si es un genero, se usa su raiz.',
    },
    {
      key: 'pageSize',
      label: 'Tarjetas por pagina',
      example: '1000',
      description: 'Se pasa como ?ppg=. El servidor rinde ~50 tarjetas/s sin importar el tamano.',
    },
    {
      key: 'skipCategoryIds',
      label: 'Raices que no cuentan',
      example: '98,135,99',
      description: 'Listas promocionales (Novedades, Descuentos, Lo mas leido): no se recorren ni entran en la prioridad.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config, ctx.target.url);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);
    const shopBase = `${config.webBaseUrl}${config.langPrefix}/shop`;

    let pagesFetched = 0;

    async function fetchPage(url: string): Promise<string | null> {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo', meta: { url } });
        return null;
      }
      if (pagesFetched >= maxPages) {
        errors.push({ stage: 'paginate', message: `Tope de ${maxPages} paginas alcanzado`, meta: { url } });
        return null;
      }
      try {
        const html = await ctx.http.getText(url);
        pagesFetched += 1;
        return html;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'paginate', message, meta: { url } });
        ctx.log('error', `Fallo ${url}: ${message}`);
        return null;
      }
    }

    /**
     * Recorre todas las paginas de una categoria. Devuelve las tarjetas por id,
     * o null si alguna pagina fallo (un indice a medias atribuiria mal).
     */
    async function walk(category: NormalizedCategory): Promise<Map<string, MetromediaCard> | null> {
      const seen = new Map<string, MetromediaCard>();
      const basePath = `${shopBase}/category/${category.slug}-${category.external_id}`;
      for (let page = 1; ; page += 1) {
        const html = await fetchPage(`${basePath}${page === 1 ? '' : `/page/${page}`}?ppg=${config.pageSize}`);
        if (html === null) return null;
        const cards = parseMetromediaCards(html);
        let fresh = 0;
        for (const card of cards) {
          if (seen.has(card.templateId)) continue;
          seen.set(card.templateId, card);
          fresh += 1;
        }
        // Una pagina corta es la ultima. Pasarse devuelve la ultima otra vez
        // (no una vacia), asi que una pagina sin ids nuevos tambien corta.
        if (cards.length < config.pageSize || fresh === 0) break;
      }
      return seen;
    }

    if (!config.categoryId) {
      errors.push({ stage: 'config', message: 'Falta categoryId: esta tienda solo se recorre por categoria raiz' });
      return { products: [], pagesFetched, errors };
    }

    // 1. El arbol sale de la barra lateral; ppg=1 para no traer tarjetas de mas.
    const shopHtml = await fetchPage(`${shopBase}?ppg=1`);
    if (shopHtml === null) return { products: [], pagesFetched, errors };
    const categories = parseMetromediaCategories(shopHtml, config.webBaseUrl, config.langPrefix);
    const byId = new Map(categories.map((c) => [c.external_id, c]));
    const priority = metromediaRootPriority(categories, config.skipCategoryIds);
    ctx.log('info', `Categorias en la barra lateral: ${categories.length}; raices con prioridad: ${priority.length}`);

    // 2. La raiz del target: si dieron un genero, se sube a su raiz.
    let root = byId.get(config.categoryId) ?? null;
    while (root?.external_parent_id) root = byId.get(root.external_parent_id) ?? null;
    const rank = root ? priority.findIndex((c) => c.external_id === root?.external_id) : -1;
    if (!root || rank < 0) {
      errors.push({ stage: 'config', message: `La categoria ${config.categoryId} no es una raiz valida de la barra lateral` });
      return { products: [], pagesFetched, categories, errors };
    }

    // 3. Indice de exclusion: todo lo que ya pertenece a una raiz de mayor
    //    prioridad. Solo las raices sin hijas: Libros en Espanol e Ingles se
    //    solapan en 32 titulos, pero leer una para recorrer la otra cuesta
    //    140 s mas y no cabe en el presupuesto (medido: 228 s contra 240).
    const withChildren = new Set(categories.map((c) => c.external_parent_id).filter(Boolean));
    const excluded = new Set<string>();
    const perCategory: Record<string, number> = {};
    for (const higher of priority.slice(0, rank).filter((c) => !withChildren.has(c.external_id))) {
      const cards = await walk(higher);
      if (cards === null) {
        ctx.log('warn', `No se pudo leer ${higher.name}: sin ella la atribucion seria inestable, se corta`);
        return { products: [], pagesFetched, categories, errors, stats: { root: root.name, excludedFrom: higher.name } };
      }
      perCategory[higher.name] = cards.size;
      for (const id of cards.keys()) excluded.add(id);
    }

    // 4. La raiz pedida.
    const own = await walk(root);
    if (own === null) {
      ctx.log('warn', `Barrido incompleto de ${root.name} en ${pagesFetched} paginas`);
      return { products: [], pagesFetched, categories, errors, stats: { root: root.name } };
    }
    perCategory[root.name] = own.size;

    // 5. Traducir lo que no pertenece a nadie con mas prioridad.
    const products: NormalizedProduct[] = [];
    let skipped = 0;
    for (const card of own.values()) {
      if (excluded.has(card.templateId)) {
        skipped += 1;
        continue;
      }
      const mapped = mapMetromediaCard(card, config.webBaseUrl, currency, root, config.langPrefix);
      if (mapped) products.push(mapped);
    }

    return {
      products,
      // Las listas promocionales no son categorias: no se publican.
      categories: categories.filter((c) => !config.skipCategoryIds.includes(c.external_id)),
      pagesFetched,
      totalReported: own.size,
      errors,
      stats: { root: root.name, rank, pageSize: config.pageSize, perCategory, excluded: excluded.size, skipped },
    };
  },
};
