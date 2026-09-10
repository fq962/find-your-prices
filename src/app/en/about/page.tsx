import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { AboutView } from "@/features/about/AboutView";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";

/**
 * Página estática: su texto vive en el código, no en la base. Sin `revalidate`
 * Next la prerenderiza en el build y la sirve desde el CDN, que es exactamente
 * lo que corresponde a una página que sólo cambia cuando alguien la edita.
 */

export const metadata: Metadata = {
  title: "About",
  description: "What Find Your Prices is, how it works and who made it.",
  alternates: {
    canonical: SITE_ROUTES.about.en,
    languages: alternatesFor("about"),
  },
};

export default function AboutPage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.about}>
      <AboutView locale="en" />
    </PageLayout>
  );
}
