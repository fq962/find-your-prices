import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";

/**
 * Palabras clave del sitio.
 *
 * Advertencia honesta antes de tocar esto: Google ignora `<meta keywords>`
 * desde 2009. Lo que sí lee —y lo que de verdad posiciona— son el `<title>`,
 * la descripción, los encabezados y el JSON-LD. Esta lista existe por dos
 * razones que sí valen:
 *
 * 1. Buscadores que no son Google (Yandex, algunos verticales) todavía la
 *    consideran, y el catálogo apunta a un mercado chico donde eso cuenta.
 * 2. Es la fuente única de la que salen los términos que después aparecen en
 *    títulos y descripciones. Tenerlos escritos en un solo lugar evita que
 *    cada página invente los suyos.
 *
 * El criterio de la lista es intención de búsqueda real, no sinónimos: quien
 * busca "precios diunsa" quiere justo esto; quien busca "comercio electrónico"
 * no. Términos genéricos de más diluyen, no suman.
 */

/** Marca y variantes con las que la gente escribe el nombre del sitio. */
const BRAND = [
  "Find Your Prices",
  "findyourprices",
  "findyourprices.com",
];

/** Consultas por tienda: "precios diunsa", "diunsa honduras"… */
const STORE_TERMS_ES = siteConfig.stores.flatMap((store) => [
  `precios ${store.toLowerCase()}`,
  `${store.toLowerCase()} honduras`,
]);

const STORE_TERMS_EN = siteConfig.stores.flatMap((store) => [
  `${store.toLowerCase()} prices`,
  `${store.toLowerCase()} honduras`,
]);

const ES = [
  ...BRAND,
  "comparador de precios honduras",
  "comparar precios honduras",
  "precios honduras",
  "ofertas honduras",
  "descuentos honduras",
  "mejores precios honduras",
  "buscador de precios",
  "historial de precios",
  "bajadas de precio",
  "comparar precios tiendas honduras",
  "catálogo de productos honduras",
  "precios en lempiras",
  "tecnología honduras precios",
  "electrodomésticos honduras precios",
  ...STORE_TERMS_ES,
];

const EN = [
  ...BRAND,
  "price comparison honduras",
  "compare prices honduras",
  "honduras prices",
  "honduras deals",
  "honduras discounts",
  "best prices honduras",
  "price tracker honduras",
  "price history",
  "price drops",
  "online shopping honduras",
  "lempira prices",
  "electronics honduras prices",
  "appliances honduras prices",
  ...STORE_TERMS_EN,
];

export const SITE_KEYWORDS: Record<Locale, readonly string[]> = { es: ES, en: EN };

/**
 * Palabras clave de una ficha concreta.
 *
 * Se arman con lo que ese producto tiene —marca, modelo, categoría, tienda— y
 * no con la lista genérica del sitio: una ficha compite por "samsung a15
 * precio honduras", no por "comparador de precios". Se filtran los vacíos y se
 * deduplican sin distinguir mayúsculas, porque marca y modelo se repiten a
 * menudo dentro del propio nombre.
 */
export function productKeywords(
  product: {
    name: string;
    brand?: string;
    model?: string;
    category?: string;
    store: string;
    sku?: string;
  },
  locale: Locale,
): string[] {
  const priceWord = locale === "es" ? "precio" : "price";
  const country = locale === "es" ? "honduras" : "honduras";

  const candidates = [
    product.name,
    `${product.name} ${priceWord}`,
    `${product.name} ${country}`,
    product.brand,
    product.brand && `${product.brand} ${priceWord} ${country}`,
    product.model,
    product.model && `${product.model} ${priceWord}`,
    product.category,
    product.category && `${product.category} ${country}`,
    product.store,
    `${product.store} ${priceWord}`,
    product.sku,
    ...BRAND,
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const term = candidate?.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  // Más de una veintena de términos en una ficha es ruido: los buscadores que
  // aún leen la etiqueta penalizan las listas infladas.
  return result.slice(0, 20);
}
