import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { decodeEntities, stripLoneSurrogates } from './ladylee';

/**
 * Estrategia para PC Builds Honduras (https://www.pcbuildshonduras.com), tienda
 * de componentes de computadora sobre Odoo eCommerce (website_sale, v17+).
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-16)
 * ---------------------------------------------------------------------------
 *   - El html de /shop es SSR real: trae las 15 tarjetas de la pagina con
 *     nombre, precio, imagen, enlace y los ids de Odoo (`data-product-id` es
 *     la variante product.product, `data-product-template-id` la plantilla).
 *     Odoo no publica el catalogo como JSON a usuarios anonimos (los
 *     endpoints /web/dataset y /website_sale/... exigen sesion o van
 *     tarjeta por tarjeta), asi que la tarjeta es la fuente.
 *   - 15 productos por pagina, fijo: `?ppg=` se ignora (data-ppg="15").
 *     Paginacion en /shop/page/N y /shop/category/{slug}/page/N. La ultima
 *     pagina sale de los enlaces del paginador.
 *   - 222 productos en 15 paginas el dia del reconocimiento: el catalogo
 *     entero cabe de sobra en una corrida.
 *   - La tarjeta NO dice la categoria. La barra lateral trae el arbol
 *     completo (41 categorias, anidadas con <ul id="o_wsale_cat_accordion_N">)
 *     y un listado de categoria incluye a sus hijas. Para atribuir categoria
 *     se recorren las categorias de la mas profunda a la raiz y se queda la
 *     primera aparicion; al final se barre /shop para lo que no cuelga de
 *     ninguna. Son ~60 peticiones en total.
 *   - La url publica es /shop/{slug(nombre)}-{templateId}: coincide con el
 *     `data-product-template-id` en las 222 tarjetas. En los listados de
 *     categoria el href lleva ademas el segmento de la categoria
 *     (/shop/refrigeracion-80/{slug}-{id}); la canonica del producto no lo
 *     lleva, asi que se recorta al ultimo segmento para que la url no dependa
 *     de en que listado se vio el articulo.
 *   - Precio en formato es-HN ("3.900,00"). La rebaja, cuando la hay, la
 *     pinta Odoo como <del ... data-oe-expression="...['list_price']">.
 *   - Las imagenes son /web/image/product.product/{id}/image_1024/...?unique=X.
 *     `unique` cambia con cualquier escritura del registro, no solo con la
 *     imagen: se quita para no ensuciar el hash de contenido.
 *   - Stock: la tarjeta no lo trae. La categoria "Productos en Camino" es la
 *     senal de preventa, y "PCB Marketplace" agrupa articulos de terceros
 *     (prefijo "[MKTPLACE]" en el nombre).
 *   - Los ribbons ("¡Nuevo!") se guardan como badges.
 */

interface PcbuildsConfig {
  webBaseUrl: string;
  /** Id numerico de la categoria en Odoo; vacio = catalogo completo. */
  categoryId: string;
}

const DEFAULTS: PcbuildsConfig = {
  webBaseUrl: 'https://www.pcbuildshonduras.com',
  categoryId: '',
};

const PAGE_SIZE = 15;
/** Tope duro de peticiones por corrida; el catalogo entero usa ~60. */
const MAX_PAGES_HARD_LIMIT = 200;

/** Slugs (sin id) de las categorias con significado especial. */
const PREORDER_CATEGORY_SLUG = 'productos-en-camino';
const MARKETPLACE_CATEGORY_SLUG = 'pcb-marketplace';

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

function clean(text: string): string {
  return stripLoneSurrogates(decodeEntities(text.replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "3.900,00" (es-HN) -> 3900. Tambien acepta "3,900.00" por si cambian el idioma. */
export function parsePcbuildsPrice(fragment: string | null | undefined): number | null {
  if (!fragment) return null;
  const text = fragment.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ');
  const m = /(\d[\d.,]*)/.exec(text);
  if (!m) return null;
  let digits = m[1];
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Coma decimal: "3.900,00"
    digits = digits.replace(/\./g, '').replace(',', '.');
  } else {
    // Punto decimal: "3,900.00"
    digits = digits.replace(/,/g, '');
  }
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** "/shop/category/almacenamiento-m-2-13" -> { slug: "almacenamiento-m-2", id: "13" } */
export function parsePcbuildsCategoryUrl(url: string | null | undefined): { slug: string; id: string } | null {
  const m = /\/shop\/category\/([a-z0-9-]+?)-(\d+)(?:[/?#]|$)/i.exec(url ?? '');
  return m ? { slug: m[1].toLowerCase(), id: m[2] } : null;
}

/** Ultimo numero de /page/N que enlaza el paginador para la ruta dada. */
export function parsePcbuildsLastPage(html: string, basePath: string): number | null {
  const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`href="${escaped}/page/(\\d+)`, 'g');
  const pages = [...html.matchAll(re)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : null;
}

/** "/shop/refrigeracion-80/foo-4388" -> "/shop/foo-4388" (la canonica de Odoo). */
export function canonicalProductPath(path: string): string {
  const last = path.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? '';
  return `/shop/${last}`;
}

export interface PcbuildsCard {
  /** product.template id: el que aparece en la url publica. */
  templateId: string;
  /** product.product id: la variante que se anade al carrito. */
  variantId: string | null;
  /** Ruta relativa, tal como la enlaza la tarjeta. */
  path: string;
  name: string;
  imagePaths: string[];
  price: number | null;
  listPrice: number | null;
  productType: string | null;
  ribbons: string[];
}

/** Extrae las tarjetas <article class="oe_product_cart"> de un listado. */
export function parsePcbuildsCards(html: string): PcbuildsCard[] {
  const cards: PcbuildsCard[] = [];
  const re = /<article class="oe_product_cart[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  for (const m of html.matchAll(re)) {
    const body = m[1];
    const path = /<a[^>]*href="(\/shop\/[^"]+)"[^>]*class="oe_product_image_link/.exec(body)?.[1]
      ?? /href="(\/shop\/(?!category\/|cart|wishlist)[^"]+)"/.exec(body)?.[1];
    const title = /<h6[^>]*o_wsale_products_item_title[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(body)?.[1];
    const templateId = /data-product-template-id="(\d+)"/.exec(body)?.[1] ?? /-(\d+)$/.exec(path ?? '')?.[1];
    if (!path || !title || !templateId) continue;

    const imagePaths = [...body.matchAll(/<img[^>]*\ssrc="([^"]+)"[^>]*oe_product_image_img/g)]
      .map((img) => img[1].replace(/\?.*$/, ''))
      .filter((src, index, all) => all.indexOf(src) === index);

    const priceBlock = /<div class="product_price"[^>]*>([\s\S]*?)<\/div>/.exec(body)?.[1] ?? '';
    const current = /data-oe-expression="[^"]*price_reduce[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/.exec(priceBlock)?.[1]
      ?? priceBlock;
    const previous = /<del[^>]*>([\s\S]*?)<\/del>/.exec(priceBlock)?.[1];
    const price = parsePcbuildsPrice(current);
    const old = parsePcbuildsPrice(previous);

    const ribbons = [...body.matchAll(/o_wsale_ribbon[^>]*>([\s\S]*?)<\/span>/g)]
      .map((r) => clean(r[1]))
      .filter(Boolean);

    cards.push({
      templateId,
      variantId: /data-product-id="(\d+)"/.exec(body)?.[1] ?? null,
      path: canonicalProductPath(decodeEntities(path)),
      name: clean(title),
      imagePaths: imagePaths.map(decodeEntities),
      price,
      listPrice: old !== null && price !== null && old > price ? old : null,
      productType: /data-product-type="([^"]+)"/.exec(body)?.[1] ?? null,
      ribbons,
    });
  }
  return cards;
}

/**
 * Lee el arbol de categorias de la barra lateral. Odoo anida cada rama en
 * <ul id="o_wsale_cat_accordion_{idPadre}">, asi que basta con seguir la
 * pila de <ul>/<\/ul> mientras se recorren los enlaces en orden.
 */
export function parsePcbuildsCategories(html: string, webBaseUrl: string): NormalizedCategory[] {
  const start = html.indexOf('wsale_products_categories_list');
  if (start < 0) return [];
  const end = html.indexOf('</aside>', start);
  const section = html.slice(start, end > start ? end : undefined);
  const base = webBaseUrl.replace(/\/+$/, '');

  const categories: NormalizedCategory[] = [];
  const stack: Array<string | null> = [];
  const positionByParent = new Map<string | null, number>();
  const re = /<ul\b([^>]*)>|<\/ul>|<a href="(\/shop\/category\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of section.matchAll(re)) {
    if (m[0].startsWith('</ul')) {
      stack.pop();
      continue;
    }
    if (m[0].startsWith('<ul')) {
      const parent = /id="o_wsale_cat_accordion_(\d+)"/.exec(m[1] ?? '')?.[1] ?? null;
      stack.push(parent);
      continue;
    }
    const parsed = parsePcbuildsCategoryUrl(m[2]);
    const name = clean(m[3]);
    if (!parsed || !name) continue;
    const parentId = stack[stack.length - 1] ?? null;
    const position = (positionByParent.get(parentId) ?? 0) + 1;
    positionByParent.set(parentId, position);
    categories.push({
      external_id: parsed.id,
      name,
      external_parent_id: parentId,
      slug: parsed.slug,
      url: `${base}/shop/category/${parsed.slug}-${parsed.id}`,
      level: stack.length,
      position,
    });
  }
  return categories;
}

/** Nombres de la raiz a la categoria dada. */
export function categoryPath(categoryId: string, byId: Map<string, NormalizedCategory>): string[] {
  const names: string[] = [];
  let current: string | null = categoryId;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    const category = byId.get(current);
    if (!category) break;
    names.unshift(category.name);
    current = category.external_parent_id ?? null;
  }
  return names;
}

export interface PcbuildsCardContext {
  category: NormalizedCategory | null;
  categoryPath: string[];
  preorder: boolean;
  marketplace: boolean;
}

/** Traduce una tarjeta al contrato comun del sistema. */
export function mapPcbuildsCard(
  card: PcbuildsCard,
  webBaseUrl: string,
  currency: string,
  context: PcbuildsCardContext = { category: null, categoryPath: [], preorder: false, marketplace: false },
): NormalizedProduct | null {
  if (!card.templateId || !card.name || !card.path) return null;
  const base = webBaseUrl.replace(/\/+$/, '');
  const images: NormalizedImage[] = card.imagePaths.map((src, index) => ({
    url: /^https?:\/\//.test(src) ? src : `${base}${src.startsWith('/') ? '' : '/'}${src}`,
    position: index,
    is_primary: index === 0,
    alt_text: card.name,
  }));

  const badges: string[] = [];
  if (card.listPrice !== null) badges.push('descuento');
  for (const ribbon of card.ribbons) {
    const normalized = ribbon.replace(/[¡!]/g, '').trim().toLowerCase();
    if (normalized && !badges.includes(normalized)) badges.push(normalized);
  }
  if (context.preorder) badges.push('en-camino');
  if (context.marketplace) badges.push('marketplace');

  const availability: AvailabilityStatus = context.preorder ? 'preorder' : 'unknown';

  return {
    // Identidad: el id de product.template es el que Odoo usa en la url
    // publica y en el carrito; estable mientras exista el articulo.
    external_id: card.templateId,
    name: card.name,
    url: `${base}${card.path}`,
    slug: card.path.replace(/^\/shop\//, '').replace(/-\d+$/, ''),
    condition: 'new',

    // Clasificacion
    store_category_external_id: context.category?.external_id ?? null,
    category_raw: context.category?.name ?? null,
    category_path: context.categoryPath,

    // Precio
    currency,
    price: card.price,
    list_price: card.listPrice,
    discount_amount:
      card.listPrice !== null && card.price !== null ? Number((card.listPrice - card.price).toFixed(2)) : null,
    tax_included: true,

    // Disponibilidad: la tarjeta no la publica; solo se sabe la preventa.
    availability,
    in_stock: context.preorder ? false : null,

    // Medios
    primary_image_url: images[0]?.url ?? null,
    images,

    // Datos libres
    attributes: {
      variantId: card.variantId,
      productType: card.productType,
    },
    badges,
    // Sin raw: la tarjeta no aporta nada reprocesable mas alla de lo extraido.
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>, targetUrl: string | null): PcbuildsConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    categoryId: str('categoryId', parsePcbuildsCategoryUrl(targetUrl)?.id ?? DEFAULTS.categoryId),
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const pcbuildsStrategy: ScrapeStrategy = {
  key: 'pcbuilds',
  label: 'PC Builds Honduras (HTML Odoo)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryId',
      label: 'Id de categoria',
      example: '80',
      description:
        'Id numerico al final de /shop/category/{slug}-{id}. Se deduce de la url del target si existe. Vacio = catalogo completo (~60 peticiones).',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config, ctx.target.url);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let pagesFetched = 0;
    const cardsById = new Map<string, PcbuildsCard>();
    /** Categorias en las que aparecio cada articulo, en orden de recorrido. */
    const categoriesByCard = new Map<string, string[]>();
    const perCategory: Record<string, number> = {};

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

    /** Recorre todas las paginas de un listado y registra sus tarjetas. */
    async function walk(basePath: string, categoryId: string | null, firstHtml?: string): Promise<boolean> {
      let count = 0;
      let lastPage: number | null = null;
      for (let page = 1; ; page += 1) {
        const html = page === 1 && firstHtml !== undefined
          ? firstHtml
          : await fetchPage(`${config.webBaseUrl}${basePath}${page === 1 ? '' : `/page/${page}`}`);
        if (html === null) return false;
        // El paginador de Odoo muestra una ventana de paginas mas la ultima;
        // se relee en cada pagina y se queda el maximo visto.
        lastPage = Math.max(lastPage ?? 0, parsePcbuildsLastPage(html, basePath) ?? 0) || null;

        const cards = parsePcbuildsCards(html);
        for (const card of cards) {
          count += 1;
          if (!cardsById.has(card.templateId)) cardsById.set(card.templateId, card);
          if (categoryId) {
            const list = categoriesByCard.get(card.templateId) ?? [];
            if (!list.includes(categoryId)) list.push(categoryId);
            categoriesByCard.set(card.templateId, list);
          }
        }
        if (cards.length < PAGE_SIZE) break;
        if (lastPage !== null && page >= lastPage) break;
        if (lastPage === null) break;
      }
      if (categoryId) perCategory[categoryId] = count;
      return true;
    }

    // 1. La raiz trae el arbol de categorias y la primera pagina del catalogo.
    const shopHtml = await fetchPage(`${config.webBaseUrl}/shop`);
    if (shopHtml === null) {
      return { products: [], pagesFetched, errors };
    }
    const categories = parsePcbuildsCategories(shopHtml, config.webBaseUrl);
    const byId = new Map(categories.map((c) => [c.external_id, c]));
    ctx.log('info', `Categorias en la barra lateral: ${categories.length}`);

    // 2. Que categorias recorrer: todas (full_catalog) o la rama pedida.
    let selected = categories;
    if (config.categoryId) {
      const inBranch = new Set<string>();
      const queue = [config.categoryId];
      while (queue.length) {
        const id = queue.shift() as string;
        if (inBranch.has(id)) continue;
        inBranch.add(id);
        for (const c of categories) if (c.external_parent_id === id) queue.push(c.external_id);
      }
      selected = categories.filter((c) => inBranch.has(c.external_id));
      if (selected.length === 0) {
        // La categoria no esta en el menu (o el menu cambio): se recorre igual
        // por url, sin arbol.
        selected = [{ external_id: config.categoryId, name: config.categoryId, slug: config.categoryId, level: 1 }];
      }
    }

    // De la mas profunda a la raiz: un listado incluye a sus hijas, y la
    // primera aparicion es la que se queda, asi que las hojas van primero.
    const ordered = [...selected].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    let complete = true;
    for (const category of ordered) {
      const path = category.slug && category.slug !== category.external_id
        ? `/shop/category/${category.slug}-${category.external_id}`
        : `/shop/category/${category.external_id}`;
      const ok = await walk(path, category.external_id);
      if (!ok) {
        complete = false;
        break;
      }
    }

    // 3. En el catalogo completo, /shop recoge lo que no cuelga de ninguna categoria.
    if (complete && !config.categoryId) {
      complete = await walk('/shop', null, shopHtml);
    }

    // 4. Traducir.
    const specialByCategoryId = new Map<string, 'preorder' | 'marketplace'>();
    for (const c of categories) {
      if (c.slug === PREORDER_CATEGORY_SLUG) specialByCategoryId.set(c.external_id, 'preorder');
      if (c.slug === MARKETPLACE_CATEGORY_SLUG) specialByCategoryId.set(c.external_id, 'marketplace');
    }

    const products: NormalizedProduct[] = [];
    for (const card of cardsById.values()) {
      const memberships = categoriesByCard.get(card.templateId) ?? [];
      // La categoria del articulo es la primera que no es una "etiqueta"
      // (en camino / marketplace); si solo esta en esas, se queda con esa.
      const primary = memberships.find((id) => !specialByCategoryId.has(id)) ?? memberships[0] ?? null;
      const category = primary ? byId.get(primary) ?? null : null;
      const mapped = mapPcbuildsCard(card, config.webBaseUrl, currency, {
        category,
        categoryPath: primary ? categoryPath(primary, byId) : [],
        preorder: memberships.some((id) => specialByCategoryId.get(id) === 'preorder'),
        marketplace: memberships.some((id) => specialByCategoryId.get(id) === 'marketplace'),
      });
      if (mapped) products.push(mapped);
    }

    if (!complete) {
      ctx.log('warn', `Barrido incompleto: ${products.length} articulos en ${pagesFetched} paginas`);
    }

    return {
      products,
      categories: config.categoryId ? selected.filter((c) => byId.has(c.external_id)) : categories,
      pagesFetched,
      errors,
      stats: {
        categoryId: config.categoryId || 'todas',
        categoriesWalked: ordered.length,
        perCategory,
        complete,
      },
    };
  },
};
