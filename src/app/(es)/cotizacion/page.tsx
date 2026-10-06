import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { QuoteView } from "@/features/cart/components/QuoteView";
import { SHARE_PARAM } from "@/features/cart/share";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * "Cotización" (es): el carrito convertido en recorrido por tiendas. Como
 * favoritos, la lista vive en el navegador —o en el enlace compartido—, así
 * que no se indexa ni va al sitemap (ver `PRIVATE_PAGES`).
 */
export const metadata: Metadata = buildPageMetadata({
  locale: "es",
  title: "Cotización",
  description: "Tu lista de compras ordenada por tienda y categoría, con precios vigentes.",
  paths: alternatesFor("quote"),
  noIndex: true,
});

export default async function CotizacionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const shared = (await searchParams)[SHARE_PARAM];
  return (
    <PageLayout locale="es" localePaths={SITE_ROUTES.quote}>
      <QuoteView locale="es" shared={typeof shared === "string" ? shared : undefined} />
    </PageLayout>
  );
}
