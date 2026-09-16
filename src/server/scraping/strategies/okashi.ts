import type { NormalizedProduct, ScrapeStrategy } from '../types';
import { createShopifyStrategy, mapShopifyProduct, stripHtml, type ShopifyProduct } from './ladylee';

/**
 * Estrategia de scraping para Okashi HN (https://okashihn.com): manga, comics,
 * figuras y cartas coleccionables (Pokemon y One Piece TCG).
 *
 * ---------------------------------------------------------------------------
 * Por que reusa la fabrica de Ladylee
 * ---------------------------------------------------------------------------
 * okashihn.com corre sobre Shopify (`okashihn.myshopify.com`), asi que el
 * catalogo sale entero de `/collections/{handle}/products.json` sin parsear
 * html. El barrido, la paginacion y la deduplicacion son los de
 * `createShopifyStrategy`; aca solo se configura el dominio, el menu y lo que
 * Okashi agrega a la ficha (el ISBN, sobre todo).
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-16)
 * ---------------------------------------------------------------------------
 *
 *   - `/collections/all/products.json` entrega **5 886** articulos unicos en
 *     24 paginas de 250. `/collections/all.json` responde vacio (no es una
 *     coleccion real), pero la fabrica ya no pide la ficha de "all".
 *
 *   - **No hay coleccion "manga"**, y el manga es ~87% del catalogo (5 130
 *     articulos). El menu lo trata como "Coleccion Completa" (= all). Por eso
 *     se usa `uncategorizedCategory`: lo que no cayo en figuras, coleccionables,
 *     artbooks, CD/DVD ni TCG se guarda como "Manga y Comics". Medido: de esos
 *     5 130, 5 098 traen ISBN y 5 065 traen "Formato:"; el resto son packs y
 *     alguna figura de sorpresa.
 *
 *   - **products.json no trae `barcode`, pero la descripcion si.** El 89% del
 *     catalogo escribe "ISBN: 9786076383025" en `body_html`, y las figuras
 *     escriben "JAN Code: 4580590204751". Comprobado contra
 *     `/products/{handle}.json` (que si expone `variants[].barcode`): el ISBN
 *     del texto es el mismo numero. Un ISBN-13 es un EAN-13, asi que se guarda
 *     en `barcode_raw` sin una peticion por articulo. Se valida el digito
 *     verificador porque la tienda tiene ~80 codigos mal tipeados (12, 14 o 15
 *     digitos): esos se dejan en `specs` como texto pero NO en `barcode_raw`,
 *     para no emparejar con otra tienda por un numero inventado. Resultado:
 *     5 536 de 5 886 con codigo valido (94%).
 *
 *   - `product_type` viene vacio en el 100% y `sku` en null en el 100%. La
 *     "marca" util es `vendor` (la editorial: Panini Mx, Norma, Ivrea, Viz...).
 *
 *   - Una sola variante ("Default Title") en todo el catalogo: no hay tallas
 *     ni colores. `compare_at_price` es null en 5 666; de los 220 que lo traen,
 *     160 son rebaja real y 60 lo tienen igual o MENOR al precio (Adabana 3:
 *     549 con "antes" 529). La regla del proyecto ya lo filtra.
 *
 *   - Los `tags` mezclan tres cosas: genero (Accion, Drama...), idioma
 *     (Español, Ingles, Japones) y codigos de campaña (NR0825, Momiji,
 *     Aniversario3). Se guardan todos; el idioma ademas se saca a
 *     `attributes.language`.
 *
 *   - `raw` NO se guarda: desde la migracion 0026 la ingesta lo descarta.
 *
 *   - robots.txt permite el catalogo publico. El menu de colecciones se saco de
 *     los enlaces reales de `<nav>` en /collections/all; `snacks`,
 *     `box-set` y `novedades-*` existen pero no van en el barrido: la primera
 *     no tiene articulos publicados y las otras son manga que igual cae en
 *     "all" (la de novedades es una campaña que rota de nombre).
 */

const WEB_BASE_URL = 'https://okashihn.com';

/**
 * Colecciones del menu, de la mas especifica a la mas general: la
 * deduplicacion se queda con la primera aparicion, asi que un tin de Pokemon
 * tiene que verse en `pokemon-tins-mini-tins` antes que en `pokemon-sticker`
 * (el "Pokemon TCG" general) y una figura en `figura` antes que en
 * `coleccionable`.
 */
const CATEGORY_HANDLES = [
  // Pokemon TCG y sus subcolecciones
  'ultra-premium-collection',
  'premium-collection',
  'special-collection',
  'pokemon-tins-mini-tins',
  'mega-evolution',
  'scarlet-violet',
  'pokemon-accesorios',
  'pokemon-sticker',
  // One Piece TCG y sus subcolecciones
  'op-starter-decks',
  'op-tins',
  'one-piece-jp',
  'op-accesorios',
  'one-piece-tcg',
  // Resto del menu. Artbooks y CD/DVD van antes que "coleccionable" porque
  // esa coleccion tambien los contiene: en la primera corrida (2026-09-16)
  // con el orden invertido cd-dvd quedo en 0 y artbooks en 41 de 62.
  'artbooks',
  'cd-dvd',
  'figura',
  'coleccionable',
] as const;

/**
 * Rotulo por handle. El menu del sitio los anida ("Pokemon TCG > Tins & Mini
 * Tins"); como las categorias se guardan planas, el padre va en el nombre.
 * Sin esto, "Accesorios" apareceria dos veces (Pokemon y One Piece) y
 * `pokemon-sticker` se llamaria "Pokemon" a secas.
 */
const CATEGORY_LABELS: Record<string, string> = {
  'pokemon-sticker': 'Pokémon TCG',
  'ultra-premium-collection': 'Pokémon TCG · Ultra Premium Collection',
  'premium-collection': 'Pokémon TCG · Premium Collection',
  'special-collection': 'Pokémon TCG · Special Collection',
  'pokemon-tins-mini-tins': 'Pokémon TCG · Tins & Mini Tins',
  'mega-evolution': 'Pokémon TCG · Mega Evolution',
  'scarlet-violet': 'Pokémon TCG · Scarlet & Violet',
  'pokemon-accesorios': 'Pokémon TCG · Accesorios',
  'one-piece-tcg': 'One Piece TCG',
  'op-starter-decks': 'One Piece TCG · Starter Decks',
  'op-tins': 'One Piece TCG · Tins',
  'one-piece-jp': 'One Piece TCG · Booster Box (JP)',
  'op-accesorios': 'One Piece TCG · Accesorios',
  figura: 'Figuras',
  coleccionable: 'Coleccionables',
  artbooks: 'Artbooks',
  'cd-dvd': 'CD/DVD',
};

/** Categoria sintetica para lo que solo aparece en "all": el manga. */
const MANGA_CATEGORY = { external_id: 'manga', name: 'Manga y Cómics' } as const;

/** Tags de idioma del sitio -> codigo. Van sin tilde y con tilde, segun el lote. */
const LANGUAGE_TAGS: Record<string, string> = {
  español: 'es',
  espanol: 'es',
  inglés: 'en',
  ingles: 'en',
  japonés: 'ja',
  japones: 'ja',
};

// -----------------------------------------------------------------------------
// Codigos de barras
// -----------------------------------------------------------------------------

/** Digito verificador de EAN-13 (que es el mismo de un ISBN-13 y un JAN). */
export function isValidEan13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

/** Digito verificador de UPC-A (12 digitos). */
export function isValidUpc12(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits[11]);
}

export interface OkashiBarcode {
  /** Como lo rotula la tienda: ISBN, JAN, EAN, UPC... */
  label: string;
  /** Los digitos tal cual aparecen, sin espacios ni guiones. */
  digits: string;
  /** Solo si el digito verificador cuadra: es lo que va a `barcode_raw`. */
  valid: boolean;
}

/**
 * Busca el codigo de barras en el texto de la descripcion. Okashi lo escribe
 * como "ISBN: 9786076383025" en manga y "JAN Code: 4580590204751" en figuras.
 * Se lee del texto plano (sin etiquetas) porque el html separa el rotulo del
 * numero con <strong>, <span> y saltos.
 */
export function extractBarcode(descriptionText: string | null | undefined): OkashiBarcode | null {
  if (!descriptionText) return null;
  const match = /\b(ISBN|JAN\s*Code|JAN|EAN|UPC|C[oó]digo de barras|Barcode)\b\s*[:：]?\s*([0-9][0-9 -]{8,20}[0-9Xx]?)/i.exec(
    descriptionText,
  );
  if (!match) return null;

  const label = match[1].toUpperCase().replace(/\s*CODE$/, '').replace(/\s+/g, ' ');
  const digits = match[2].replace(/[^0-9Xx]/g, '').toUpperCase();
  return { label, digits, valid: isValidEan13(digits) || isValidUpc12(digits) };
}

// -----------------------------------------------------------------------------
// Ficha tecnica
// -----------------------------------------------------------------------------

/**
 * La descripcion cierra con una ficha de "Rotulo: valor" por linea (Formato,
 * Tamaño, Paginas, Color, ISBN en manga; Marca, Serie, Escultor, Material en
 * figuras). Se rescatan a `specs` para que no se pierdan cuando la base recorte
 * la descripcion a 2 000 caracteres.
 */
export function extractSpecs(descriptionText: string | null | undefined): Record<string, string> {
  const specs: Record<string, string> = {};
  if (!descriptionText) return specs;

  for (const line of descriptionText.split('\n')) {
    const match = /^\s*([A-Za-zÁÉÍÓÚÑáéíóúñü][A-Za-zÁÉÍÓÚÑáéíóúñü /()-]{1,30}?)\s*[:：]\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    // Una linea de prosa con dos puntos ("Ahora solo tiene un objetivo: ...")
    // no es ficha: los rotulos reales tienen a lo sumo tres palabras
    // ("Cantidad de discos", "Linea de producto") y valores cortos.
    if (key.split(/\s+/).length > 3) continue;
    if (value.length === 0 || value.length > 120) continue;
    if (!(key in specs)) specs[key] = value;
  }
  return specs;
}

/** Idioma de la edicion segun los tags de la tienda, o null si no lo dicen. */
export function languageFromTags(tags: string[] | undefined): string | null {
  for (const tag of tags ?? []) {
    const code = LANGUAGE_TAGS[tag.trim().toLowerCase()];
    if (code) return code;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Mapeador
// -----------------------------------------------------------------------------

/** Lo que Okashi agrega sobre el mapeo generico de Shopify. */
export function enrichOkashiProduct(mapped: NormalizedProduct, product: ShopifyProduct): NormalizedProduct {
  // `mapped.description` ya es texto plano; se vuelve a limpiar solo si faltara.
  const text = mapped.description ?? stripHtml(product.body_html);
  const barcode = extractBarcode(text);
  const specs = extractSpecs(text);
  const language = languageFromTags(product.tags);

  return {
    ...mapped,
    barcode_raw: barcode?.valid ? barcode.digits : null,
    isbn: barcode?.label === 'ISBN' && barcode.valid ? barcode.digits : null,
    // Editorial o fabricante: es lo mas cercano a "marca" que publica el sitio.
    manufacturer: product.vendor ?? null,
    specs: Object.keys(specs).length > 0 ? specs : undefined,
    attributes: {
      ...mapped.attributes,
      language,
      // El codigo tal cual, valido o no, para poder revisar los mal tipeados.
      barcodeLabel: barcode?.label ?? null,
      barcodeText: barcode?.digits ?? null,
      barcodeValid: barcode?.valid ?? null,
    },
  };
}

/** Mapeador de Okashi: el de Shopify sin `raw` + ISBN y ficha. Exportado para probarlo sin red. */
export function mapOkashiProduct(
  product: ShopifyProduct,
  currency: string,
  category: { handle: string | null; title?: string | null } = { handle: null },
): NormalizedProduct | null {
  const mapped = mapShopifyProduct(product, { webBaseUrl: WEB_BASE_URL }, currency, category, { keepRaw: false });
  return mapped ? enrichOkashiProduct(mapped, product) : null;
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const okashiStrategy: ScrapeStrategy = createShopifyStrategy({
  key: 'okashi',
  label: 'Okashi HN (Shopify JSON, sin raw)',
  webBaseUrl: WEB_BASE_URL,
  categoryHandles: CATEGORY_HANDLES,
  categoryLabels: CATEGORY_LABELS,
  keepRaw: false,
  uncategorizedCategory: MANGA_CATEGORY,
  enrich: enrichOkashiProduct,
});
