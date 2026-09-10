import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderBrandOgImage } from "@/lib/seo/ogImage";

/** Vista previa de marca para todas las páginas en inglés. */
export const alt = ogAlt("en");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderBrandOgImage("en");
}
