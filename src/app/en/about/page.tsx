import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { AboutView } from "@/features/about/AboutView";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import {
  breadcrumbJsonLd,
  contentPageJsonLd,
  graph,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/schema";
import { JsonLd } from "@/lib/seo/JsonLd";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Página estática: su texto vive en el código, no en la base. Sin `revalidate`
 * Next la prerenderiza en el build y la sirve desde el CDN, que es exactamente
 * lo que corresponde a una página que sólo cambia cuando alguien la edita.
 */

const DESCRIPTION =
  "What Find Your Prices is, where the prices come from, how often they refresh and who built it. A free price comparison site for Honduras, no account needed.";

export const metadata: Metadata = buildPageMetadata({
  locale: "en",
  title: "About",
  description: DESCRIPTION,
  paths: alternatesFor("about"),
});

export default function AboutPage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.about}>
      <JsonLd
        data={graph([
          organizationJsonLd("en"),
          websiteJsonLd("en"),
          contentPageJsonLd({
            type: "AboutPage",
            locale: "en",
            path: SITE_ROUTES.about.en,
            name: "About Find Your Prices",
            description: DESCRIPTION,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: SITE_ROUTES.home.en },
            { name: "About", path: SITE_ROUTES.about.en },
          ]),
        ])}
      />
      <AboutView locale="en" />
    </PageLayout>
  );
}
