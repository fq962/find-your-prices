import type { Locale } from "@/features/i18n/translate";

/**
 * Ruta de la ficha de un producto.
 *
 * El segmento es el slug legible del artículo, no su uuid: la URL es de los
 * pocos textos que Google lee antes de entrar a la página, y es lo que se ve en
 * el resultado de búsqueda y en el enlace pegado en un chat.
 * "/p/secadora-de-pelo-dyson-supersonic" dice qué hay del otro lado;
 * "/producto/000131e8-c1ee-4dc6-af8f-b13bbc086416" no dice nada.
 *
 * El prefijo `/p` es el mismo en los dos idiomas y el idioma sigue viviendo en
 * la URL: el español no lleva prefijo (es el default del sitio) y el inglés
 * cuelga de /en. Centralizarlo evita que cada componente arme la ruta a mano y
 * se desincronice cuando cambie la estructura.
 */
export function productPath(locale: Locale, slug: string): string {
  return locale === "en" ? `/en/p/${slug}` : `/p/${slug}`;
}
