import type { Locale } from "@/features/i18n/translate";

/**
 * Ruta de la ficha de un producto.
 *
 * El idioma vive en la URL y cada uno usa su propio sustantivo: el español no
 * lleva prefijo (es el idioma por defecto del sitio) y el inglés cuelga de
 * /en. Centralizarlo evita que cada componente arme la ruta a mano y se
 * desincronice cuando cambie la estructura.
 */
export function productPath(locale: Locale, id: string): string {
  return locale === "en" ? `/en/product/${id}` : `/producto/${id}`;
}
