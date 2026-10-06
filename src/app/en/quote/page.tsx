import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { QuoteView } from "@/features/cart/components/QuoteView";
import { SHARE_PARAM } from "@/features/cart/share";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * "Quote" (en). See the Spanish route: the list lives in the browser or in
 * the shared link, so the page is never indexed nor listed in the sitemap.
 */
export const metadata: Metadata = buildPageMetadata({
  locale: "en",
  title: "Quote",
  description: "Your shopping list arranged by store and category, with current prices.",
  paths: alternatesFor("quote"),
  noIndex: true,
});

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const shared = (await searchParams)[SHARE_PARAM];
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.quote}>
      <QuoteView locale="en" shared={typeof shared === "string" ? shared : undefined} />
    </PageLayout>
  );
}
