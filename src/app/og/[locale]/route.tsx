import { renderBrandOgImage } from "@/lib/seo/ogImage";

/**
 * La tarjeta de marca en una dirección estable: `/og/es` y `/og/en`.
 *
 * Existe porque los `opengraph-image.tsx` de cada segmento NO se heredan:
 * en cuanto una página declara su propio `openGraph` (lo hacen todas, por la
 * canónica y el título), Next deja de emitir la imagen del segmento y la
 * página sale sin `og:image`. Pasó con categorías, tiendas, "Acerca de" y
 * las legales. Y la ruta que Next genera para el archivo lleva un sufijo
 * (`/opengraph-image-35z9gd`) que no se puede escribir a mano.
 *
 * `buildPageMetadata` apunta acá cuando la página no trae imagen propia.
 */
export const revalidate = 86_400;

export function generateStaticParams(): Array<{ locale: string }> {
  return [{ locale: "es" }, { locale: "en" }];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  return renderBrandOgImage(locale === "en" ? "en" : "es");
}
