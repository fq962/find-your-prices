import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderBrandOgImage } from "@/lib/seo/ogImage";

/**
 * La misma tarjeta, declarada aparte para X.
 *
 * Next no reutiliza el `opengraph-image` como `twitter:image`: son dos
 * convenciones distintas y sólo emite la etiqueta que encuentra. El rastreador
 * de X cae en `og:image` cuando no hay `twitter:image`, así que esto es un
 * seguro, no un requisito — pero es un seguro de tres líneas.
 */
export const alt = ogAlt("es");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderBrandOgImage("es");
}
