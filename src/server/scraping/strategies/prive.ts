import type { NormalizedProduct, ScrapeStrategy } from '../types';
import { createShopifyStrategy, mapShopifyProduct, type ShopifyProduct } from './ladylee';

/**
 * Estrategia de scraping para Prive Perfumes (https://priveperfumes.com):
 * perfumeria comercial, de nicho y arabe, estuches y algo de cuidado corporal.
 *
 * ---------------------------------------------------------------------------
 * Por que reusa la fabrica de Ladylee
 * ---------------------------------------------------------------------------
 * El sitio corre sobre Shopify, asi que el catalogo sale entero de
 * `/collections/{handle}/products.json` sin parsear html. El barrido, la
 * paginacion y la deduplicacion son los de `createShopifyStrategy`; aca solo se
 * configura el dominio, el menu y lo que Prive agrega a la ficha.
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-22)
 * ---------------------------------------------------------------------------
 *
 *   - `/collections/all/products.json` entrega **3 929** fichas en 16 paginas
 *     de 250. `todo-en-perfumeria` (la pagina que pidieron) declara 3 900 y
 *     entrega 3 639: es un subconjunto de "all" sin gift cards ni body
 *     products, asi que el barrido cierra con "all" y no con ella.
 *
 *   - **Combined Listings.** 893 fichas llevan el tag `combined_listing`: son
 *     la ficha "padre" que agrupa los tamaños de un perfume ("4711 Acqua
 *     Colonia ... EDC (U)" con 100 ml y 170 ml). Cada tamaño existe ademas como
 *     producto propio ("... / 100 ml") con el MISMO id de variante. Guardar las
 *     dos cosas duplicaria el catalogo, y la tienda enlaza solo a los hijos (12
 *     de 12 enlaces de la pagina de categoria son hijos). Las variantes del
 *     padre que no tienen hijo (401) vienen sin sku y agotadas: no se pierde
 *     nada vendible al descartar los padres. Quedan **3 036** articulos.
 *
 *   - Cada hijo tiene una sola variante: el tamaño va en el nombre ("/ 100 ml")
 *     y en `variants[0].title` ("100 ml", "Estuche 100 ml · Kit 2") o
 *     "Default Title". Se saca a `size` y, si es un solo frasco en ml, a
 *     `unit_amount`/`unit_measure_code` para poder comparar por mililitro.
 *
 *   - El genero y la concentracion vienen como tags estructurados:
 *     `Para_Damas|Caballeros|Unisex|Niñas|Niños|Bebé` y
 *     `Concentración_Eau de Parfum|Eau de Toilette|Parfum|Eau de Cologne`. El
 *     resto de tags son codigos de campaña que rotan (black-week-2025-...,
 *     new-june-2026, VINETA-DIV8): si se guardaran, cada campaña cambiaria el
 *     hash del catalogo entero. Se conservan solo los estructurados y los de
 *     segmento (commercial, exclusiva, arabe, niche).
 *
 *   - products.json no trae codigo de barras y la descripcion tampoco (0 de
 *     3 929 con 12-13 digitos). El sku ("G800010") es codigo interno.
 *
 *   - `compare_at_price` viene en 183 fichas y en las 183 es rebaja real.
 *
 *   - Gift cards (5): no son un producto comparable. Se descartan.
 *
 *   - `products.json` responde 503 de vez en cuando (1 de ~60 peticiones en el
 *     reconocimiento); el cliente http ya reintenta los 503.
 *
 *   - robots.txt permite el catalogo publico (`Allow: /`).
 */

const WEB_BASE_URL = 'https://priveperfumes.com';

/**
 * Colecciones del menu, de la mas especifica a la mas general: la
 * deduplicacion se queda con la primera aparicion. Los segmentos por publico
 * (bebe, niños) y por formato (mini, body, estuches) van antes que los de
 * precio (arabe, exclusiva, economica, comercial), que son los contenedores
 * grandes. Solapes medidos: estuches ∩ arabe 12, mini ∩ comercial 11,
 * bebe ∩ comercial 8, estuches ∩ niños 7. `gift-cards` no se recorre.
 */
const CATEGORY_HANDLES = [
  'perfumeria-bebe',
  'perfumeria-ninos',
  'perfumeria-mini',
  'body-products',
  'gift-sets',
  'perfumeria-arabe',
  'perfumeria-exclusiva',
  'perfumeria-economica',
  'perfumeria-comercial',
] as const;

/** Los titulos de Shopify llevan prefijo interno ("Tienda: ", "Segmento: "). */
const CATEGORY_LABELS: Record<string, string> = {
  'perfumeria-bebe': 'Perfumería Bebé',
  'perfumeria-ninos': 'Perfumería Niños',
  'perfumeria-mini': 'Perfumería Mini',
  'body-products': 'Body Products',
  'gift-sets': 'Estuches',
  'perfumeria-arabe': 'Perfumería Árabe',
  'perfumeria-exclusiva': 'Perfumería Exclusiva',
  'perfumeria-economica': 'Perfumería Económica',
  'perfumeria-comercial': 'Perfumería Comercial',
};

/** Categoria sintetica para lo que solo aparece en "all" (~130 perfumes). */
const UNCATEGORIZED = { external_id: 'perfumeria', name: 'Perfumería' } as const;

const GENDER_TAGS: Record<string, string> = {
  damas: 'mujer',
  caballeros: 'hombre',
  unisex: 'unisex',
  niñas: 'niña',
  niños: 'niño',
  bebé: 'bebe',
};

/** Rotulo del titulo -> genero, para las fichas sin tag Para_. */
const GENDER_TITLE_CODES: Record<string, string> = { W: 'mujer', M: 'hombre', U: 'unisex', MUJERES: 'mujer' };

const KEPT_TAGS = new Set(['commercial', 'exclusiva', 'arabe', 'niche']);

// -----------------------------------------------------------------------------
// Utilidades (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

/** Ficha agrupadora de Combined Listings: sus tamaños ya existen como productos. */
export function isCombinedListingParent(product: ShopifyProduct): boolean {
  return (product.tags ?? []).includes('combined_listing');
}

export function isGiftCard(product: ShopifyProduct): boolean {
  return (product.product_type ?? '').toLowerCase() === 'gift cards' || /^gift card\b/i.test(product.title);
}

/** Valor de un tag estructurado "Prefijo_Valor", o null. */
export function structuredTag(tags: string[] | undefined, prefix: string): string | null {
  const tag = (tags ?? []).find((t) => t.startsWith(`${prefix}_`));
  const value = tag?.slice(prefix.length + 1).trim();
  return value ? value : null;
}

export function genderOf(product: ShopifyProduct): string | null {
  const tag = structuredTag(product.tags, 'Para');
  if (tag) return GENDER_TAGS[tag.toLowerCase()] ?? tag.toLowerCase();
  const code = /\((W|M|U|Mujeres)\)/i.exec(product.title)?.[1]?.toUpperCase();
  return code ? (GENDER_TITLE_CODES[code] ?? null) : null;
}

/**
 * Presentacion del articulo: el titulo de la variante si es real ("100 ml",
 * "Estuche 100 ml · Kit 2"), si no lo que sigue a la ultima " / " del nombre.
 */
export function presentationOf(product: ShopifyProduct): string | null {
  const variantTitle = product.variants?.[0]?.title?.trim();
  if (variantTitle && variantTitle !== 'Default Title') return variantTitle;
  const slash = product.title.lastIndexOf(' / ');
  const suffix = slash >= 0 ? product.title.slice(slash + 3).trim() : '';
  return suffix || null;
}

/** Mililitros de un frasco suelto ("100 ml", "100 ml UL"); null en estuches y kits. */
export function millilitersOf(presentation: string | null): number | null {
  if (!presentation) return null;
  const match = /^(\d+(?:[.,]\d+)?)\s*ml\b(?:\s+UL)?$/i.exec(presentation.trim());
  return match ? Number(match[1].replace(',', '.')) : null;
}

// -----------------------------------------------------------------------------
// Mapeador
// -----------------------------------------------------------------------------

/** Lo que Prive agrega sobre el mapeo generico de Shopify. Null descarta el articulo. */
export function enrichPriveProduct(mapped: NormalizedProduct, product: ShopifyProduct): NormalizedProduct | null {
  if (isCombinedListingParent(product) || isGiftCard(product)) return null;

  const tags = product.tags ?? [];
  const gender = genderOf(product);
  const concentration = structuredTag(tags, 'Concentración');
  const presentation = presentationOf(product);
  const ml = millilitersOf(presentation);
  const boxDamaged = /^\*\s*daño de caja\s*\*/i.test(product.title);

  const specs: Record<string, string> = {};
  if (concentration) specs['Concentración'] = concentration;
  if (presentation) specs['Presentación'] = presentation;
  if (gender) specs['Género'] = gender;

  return {
    ...mapped,
    // Una sola variante por hijo: la fila de variante solo repetiria el producto.
    variants: [],
    manufacturer: product.vendor ?? null,
    size: presentation,
    unit_amount: ml,
    unit_measure_code: ml !== null ? 'ml' : null,
    unit_measure_name: ml !== null ? 'mililitro' : null,
    tags: tags.filter((t) => t.startsWith('Para_') || t.startsWith('Concentración_') || KEPT_TAGS.has(t)),
    badges: boxDamaged ? [...(mapped.badges ?? []), 'caja dañada'] : mapped.badges,
    specs: Object.keys(specs).length > 0 ? specs : undefined,
    attributes: {
      ...mapped.attributes,
      gender,
      concentration,
      boxDamaged,
    },
  };
}

/** Mapeador de Prive: el de Shopify sin `raw` + genero, concentracion y tamaño. */
export function mapPriveProduct(
  product: ShopifyProduct,
  currency: string,
  category: { handle: string | null; title?: string | null } = { handle: null },
): NormalizedProduct | null {
  const mapped = mapShopifyProduct(product, { webBaseUrl: WEB_BASE_URL }, currency, category, { keepRaw: false });
  return mapped ? enrichPriveProduct(mapped, product) : null;
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const priveStrategy: ScrapeStrategy = createShopifyStrategy({
  key: 'prive',
  label: 'Prive Perfumes (Shopify JSON, sin raw)',
  webBaseUrl: WEB_BASE_URL,
  categoryHandles: CATEGORY_HANDLES,
  categoryLabels: CATEGORY_LABELS,
  keepRaw: false,
  uncategorizedCategory: UNCATEGORIZED,
  enrich: enrichPriveProduct,
});
