import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { FavoritesView } from "@/features/products/components/FavoritesView";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * "Mis favoritos" (es). La lista vive en el navegador de cada visitante, así
 * que para un buscador la página está siempre vacía: no se indexa ni va al
 * sitemap (ver `PRIVATE_PAGES`).
 */
export const metadata: Metadata = buildPageMetadata({
  locale: "es",
  title: "Mis favoritos",
  description: "Los productos que marcaste con el corazón, guardados en este navegador.",
  paths: alternatesFor("favorites"),
  noIndex: true,
});

export default function FavoritosPage() {
  return (
    <PageLayout locale="es" localePaths={SITE_ROUTES.favorites}>
      <FavoritesView locale="es" />
    </PageLayout>
  );
}
