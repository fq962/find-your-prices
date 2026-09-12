import type { NormalizedProduct, ScrapeContext, ScrapeResult, ScrapeStrategy } from '../types';
import { decodeEntities, stripLoneSurrogates, toNumber } from './ladylee';

/**
 * Estrategia para Game Station (https://gamestation.hn), WooCommerce.
 *
 * Reconocimiento (2026-09-12):
 *   - Store API (/wp-json/wc/store) y wc/v3 estan cerradas (rest_no_route).
 *   - /wp-json/wp/v2/product responde (6152 items) pero SIN precio ni stock.
 *   - El html de categoria es SSR real y trae precio, stock e imagen. Es la
 *     unica fuente completa. 12 por pagina, fijo: ningun parametro lo sube.
 *   - Paginacion: /product-category/{slug}/page/N/. Total en
 *     "Showing 1–12 of N results".
 *   - 4137 productos visibles = 345 paginas: no cabe en una corrida. Se
 *     scrapea por categoria (la mayor, Nintendo, son 120 paginas).
 *   - Por pedido explicito NO se guarda `raw`: la tarjeta html no aporta nada
 *     reprocesable mas alla de lo que ya se extrae.
 */

const DEFAULTS = { webBaseUrl: 'https://gamestation.hn', categorySlug: 'switch' } as const;
const PAGE_SIZE = 12;
const MAX_PAGES_HARD_LIMIT = 400;

/** Slug de categoria -> rotulo del menu principal. */
const CATEGORY_LABELS: Record<string, string> = {
  switch: 'Nintendo',
  play4: 'Playstation',
  xbox: 'Xbox',
  tecno: 'Tecnologia',
  'figuras-2': 'Coleccionables',
  'gift-cards': 'Codigos digitales',
};

export function categorySlugFromUrl(url: string | null | undefined): string | null {
  const m = /\/product-category\/([a-z0-9-]+)/i.exec(url ?? '');
  return m ? m[1].toLowerCase() : null;
}

/** "Showing 1–12 of 1435 results" -> 1435 */
export function parseTotal(html: string): number | null {
  const m = /Showing[^<]*?of\s+([\d,.]+)\s+results/i.exec(html) ?? /(\d[\d,.]*)\s+results/i.exec(html);
  return m ? toNumber(m[1].replace(/[.,]/g, '')) : null;
}

/** Ultimo numero de /page/N/ que enlaza la paginacion. */
export function parseLastPage(html: string): number | null {
  const pages = [...html.matchAll(/\/page\/(\d+)\//g)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : null;
}

function clean(text: string): string {
  return stripLoneSurrogates(decodeEntities(text.replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "L1,690.00" -> 1690 */
function parsePrice(fragment: string | undefined): number | null {
  if (!fragment) return null;
  const m = /([\d][\d,]*\.?\d*)/.exec(fragment.replace(/<[^>]+>/g, ''));
  return m ? toNumber(m[1].replace(/,/g, '')) : null;
}

export interface GamestationCard {
  id: string;
  url: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  listPrice: number | null;
  inStock: boolean | null;
  categorySlugs: string[];
}

/** Extrae las tarjetas `<li class="post-N product ...">` de una pagina. */
export function parseCards(html: string): GamestationCard[] {
  const cards: GamestationCard[] = [];
  const re = /<li class="post-(\d+) product ([^"]*)">([\s\S]*?)<\/li>/g;
  for (const m of html.matchAll(re)) {
    const [, id, classes, body] = m;
    const href = /href="([^"]+)"/.exec(body)?.[1];
    const title = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body)?.[1];
    if (!href || !title) continue;

    const img = /<img[^>]*\ssrc="([^"]+)"/.exec(body)?.[1] ?? null;
    const priceBlock = /<span class="price">([\s\S]*?)<\/span>\s*<\/a>/.exec(body)?.[1] ?? '';
    // WooCommerce marca la rebaja con <del>antes</del> <ins>ahora</ins>.
    const del = /<del[^>]*>([\s\S]*?)<\/del>/.exec(priceBlock)?.[1];
    const ins = /<ins[^>]*>([\s\S]*?)<\/ins>/.exec(priceBlock)?.[1];
    const price = parsePrice(ins ?? priceBlock);
    const old = parsePrice(del);

    cards.push({
      id,
      url: href,
      name: clean(title),
      imageUrl: img ? (img.startsWith('//') ? `https:${img}` : img) : null,
      price,
      listPrice: old !== null && price !== null && old > price ? old : null,
      inStock: /\boutofstock\b/.test(classes) ? false : /\binstock\b/.test(classes) ? true : null,
      categorySlugs: [...classes.matchAll(/product_cat-([a-z0-9-]+)/g)].map((c) => c[1]),
    });
  }
  return cards;
}

export function mapGamestationCard(
  card: GamestationCard,
  currency: string,
  categorySlug: string,
): NormalizedProduct {
  return {
    external_id: card.id,
    name: card.name,
    url: card.url,
    slug: card.url.split('/').filter(Boolean).pop() ?? null,
    condition: 'new',
    // Un articulo aparece en varias categorias (Xbox y Playstation, etc.). Si
    // se le pusiera la del target, cada corrida lo cambiaria de categoria y el
    // hash marcaria "actualizado" sin que nada cambie. Se usa la primera
    // categoria de la propia tarjeta, que es estable entre listados.
    store_category_external_id: card.categorySlugs.find((c) => c in CATEGORY_LABELS) ?? categorySlug,
    category_raw: CATEGORY_LABELS[card.categorySlugs.find((c) => c in CATEGORY_LABELS) ?? categorySlug] ?? categorySlug,
    category_path: card.categorySlugs,
    currency,
    price: card.price,
    list_price: card.listPrice,
    discount_amount:
      card.listPrice !== null && card.price !== null ? Number((card.listPrice - card.price).toFixed(2)) : null,
    tax_included: true,
    in_stock: card.inStock,
    availability: card.inStock === null ? 'unknown' : card.inStock ? 'in_stock' : 'out_of_stock',
    primary_image_url: card.imageUrl,
    images: card.imageUrl ? [{ url: card.imageUrl, position: 0, is_primary: true }] : [],
    badges: card.listPrice !== null ? ['descuento'] : [],
  };
}

export const gamestationStrategy: ScrapeStrategy = {
  key: 'gamestation',
  label: 'Game Station (HTML WooCommerce)',
  supports: ['category'],
  configSchema: [
    {
      key: 'categorySlug',
      label: 'Slug de categoria',
      required: true,
      example: 'switch',
      description: 'Segmento de /product-category/<slug>/. Se deduce de la url del target si existe.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const webBaseUrl = (typeof ctx.config.webBaseUrl === 'string' ? ctx.config.webBaseUrl : DEFAULTS.webBaseUrl).replace(/\/+$/, '');
    const categorySlug =
      (typeof ctx.config.categorySlug === 'string' && ctx.config.categorySlug) ||
      categorySlugFromUrl(ctx.target.url) ||
      DEFAULTS.categorySlug;
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    let pagesFetched = 0;
    let totalReported: number | undefined;
    let lastPage: number | undefined;

    for (let page = 1; page <= maxPages; page += 1) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo', meta: { page } });
        break;
      }
      const url = page === 1
        ? `${webBaseUrl}/product-category/${categorySlug}/`
        : `${webBaseUrl}/product-category/${categorySlug}/page/${page}/`;

      let html: string;
      try {
        html = await ctx.http.getText(url);
      } catch (error) {
        errors.push({ stage: 'paginate', message: String(error), meta: { page } });
        ctx.log('error', `Fallo la pagina ${page}: ${String(error)}`);
        break;
      }
      pagesFetched += 1;
      if (page === 1) {
        totalReported = parseTotal(html) ?? undefined;
        lastPage = parseLastPage(html) ?? undefined;
      }

      const cards = parseCards(html);
      if (cards.length === 0) break;
      for (const card of cards) {
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        products.push(mapGamestationCard(card, currency, categorySlug));
      }
      if (cards.length < PAGE_SIZE) break;
      if (lastPage !== undefined && page >= lastPage) break;
      if (totalReported !== undefined && products.length >= totalReported) break;
    }

    if (totalReported !== undefined && products.length < totalReported) {
      ctx.log('warn', `Se obtuvieron ${products.length} de ${totalReported} que reporta la tienda`);
    }

    return {
      products,
      categories: [{ external_id: categorySlug, name: CATEGORY_LABELS[categorySlug] ?? categorySlug, slug: categorySlug, url: `${webBaseUrl}/product-category/${categorySlug}/`, level: 1, product_count: totalReported ?? null }],
      pagesFetched,
      totalReported,
      errors,
      stats: { categorySlug, totalReported, lastPage },
    };
  },
};
