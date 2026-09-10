import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { LegalDocView } from "@/features/legal/LegalDocView";
import { LEGAL_DOCS } from "@/features/legal/legalContent";

export const metadata: Metadata = {
  title: LEGAL_DOCS.es.content.title,
  description: LEGAL_DOCS.es.content.lede,
  alternates: { canonical: SITE_ROUTES.content.es, languages: alternatesFor("content") },
};

export default function UsoDeContenidoPage() {
  return (
    <PageLayout locale="es" localePaths={SITE_ROUTES.content}>
      <LegalDocView doc="content" locale="es" />
    </PageLayout>
  );
}
