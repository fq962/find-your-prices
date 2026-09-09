import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { LegalDocView } from "@/features/legal/LegalDocView";
import { LEGAL_DOCS } from "@/features/legal/legalContent";

export const metadata: Metadata = {
  title: LEGAL_DOCS.en.terms.title,
  description: LEGAL_DOCS.en.terms.lede,
  alternates: { canonical: SITE_ROUTES.terms.en, languages: alternatesFor("terms") },
};

export default function TermsPage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.terms}>
      <LegalDocView doc="terms" locale="en" />
    </PageLayout>
  );
}
