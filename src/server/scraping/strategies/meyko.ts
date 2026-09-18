import type {
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { decodeEntities, stripLoneSurrogates } from './ladylee';
import { canonicalProductPath, categoryPath, parsePcbuildsCategoryUrl, parsePcbuildsPrice } from './pcbuilds';

/**
 * Estrategia para Meyko (https://meyko.com), insumos medicos y cuidado en casa,
 * sobre Odoo eCommerce (website_sale, v15: la tarjeta es un <form class="card
 * oe_product_cart"> con microdatos schema.org).
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-17)
 * ---------------------------------------------------------------------------
 *   - El html de /shop es SSR real. Cada tarjeta trae nombre, precio (con
 *     `itemprop="price"` ya numerico y `priceCurrency`), precio de lista en
 *     <del> (con `d-none` cuando no hay rebaja), imagen, url y los ids de Odoo
 *     (`data-product-template-id`, `data-product-product-id`).
 *   - A diferencia de PC Builds (v17), esta version SI honra `?ppg=`: con
 *     ppg=1000 devuelve las 845 tarjetas del catalogo en una sola pagina de
 *     3.2 MB en ~7 s. Se usa 500 (2 paginas, ~2 MB cada una) para no depender
 *     de un solo request enorme.
 *   - El bloque de precio viene con `style="display: none;"` en TODAS las
 *     tarjetas (ajuste del tema), pero los valores estan en el html. 18
 *     articulos tienen precio 0.0: se guardan sin precio, no gratis.
 *   - La tarjeta no dice la categoria. La barra lateral trae el arbol (46
 *     categorias, <ul class="nav-hierarchy"> anidadas, enlace en
 *     `data-link-href`). Se recorre igual que en pcbuilds: hojas primero,
 *     primera aparicion gana, /shop al final.
 *   - Los href llevan `?order=name+asc` pegado y la url publica canonica es
 *     /shop/{slug}-{templateId}: se recorta al ultimo segmento sin query.
 *   - Imagenes: /web/image/product.template/{id}/image_256/...?unique=X.
 *     El mismo path con image_1024 responde 200; se guarda ese y se quita
 *     `unique` (cambia con cualquier escritura del registro).
 *   - Ribbons vistos: "¡Nuevo!", "Precio exclusivo web". Van a badges.
 */

interface MeykoConfig {
  webBaseUrl: string;
  /** Id numerico de la categoria en Odoo; vacio = catalogo completo. */
  categoryId: string;
  /** Tarjetas por pagina (`?ppg=`). */
  pageSize: number;
}

const DEFAULTS: MeykoConfig = {
  webBaseUrl: 'https://meyko.com',
  categoryId: '',
  pageSize: 500,
};

const MAX_PAGE_SIZE = 1000;
/** Tope duro de peticiones por corrida; el catalogo entero usa ~50. */
const MAX_PAGES_HARD_LIMIT = 150;

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

export interface MeykoCard {
  templateId: string;
  variantId: string | null;
  /** Ruta canonica, sin categoria ni query. */
  path: string;
  name: string;
  imagePath: string | null;
  price: number | null;
  listPrice: number | null;
  currency: string | null;
  ribbons: string[];
}

/** Extrae las tarjetas <form class="card oe_product_cart"> de un listado. */
export function parseMeykoCards(html: string): MeykoCard[] {
  const cards: MeykoCard[] = [];
  const re = /<form[^>]*class="[^"]*oe_product_cart[^"]*"[^>]*>([\s\S]*?)<\/form>/g;
  for (const m of html.matchAll(re)) {
    const body = m[1];
    const rawPath = /<a[^>]*itemprop="url"[^>]*href="([^"]+)"/.exec(body)?.[1]
      ?? /href="(\/shop\/(?!category\/|cart)[^"]+)"/.exec(body)?.[1];
    const title = /<a[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/a>/.exec(body)?.[1]
      ?? /<h6[^>]*o_wsale_products_item_title[^>]*>([\s\S]*?)<\/h6>/.exec(body)?.[1];
    const templateId = /data-product-template-id="(\d+)"/.exec(body)?.[1]
      ?? /\/web\/image\/product\.template\/(\d+)\//.exec(body)?.[1];
    if (!rawPath || !title || !templateId) continue;

    // itemprop="price" ya es un numero con punto decimal; el span visible es
    // el respaldo por si el tema deja de escribir los microdatos.
    const microPrice = /itemprop="price"[^>]*>([^<]*)</.exec(body)?.[1];
    const visiblePrice = /combination_info\[&#39;price&#39;\][^>]*>([\s\S]*?)<\/span>\s*<\/span>/.exec(body)?.[1];
    // El microdato sale del float de Python sin redondear ("1.1500000000000001",
    // "2049.9900000000002"): se redondea a centavos, que es lo que la tienda pinta.
    const price = round2(parsePcbuildsPrice(microPrice ?? visiblePrice));

    // Odoo pinta siempre el <del> del precio de lista y lo esconde con d-none
    // cuando no hay rebaja: solo cuenta si esta visible Y es mayor.
    const delTag = /<del[^>]*>/.exec(body)?.[0] ?? '';
    const delVisible = delTag !== '' && !/\bd-none\b/.test(delTag);
    const old = delVisible ? round2(parsePcbuildsPrice(/<del[^>]*>([\s\S]*?)<\/del>/.exec(body)?.[1])) : null;

    const image = /<img[^>]*\ssrc="([^"]+)"/.exec(body)?.[1] ?? null;
    const ribbons = [...body.matchAll(/o_ribbon[^>]*>([\s\S]*?)<\/span>/g)]
      .map((r) => clean(r[1]))
      .filter(Boolean);

    cards.push({
      templateId,
      variantId: /data-product-product-id="(\d+)"/.exec(body)?.[1] ?? null,
      path: canonicalProductPath(decodeEntities(rawPath)),
      name: clean(title),
      imagePath: image ? decodeEntities(image).replace(/\?.*$/, '').replace(/\/image_\d+\//, '/image_1024/') : null,
      // 0.0 es "sin precio publicado", no gratis.
      price: price !== null && price > 0 ? price : null,
      listPrice: old !== null && price !== null && old > price ? old : null,
      currency: /itemprop="priceCurrency"[^>]*>([^<]*)</.exec(body)?.[1]?.trim() || null,
      ribbons,
    });
  }
  return cards;
}

/**
 * Lee el arbol de categorias de la barra lateral (v15): cada rama va en un
 * <ul class="nav-hierarchy"> dentro del <li> del padre, y el enlace en
 * `data-link-href`. Se sigue la pila de <ul>/<\/ul> mientras se recorren los
 * enlaces en orden; el padre de cada uno es el ultimo enlace visto en el
 * nivel de arriba.
 */
export function parseMeykoCategories(html: string, webBaseUrl: string): NormalizedCategory[] {
  const marker = html.indexOf('id="o_shop_collapse_category"');
  if (marker < 0) return [];
  // El id va dentro del <ul> raiz: se retrocede hasta el tag para contarlo.
  const start = html.lastIndexOf('<ul', marker);
  const end = html.indexOf('</form>', marker);
  const section = html.slice(start, end > start ? end : undefined);
  const base = webBaseUrl.replace(/\/+$/, '');

  const categories: NormalizedCategory[] = [];
  /** Ultimo id visto en cada nivel: el padre de lo que cuelgue debajo. */
  const lastAtLevel: Array<string | null> = [];
  let depth = 0;
  const positionByParent = new Map<string | null, number>();
  const re = /<ul\b[^>]*>|<\/ul>|data-link-href="(\/shop\/category\/[^"]+)"[\s\S]*?<label[^>]*>([\s\S]*?)<\/label>/g;
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
    // depth 1 es la lista raiz; el padre es el ultimo enlace del nivel anterior.
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
      url: `${base}/shop/category/${parsed.slug}-${parsed.id}`,
      level: depth,
      position,
    });
  }
  return categories;
}

export interface MeykoCardContext {
  category: NormalizedCategory | null;
  categoryPath: string[];
}

/** Traduce una tarjeta al contrato comun del sistema. */
export function mapMeykoCard(
  card: MeykoCard,
  webBaseUrl: string,
  currency: string,
  context: MeykoCardContext = { category: null, categoryPath: [] },
): NormalizedProduct | null {
  if (!card.templateId || !card.name || !card.path) return null;
  const base = webBaseUrl.replace(/\/+$/, '');
  const images: NormalizedImage[] = card.imagePath
    ? [{ url: /^https?:\/\//.test(card.imagePath) ? card.imagePath : `${base}${card.imagePath}`, position: 0, is_primary: true, alt_text: card.name }]
    : [];

  const badges: string[] = [];
  if (card.listPrice !== null) badges.push('descuento');
  for (const ribbon of card.ribbons) {
    const normalized = ribbon.replace(/[¡!]/g, '').trim().toLowerCase();
    if (normalized && !badges.includes(normalized)) badges.push(normalized);
  }

  return {
    external_id: card.templateId,
    name: card.name,
    url: `${base}${card.path}`,
    slug: card.path.replace(/^\/shop\//, '').replace(/-\d+$/, ''),
    condition: 'new',

    store_category_external_id: context.category?.external_id ?? null,
    category_raw: context.category?.name ?? null,
    category_path: context.categoryPath,

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
    badges,
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>, targetUrl: string | null): MeykoConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const pageSize = Number(raw.pageSize);
  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    categoryId: str('categoryId', parsePcbuildsCategoryUrl(targetUrl)?.id ?? DEFAULTS.categoryId),
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const meykoStrategy: ScrapeStrategy = {
  key: 'meyko',
  label: 'Meyko (HTML Odoo)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryId',
      label: 'Id de categoria',
      example: '338',
      description:
        'Id numerico al final de /shop/category/{slug}-{id}. Se deduce de la url del target si existe. Vacio = catalogo completo (~50 peticiones).',
    },
    {
      key: 'pageSize',
      label: 'Tarjetas por pagina',
      example: '500',
      description: 'Se pasa como ?ppg=. Odoo 15 lo honra; 1000 trae el catalogo entero en 3 MB.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config, ctx.target.url);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let pagesFetched = 0;
    const cardsById = new Map<string, MeykoCard>();
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
      for (let page = 1; ; page += 1) {
        const url = `${config.webBaseUrl}${basePath}${page === 1 ? '' : `/page/${page}`}?ppg=${config.pageSize}`;
        const html = page === 1 && firstHtml !== undefined ? firstHtml : await fetchPage(url);
        if (html === null) return false;

        const cards = parseMeykoCards(html);
        for (const card of cards) {
          count += 1;
          if (!cardsById.has(card.templateId)) cardsById.set(card.templateId, card);
          if (categoryId) {
            const list = categoriesByCard.get(card.templateId) ?? [];
            if (!list.includes(categoryId)) list.push(categoryId);
            categoriesByCard.set(card.templateId, list);
          }
        }
        // Una pagina corta es la ultima; no hace falta leer el paginador.
        if (cards.length < config.pageSize) break;
      }
      if (categoryId) perCategory[categoryId] = count;
      return true;
    }

    // 1. La raiz trae el arbol de categorias y la primera pagina del catalogo.
    const shopHtml = await fetchPage(`${config.webBaseUrl}/shop?ppg=${config.pageSize}`);
    if (shopHtml === null) return { products: [], pagesFetched, errors };
    const categories = parseMeykoCategories(shopHtml, config.webBaseUrl);
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
        selected = [{ external_id: config.categoryId, name: config.categoryId, slug: config.categoryId, level: 1 }];
      }
    }

    // Hojas primero: un listado incluye a sus hijas y la primera aparicion gana.
    const ordered = [...selected].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    let complete = true;
    for (const category of ordered) {
      const path = category.slug && category.slug !== category.external_id
        ? `/shop/category/${category.slug}-${category.external_id}`
        : `/shop/category/${category.external_id}`;
      if (!(await walk(path, category.external_id))) {
        complete = false;
        break;
      }
    }

    // 3. En el catalogo completo, /shop recoge lo que no cuelga de ninguna categoria.
    if (complete && !config.categoryId) complete = await walk('/shop', null, shopHtml);

    // 4. Traducir.
    const products: NormalizedProduct[] = [];
    for (const card of cardsById.values()) {
      const primary = categoriesByCard.get(card.templateId)?.[0] ?? null;
      const mapped = mapMeykoCard(card, config.webBaseUrl, currency, {
        category: primary ? byId.get(primary) ?? null : null,
        categoryPath: primary ? categoryPath(primary, byId) : [],
      });
      if (mapped) products.push(mapped);
    }

    if (!complete) ctx.log('warn', `Barrido incompleto: ${products.length} articulos en ${pagesFetched} paginas`);

    return {
      products,
      categories: config.categoryId ? selected.filter((c) => byId.has(c.external_id)) : categories,
      pagesFetched,
      errors,
      stats: { categoryId: config.categoryId || 'todas', pageSize: config.pageSize, categoriesWalked: ordered.length, perCategory, complete },
    };
  },
};
