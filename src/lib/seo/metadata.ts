import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import { SITE_KEYWORDS } from "./keywords";

/**
 * Construcción de la metadata de cada página, en un solo lugar.
 *
 * Antes cada ruta escribía su propio objeto `Metadata` a mano y el resultado
 * era desparejo: unas declaraban `canonical`, otras no; ninguna declaraba
 * Twitter; el `og:locale` no existía. Para un sitio que depende de la búsqueda
 * orgánica eso no es un detalle de estilo — una página sin canónica compite
 * consigo misma y una sin `hreflang` reparte su autoridad entre dos idiomas.
 *
 * `buildPageMetadata` obliga a declarar lo mínimo indispensable —las rutas de
 * la página en los dos idiomas— y deriva de ahí canónica, alternates y OG.
 */

/**
 * Código de idioma-región para Open Graph.
 *
 * `es_HN` y no `es_ES`: el catálogo es de Honduras, los precios están en
 * lempiras y el español que se escribe acá es voseante. Declarar la región
 * correcta es lo que hace que Facebook y WhatsApp muestren la vista previa en
 * la variante que corresponde.
 */
export const OG_LOCALE: Record<Locale, string> = {
  es: "es_HN",
  en: "en_US",
};

/**
 * `hreflang` de cada idioma. Es distinto del código de OG: aquí se usa el
 * formato BCP-47 con guion, que es el que leen los buscadores.
 */
export const HREFLANG: Record<Locale, string> = {
  es: "es-HN",
  en: "en",
};

/** Convierte una ruta del sitio en URL absoluta. Las canónicas la necesitan. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, siteConfig.url).toString();
}

/**
 * `alternates.languages` de una página, con `x-default` incluido.
 *
 * `x-default` apunta al español porque es el idioma por defecto del sitio y el
 * de su público: sin él, un buscador que no reconoce el idioma del usuario
 * elige por su cuenta, y suele elegir mal.
 */
export function languageAlternates(paths: Record<Locale, string>): Record<string, string> {
  return {
    [HREFLANG.es]: absoluteUrl(paths.es),
    [HREFLANG.en]: absoluteUrl(paths.en),
    "x-default": absoluteUrl(paths[siteConfig.defaultLocale]),
  };
}

/**
 * Directivas de indexación por defecto.
 *
 * Los `max-*` no son adorno: sin `max-image-preview: large` Google muestra una
 * miniatura diminuta de la foto del producto, y sin `max-snippet: -1` recorta
 * la descripción. En un comparador, la foto y el precio en el resultado de
 * búsqueda son la mitad del clic.
 */
export const DEFAULT_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-video-preview": -1,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};

/** Lo mismo, para lo que no debe aparecer en buscadores (el panel interno). */
export const NO_INDEX_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export interface OgImageInput {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface PageMetadataInput {
  locale: Locale;
  /** Título de la página, sin la marca: la plantilla del layout la agrega. */
  title: string;
  description: string;
  /** Rutas de ESTA misma página en los dos idiomas. */
  paths: Record<Locale, string>;
  keywords?: readonly string[];
  /**
   * Imágenes de vista previa. Si se omite, hereda la del segmento —el
   * `opengraph-image` de marca—, que es lo correcto para las páginas de texto.
   */
  images?: OgImageInput[];
  /**
   * `article` para las páginas legales, `website` para el resto y `product`
   * para las fichas.
   *
   * `product` es un caso aparte: el vocabulario tipado de Next sólo admite los
   * tipos de Open Graph que él sabe emitir, y `product` no está entre ellos
   * —pasárselo lanza en el build. Con este valor se omite `og:type` de la
   * metadata y la ficha lo emite por su cuenta junto con las etiquetas
   * `product:*`, que son las que hacen que WhatsApp y Facebook muestren el
   * precio en la vista previa. Ver `ProductOgTags`.
   */
  type?: "website" | "article" | "product";
  noIndex?: boolean;
  /** Fecha de última actualización, para las páginas de tipo `article`. */
  modifiedTime?: string;
}

/**
 * Metadata completa de una página: canónica, hreflang, Open Graph y Twitter.
 *
 * Devuelve `openGraph.images` sólo cuando se le pasan imágenes. Es a propósito:
 * si el objeto declarara `images: undefined`, Next entiende que la página ya
 * definió sus imágenes y deja de heredar el `opengraph-image` del segmento.
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const {
    locale,
    title,
    description,
    paths,
    keywords,
    images,
    type = "website",
    noIndex = false,
    modifiedTime,
  } = input;

  const canonical = absoluteUrl(paths[locale]);
  const otherLocale: Locale = locale === "es" ? "en" : "es";

  const openGraph: Metadata["openGraph"] = {
    // `product` se omite acá y lo emite la propia ficha: ver el comentario de
    // `type` en `PageMetadataInput`.
    ...(type === "product" ? {} : { type }),
    title,
    description,
    url: canonical,
    siteName: siteConfig.name,
    locale: OG_LOCALE[locale],
    alternateLocale: OG_LOCALE[otherLocale],
    ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
    ...(images ? { images } : {}),
  };

  return {
    title,
    description,
    keywords: [...(keywords ?? SITE_KEYWORDS[locale])],
    alternates: {
      canonical,
      languages: languageAlternates(paths),
    },
    robots: noIndex ? NO_INDEX_ROBOTS : DEFAULT_ROBOTS,
    openGraph,
    twitter: {
      // `summary_large_image` y no `summary`: la tarjeta grande es la que
      // muestra la foto del producto a tamaño útil.
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images } : {}),
    },
  };
}
