import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { SITE_ROUTES } from "@/features/i18n/routes";
import { legalJsonLd, legalMetadata } from "@/lib/seo/legalSeo";
import { JsonLd } from "@/lib/seo/JsonLd";
import { LegalDocView } from "@/features/legal/LegalDocView";

export const metadata: Metadata = legalMetadata("content", "es");

export default function UsoDeContenidoPage() {
  return (
    <PageLayout locale="es" localePaths={SITE_ROUTES.content}>
      <JsonLd data={legalJsonLd("content", "es")} />
      <LegalDocView doc="content" locale="es" />
    </PageLayout>
  );
}
