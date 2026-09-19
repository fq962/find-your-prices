import type {
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { decodeEntities, stripLoneSurrogates } from './ladylee';

/**
 * Estrategia para Paper Depot (https://www.paperdepothn.com), libreria y
 * papeleria de oficina.
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-19)
 * ---------------------------------------------------------------------------
 * No es ninguna plataforma conocida: es un sitio PHP propio, con html
 * renderizado en el servidor y sin JSON publico. El unico endpoint ajax que
 * expone es `carrito_ajax.php`, que solo escribe en el carrito de la sesion.
 * Asi que aca SI hay que parsear html, y la tarjeta trae todo lo que la tienda
 * publica: codigo, nombre, precio e imagen.
 *
 * Rutas que importan:
 *   /                  -> el menu con las 8 categorias y sus grupos destacados
 *   /grupo/{id}?page=N -> listado de un grupo, 20 tarjetas por pagina
 *   /ofertas?page=N    -> los articulos rebajados, con precio antes y despues
 *   /producto/{codigo} -> la ficha
 *
 * Notas de campo verificadas contra el sitio:
 *   - `page` es el unico parametro de paginacion y 20 por pagina es fijo:
 *     limit, per_page, cantidad, ipp, rows, size y count no cambian nada.
 *     El bloque <nav data-pagination> trae la ultima pagina (sus href salen
 *     rotos, "/grupo/Array?page=N", pero el numero sirve).
 *   - Pedir una pagina de mas devuelve un listado vacio, no la ultima otra vez.
 *   - **El listado NO muestra la rebaja.** Un articulo en oferta aparece en su
 *     grupo con el precio de lista (06050: L. 164.28) y solo /ofertas y la
 *     ficha muestran el que se paga (L. 89.68). Publicar el listado tal cual
 *     seria publicar precios equivocados en 1 915 de 5 549 articulos, asi que
 *     toda corrida lee /ofertas y superpone esos precios.
 *   - **Los precios son SIN ISV.** La ficha dice "L. 3.89 + ISV". Se guarda el
 *     numero que publica la tienda, `tax_included: false` y `tax_rate: 15`, y
 *     el precio con impuesto queda en `attributes.price_with_tax` para quien
 *     compare contra tiendas que publican precio final.
 *   - Las imagenes del listado apuntan a `/thumbs.php?file=...`, que devuelve
 *     html (176 KB) en vez de una imagen: esta roto en el propio sitio. La
 *     buena es `/media/image.php?file=<el mismo archivo>`. El nombre del
 *     archivo no se puede derivar del codigo: unas veces es `06050.jpg` y
 *     otras `030172x.jpg`, asi que se toma el de la tarjeta.
 *   - El menu lista 63 grupos y esos son los unicos legibles. Hay mas grupos
 *     (100, 124, 139, 169, 198, 209...) que **responden 302 hacia
 *     /grupo/404.php con el listado dentro del cuerpo del propio 302**: un
 *     navegador o curl sin -L los ve, pero `fetch` sigue la redireccion y se
 *     queda con la pagina de error. Con el cliente del proyecto son
 *     inalcanzables. Los 63 grupos del menu dan 5 018 articulos; los 532 que
 *     viven solo en esos grupos rotos asoman igual en /ofertas y se publican
 *     desde ahi, sin categoria (no hay de donde sacarla). Eso solo es seguro
 *     en un barrido del menu completo: en uno parcial no se puede distinguir
 *     un huerfano de un articulo de otra categoria, y publicarlo sin
 *     categoria se la borraria en la siguiente corrida. Por eso `orphans`
 *     se ignora salvo cuando se recorre el menu entero.
 *   - Un barrido completo son 390 peticiones (1 del menu, 96 de ofertas y 293
 *     de grupos) y tarda **118 s** con 150 ms de cortesia, dentro de los 240 s
 *     del runner: cabe un solo target `full_catalog`. Medido con el cliente
 *     del proyecto, que reusa la conexion: cada pagina sale a ~0,3 s, no a los
 *     ~0,7 s que marca un curl suelto.
 *   - Un articulo pertenece a un solo grupo: medido sobre 5 018 tarjetas de
 *     los 63 grupos del menu, cero aparecen en dos. No hace falta la regla de
 *     prioridad entre targets que si necesita Metromedia.
 *   - La ficha no agrega nada util: los "detalles del producto" son tres
 *     frases fijas iguales para todos los articulos, y no hay stock, marca,
 *     codigo de barras ni descripcion.
 *   - El listado es estable entre peticiones (misma pagina, mismo contenido)
 *     y va ordenado por codigo.
 */

// -----------------------------------------------------------------------------
// Configuracion
// -----------------------------------------------------------------------------

interface PaperdepotConfig {
  webBaseUrl: string;
  /** Ids de grupo a recorrer. Vacio = los del menu de las categorias pedidas. */
  groups: string[];
  /** Ids de categoria del menu (OFI, ES, PA...). Vacio = todas. */
  categories: string[];
  /**
   * Que hacer con /ofertas:
   *   'apply' -> se lee y se superpone el precio rebajado (obligatorio para
   *              que los precios sean correctos).
   *   'skip'  -> no se lee. Solo para pruebas: deja precios de lista.
   */
  offers: 'apply' | 'skip';
  /**
   * Publicar los articulos que solo aparecen en /ofertas y en ningun grupo
   * del menu. Solo tiene efecto cuando la corrida recorre el menu entero: un
   * barrido parcial no puede saber si un articulo es huerfano o de otra
   * categoria, y publicarlo le borraria la categoria en la siguiente corrida.
   */
  orphans: boolean;
  /** Tope de paginas por grupo, por si el paginador miente. */
  maxPagesPerGroup: number;
}

const DEFAULTS: PaperdepotConfig = {
  webBaseUrl: 'https://www.paperdepothn.com',
  groups: [],
  categories: [],
  offers: 'apply',
  orphans: true,
  maxPagesPerGroup: 60,
};

/** 20 por pagina, fijo: el sitio ignora cualquier parametro de tamano. */
export const PAPERDEPOT_PAGE_SIZE = 20;
/** Tope duro de peticiones por corrida. */
const MAX_PAGES_HARD_LIMIT = 400;
/** ISV de Honduras. Los precios publicados no lo incluyen. */
const TAX_RATE = 15;

// -----------------------------------------------------------------------------
// Parseo (exportado para probarlo sin red)
// -----------------------------------------------------------------------------

export interface PaperdepotCard {
  code: string;
  name: string;
  /** Nombre del archivo tal como lo pide la tarjeta, p. ej. `030172x.jpg`. */
  imageFile: string | null;
  price: number | null;
  /** Precio antes de la rebaja; solo lo trae /ofertas. */
  listPrice: number | null;
  discountPercent: number | null;
}

/** Limpia el texto de una tarjeta: entidades, etiquetas y comillas escapadas. */
export function paperdepotText(raw: string): string {
  return stripLoneSurrogates(decodeEntities(raw.replace(/<[^>]+>/g, ' ')))
    // El sitio escribe las comillas de las medidas escapadas: 16\" -> 16"
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "L. 1,234.56" -> 1234.56. Devuelve null si no hay numero. */
export function parsePaperdepotPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // El numero empieza en el primer digito: "L. 3.89" limpiado a golpe de
  // caracteres deja ".3.89", que Number() convierte en NaN.
  const token = raw.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
  if (!token) return null;
  const value = Number(token.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/** `/media/image.php?file=X.jpg` o `/thumbs.php?file=X.jpg` -> `X.jpg`. */
export function paperdepotImageFile(src: string | null | undefined): string | null {
  const match = (src ?? '').match(/[?&]file=([^"&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * El listado vive dentro de `<div class="products-grid">`. Acotarse a ese
 * bloque no es cosmetico: un grupo vacio o inexistente devuelve la pagina
 * igual, con la tira de recomendados debajo, y sin este recorte esos cinco
 * articulos ajenos entrarian como si fueran del grupo.
 */
export function paperdepotGrid(html: string): string {
  const start = html.indexOf('class="products-grid"');
  if (start < 0) return '';
  const rest = html.slice(start);
  const end = rest.search(/<nav data-pagination>|<footer|<\/body>/);
  return end < 0 ? rest : rest.slice(0, end);
}

const LISTING_CARD =
  /<div class="product-card-related">[\s\S]*?href="\/producto\/([^"]+)"[\s\S]*?<img\s+src="([^"]*)"[\s\S]*?<h4 class="product-name">([\s\S]*?)<\/h4>[\s\S]*?<div class="product-price-related">([\s\S]*?)<\/div>/g;

/** Tarjetas de /grupo/{id} y /categoria/{id}: nunca traen rebaja. */
export function parsePaperdepotCards(html: string): PaperdepotCard[] {
  const grid = paperdepotGrid(html);
  const cards: PaperdepotCard[] = [];
  LISTING_CARD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LISTING_CARD.exec(grid)) !== null) {
    const code = decodeURIComponent(match[1]).trim();
    const name = paperdepotText(match[3]);
    if (!code || !name) continue;
    cards.push({
      code,
      name,
      imageFile: paperdepotImageFile(match[2]),
      price: parsePaperdepotPrice(match[4]),
      listPrice: null,
      discountPercent: null,
    });
  }
  return cards;
}

const OFFER_CARD = /<div class="product-card-ofertas">([\s\S]*?)(?=<div class="product-card-ofertas">|$)/g;

/** Tarjetas de /ofertas: precio anterior, precio rebajado y porcentaje. */
export function parsePaperdepotOfferCards(html: string): PaperdepotCard[] {
  const grid = paperdepotGrid(html);
  const cards: PaperdepotCard[] = [];
  OFFER_CARD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OFFER_CARD.exec(grid)) !== null) {
    const block = match[1];
    const code = block.match(/href="\/producto\/([^"]+)"/)?.[1];
    const name = block.match(/<h3 class="product-name">([\s\S]*?)<\/h3>/)?.[1];
    const price = parsePaperdepotPrice(block.match(/<span class="discount-price">([^<]*)</)?.[1]);
    if (!code || !name || price === null) continue;

    const listPrice = parsePaperdepotPrice(block.match(/<span class="original-price">([^<]*)</)?.[1]);
    const badge = block.match(/<div class="discount-badge">\s*-?(\d+)%/)?.[1];

    cards.push({
      code: decodeURIComponent(code).trim(),
      name: paperdepotText(name),
      imageFile: paperdepotImageFile(block.match(/<img\s+src="([^"]*)"/)?.[1]),
      price,
      // Solo cuenta como precio de lista si de verdad es mayor.
      listPrice: listPrice !== null && listPrice > price ? listPrice : null,
      discountPercent: badge ? Number(badge) : null,
    });
  }
  return cards;
}

/**
 * Ultima pagina segun <nav data-pagination>. Los href salen rotos
 * ("/grupo/Array?page=3") pero el numero es el bueno. Sin paginador, 1.
 */
export function parsePaperdepotLastPage(html: string): number {
  const nav = html.match(/<nav data-pagination>([\s\S]*?)<\/nav>/)?.[1];
  if (!nav) return 1;
  const pages = [...nav.matchAll(/\?page=(\d+)/g)].map((m) => Number(m[1]));
  const max = Math.max(1, ...pages.filter((n) => Number.isFinite(n)));
  return max;
}

export interface PaperdepotCategory {
  id: string;
  name: string;
  groups: Array<{ id: string; name: string }>;
}

/** El menu de la portada: 8 categorias con sus grupos destacados. */
export function parsePaperdepotNav(html: string): PaperdepotCategory[] {
  const names = new Map<string, string>();
  for (const m of html.matchAll(
    /data-cat-id="([A-Z]+)"\s*>\s*<span class="cat-name">([\s\S]*?)<\/span>/g,
  )) {
    names.set(m[1], paperdepotText(m[2]));
  }

  const categories: PaperdepotCategory[] = [];
  const panels = [...html.matchAll(/data-cat-content="([A-Z]+)"([\s\S]*?)(?=data-cat-content=|$)/g)];
  for (const [, id, block] of panels) {
    const groups = [...block.matchAll(/href="\/grupo\/(\d+)"[\s\S]*?<span class="group-name">([\s\S]*?)<\/span>/g)]
      .map((m) => ({ id: m[1], name: paperdepotText(m[2]) }));
    if (groups.length === 0) continue;
    categories.push({ id, name: names.get(id) ?? id, groups });
  }
  return categories;
}

// -----------------------------------------------------------------------------
// Mapeo
// -----------------------------------------------------------------------------

function buildImages(card: PaperdepotCard, webBaseUrl: string): NormalizedImage[] {
  if (!card.imageFile) return [];
  return [
    {
      url: `${webBaseUrl}/media/image.php?file=${encodeURIComponent(card.imageFile)}`,
      position: 0,
      is_primary: true,
      alt_text: card.name,
    },
  ];
}

/** Traduce una tarjeta al contrato comun. */
export function mapPaperdepotCard(
  card: PaperdepotCard,
  options: { webBaseUrl: string; currency: string },
  group: { id: string; name: string } | null = null,
  categoryName: string | null = null,
): NormalizedProduct | null {
  if (!card.code || !card.name || card.price === null || card.price <= 0) return null;

  const images = buildImages(card, options.webBaseUrl);
  const listPrice = card.listPrice !== null && card.listPrice > card.price ? card.listPrice : null;
  const path = [categoryName, group?.name ?? null].filter((v): v is string => Boolean(v));

  return {
    // El codigo de articulo es lo que la tienda usa en la url y en el carrito.
    external_id: card.code,
    sku: card.code,
    name: card.name,
    url: `${options.webBaseUrl}/producto/${encodeURIComponent(card.code)}`,

    // Clasificacion. Los grupos sin nombre (los que no cuelgan del menu) no
    // se publican como categoria: el articulo queda sin clasificar.
    store_category_external_id: group?.name ? group.id : null,
    category_raw: group?.name ?? null,
    category_path: path,

    // Precio. El sitio publica sin ISV y lo dice en la ficha ("+ ISV").
    currency: options.currency,
    price: card.price,
    list_price: listPrice,
    discount_amount: listPrice !== null ? Number((listPrice - card.price).toFixed(2)) : null,
    discount_percent:
      listPrice !== null
        ? Number((card.discountPercent ?? ((listPrice - card.price) / listPrice) * 100).toFixed(2))
        : null,
    tax_rate: TAX_RATE,
    tax_included: false,

    condition: 'new',
    // El sitio no publica existencias; tampoco dice que algo este agotado.
    availability: 'unknown',

    primary_image_url: images[0]?.url ?? null,
    images,

    attributes: {
      // Para comparar contra tiendas que publican precio final.
      price_with_tax: Number((card.price * (1 + TAX_RATE / 100)).toFixed(2)),
    },
    badges: listPrice !== null ? ['oferta'] : [],
  };
}

// -----------------------------------------------------------------------------
// Configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): PaperdepotConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const list = (key: string) =>
    str(key, '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

  const maxPagesPerGroup = Number(raw.maxPagesPerGroup);

  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    groups: list('groups'),
    categories: list('categories').map((v) => v.toUpperCase()),
    offers: raw.offers === 'skip' ? 'skip' : 'apply',
    orphans: raw.orphans !== false,
    maxPagesPerGroup:
      Number.isFinite(maxPagesPerGroup) && maxPagesPerGroup > 0
        ? maxPagesPerGroup
        : DEFAULTS.maxPagesPerGroup,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const paperdepotStrategy: ScrapeStrategy = {
  key: 'paperdepot',
  label: 'Paper Depot (html propio)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categories',
      label: 'Categorias del menu',
      example: 'OFI,PA',
      description:
        'Ids del menu separados por coma (ARP, CCP, ELT, ES, IMD, OFI, PA, RLJ). Se recorren sus grupos destacados. Vacio = todas.',
    },
    {
      key: 'groups',
      label: 'Ids de grupo',
      example: '100,124,139',
      description:
        'Grupos concretos, incluidos los que no aparecen en el menu (sin nombre: sus articulos quedan sin categoria). Si se define, manda sobre "categorias".',
    },
    {
      key: 'orphans',
      label: 'Publicar huerfanos de /ofertas',
      example: 'true',
      description:
        'Publica, sin categoria, los articulos que solo salen en /ofertas. Se ignora si la corrida no recorre el menu entero.',
    },
    {
      key: 'offers',
      label: 'Ofertas',
      example: 'apply',
      description:
        'apply lee /ofertas y superpone el precio rebajado (obligatorio para publicar precios correctos). skip solo sirve para pruebas.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let pagesFetched = 0;
    const get = async (url: string, stage: string): Promise<string | null> => {
      if (ctx.signal.aborted) return null;
      try {
        const html = await ctx.http.getText(url);
        pagesFetched += 1;
        return html;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage, message, meta: { url } });
        ctx.log('error', `Fallo ${url}: ${message}`);
        return null;
      }
    };

    // 1) Que grupos toca recorrer. Los explicitos mandan; si no, los del menu.
    const groupsToSweep: Array<{ id: string; name: string; categoryName: string | null }> = [];
    let navCategories: PaperdepotCategory[] = [];

    const home = await get(`${config.webBaseUrl}/`, 'nav');
    if (home) navCategories = parsePaperdepotNav(home);
    if (navCategories.length === 0) {
      errors.push({ stage: 'nav', message: 'No se pudo leer el menu de categorias' });
    }

    const navById = new Map<string, { name: string; categoryName: string }>();
    for (const category of navCategories) {
      for (const group of category.groups) {
        navById.set(group.id, { name: group.name, categoryName: category.name });
      }
    }

    // Solo un barrido del menu completo puede distinguir un huerfano de un
    // articulo de otra categoria.
    const sweepsWholeMenu =
      config.groups.length === 0 && config.categories.length === 0 && navCategories.length > 0;

    if (config.groups.length > 0) {
      for (const id of config.groups) {
        const known = navById.get(id);
        groupsToSweep.push({
          id,
          name: known?.name ?? '',
          categoryName: known?.categoryName ?? null,
        });
      }
    } else {
      const wanted = new Set(config.categories);
      for (const category of navCategories) {
        if (wanted.size > 0 && !wanted.has(category.id)) continue;
        for (const group of category.groups) {
          groupsToSweep.push({ id: group.id, name: group.name, categoryName: category.name });
        }
      }
    }

    if (groupsToSweep.length === 0) {
      errors.push({ stage: 'nav', message: 'Ningun grupo que recorrer con esta configuracion' });
      return { products: [], pagesFetched, errors };
    }

    // 2) Las ofertas primero: el listado de grupo publica el precio de lista
    //    incluso cuando el articulo esta rebajado.
    const offers = new Map<string, PaperdepotCard>();
    if (config.offers === 'apply') {
      let page = 1;
      while (pagesFetched < maxPages) {
        const html = await get(`${config.webBaseUrl}/ofertas?page=${page}`, 'offers');
        if (html === null) break;
        const cards = parsePaperdepotOfferCards(html);
        const fresh = cards.filter((card) => !offers.has(card.code));
        for (const card of cards) if (!offers.has(card.code)) offers.set(card.code, card);
        if (fresh.length === 0) break;
        page += 1;
      }
      ctx.log('info', `Ofertas leidas: ${offers.size} en ${page - 1} paginas`);
    }

    // 3) Los grupos.
    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    const perGroup: Record<string, number> = {};
    const categories = new Map<string, NormalizedCategory>();

    for (const group of groupsToSweep) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo' });
        break;
      }
      if (pagesFetched >= maxPages) {
        errors.push({ stage: 'paginate', message: `Se alcanzo el tope de ${maxPages} paginas` });
        break;
      }

      let lastPage = config.maxPagesPerGroup;
      let count = 0;

      for (let page = 1; page <= Math.min(lastPage, config.maxPagesPerGroup); page += 1) {
        if (ctx.signal.aborted || pagesFetched >= maxPages) break;

        const html = await get(`${config.webBaseUrl}/grupo/${group.id}?page=${page}`, 'paginate');
        if (html === null) break;
        if (page === 1) lastPage = parsePaperdepotLastPage(html);

        const cards = parsePaperdepotCards(html);
        // Pedir una pagina de mas devuelve un listado vacio: ahi se corta.
        if (cards.length === 0) break;

        for (const card of cards) {
          if (seen.has(card.code)) continue;
          const offer = offers.get(card.code);
          const mapped = mapPaperdepotCard(
            offer ? { ...card, ...offer, imageFile: card.imageFile ?? offer.imageFile } : card,
            { webBaseUrl: config.webBaseUrl, currency },
            group.name ? { id: group.id, name: group.name } : null,
            group.categoryName,
          );
          if (!mapped) continue;
          seen.add(card.code);
          products.push(mapped);
          count += 1;
        }

        if (cards.length < PAPERDEPOT_PAGE_SIZE) break;
      }

      perGroup[group.name || `grupo-${group.id}`] = count;

      if (group.name) {
        if (group.categoryName && !categories.has(group.categoryName)) {
          categories.set(group.categoryName, {
            external_id: `cat-${group.categoryName}`,
            name: group.categoryName,
            external_parent_id: null,
            level: 0,
          });
        }
        categories.set(group.id, {
          external_id: group.id,
          name: group.name,
          external_parent_id: group.categoryName ? `cat-${group.categoryName}` : null,
          url: `${config.webBaseUrl}/grupo/${group.id}`,
          level: group.categoryName ? 1 : 0,
          product_count: count,
        });
      }
    }

    // 4) Los articulos que solo viven en /ofertas. Sus grupos responden 302
    //    hacia /grupo/404.php y el cliente sigue la redireccion, asi que no
    //    hay forma de saber su categoria: se publican sin ella.
    let orphans = 0;
    if (config.orphans && sweepsWholeMenu && config.offers === 'apply' && errors.length === 0) {
      for (const card of offers.values()) {
        if (seen.has(card.code)) continue;
        const mapped = mapPaperdepotCard(card, { webBaseUrl: config.webBaseUrl, currency });
        if (!mapped) continue;
        seen.add(card.code);
        products.push(mapped);
        orphans += 1;
      }
      ctx.log('info', `Articulos solo en /ofertas publicados sin categoria: ${orphans}`);
    }

    const withOffer = products.filter((product) => product.list_price !== null).length;

    return {
      products,
      categories: categories.size > 0 ? [...categories.values()] : undefined,
      pagesFetched,
      errors,
      stats: {
        groups: groupsToSweep.length,
        offersIndexed: offers.size,
        productsWithOffer: withOffer,
        orphansPublished: orphans,
        wholeMenu: sweepsWholeMenu,
        perGroup,
      },
    };
  },
};
