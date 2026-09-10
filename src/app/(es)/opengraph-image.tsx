import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderBrandOgImage } from "@/lib/seo/ogImage";

/**
 * Vista previa de marca para todas las páginas en español.
 *
 * Al vivir en el segmento raíz del idioma, la heredan la portada y las páginas
 * de texto sin declarar nada. Las fichas de producto la reemplazan por la foto
 * del artículo, que dice más que cualquier tarjeta de marca.
 */
export const alt = ogAlt("es");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderBrandOgImage("es");
}
