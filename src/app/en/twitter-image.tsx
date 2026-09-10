import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderBrandOgImage } from "@/lib/seo/ogImage";

/** La misma tarjeta que el Open Graph inglés, declarada aparte para X. */
export const alt = ogAlt("en");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderBrandOgImage("en");
}
