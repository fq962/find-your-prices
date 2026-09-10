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
  "Qué es Find Your Prices, de dónde salen los precios, cada cuánto se actualizan y quiénes lo hicimos. Un comparador de precios de Honduras, gratis y sin cuenta.";

export const metadata: Metadata = buildPageMetadata({
  locale: "es",
  title: "Acerca de",
  description: DESCRIPTION,
  paths: alternatesFor("about"),
});

export default function AcercaPage() {
  return (
    <PageLayout locale="es" localePaths={SITE_ROUTES.about}>
      {/* `AboutPage` y no `WebPage`: es el tipo con el que schema.org describe
          la página que explica quién está detrás de un sitio, y es de donde
          Google saca la información de la entidad. */}
      <JsonLd
        data={graph([
          organizationJsonLd("es"),
          websiteJsonLd("es"),
          contentPageJsonLd({
            type: "AboutPage",
            locale: "es",
            path: SITE_ROUTES.about.es,
            name: "Acerca de Find Your Prices",
            description: DESCRIPTION,
          }),
          breadcrumbJsonLd([
            { name: "Inicio", path: SITE_ROUTES.home.es },
            { name: "Acerca de", path: SITE_ROUTES.about.es },
          ]),
        ])}
      />
      <AboutView locale="es" />
    </PageLayout>
  );
}
