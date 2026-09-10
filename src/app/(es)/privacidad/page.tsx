import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { LegalDocView } from "@/features/legal/LegalDocView";
import { LEGAL_DOCS } from "@/features/legal/legalContent";

export const metadata: Metadata = {
  title: LEGAL_DOCS.es.privacy.title,
  description: LEGAL_DOCS.es.privacy.lede,
  alternates: { canonical: SITE_ROUTES.privacy.es, languages: alternatesFor("privacy") },
};

export default function PrivacidadPage() {
  return (
    <PageLayout locale="es" localePaths={SITE_ROUTES.privacy}>
      <LegalDocView doc="privacy" locale="es" />
    </PageLayout>
  );
}
