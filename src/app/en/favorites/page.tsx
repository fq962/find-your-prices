import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { FavoritesView } from "@/features/products/components/FavoritesView";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * "My favorites" (en). See the Spanish route: the list lives in the visitor's
 * browser, so the page is never indexed nor listed in the sitemap.
 */
export const metadata: Metadata = buildPageMetadata({
  locale: "en",
  title: "My favorites",
  description: "The products you marked with a heart, saved in this browser.",
  paths: alternatesFor("favorites"),
  noIndex: true,
});

export default function FavoritesPage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.favorites}>
      <FavoritesView locale="en" />
    </PageLayout>
  );
}
