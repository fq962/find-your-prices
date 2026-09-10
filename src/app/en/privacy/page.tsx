import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { LegalDocView } from "@/features/legal/LegalDocView";
import { LEGAL_DOCS } from "@/features/legal/legalContent";

export const metadata: Metadata = {
  title: LEGAL_DOCS.en.privacy.title,
  description: LEGAL_DOCS.en.privacy.lede,
  alternates: { canonical: SITE_ROUTES.privacy.en, languages: alternatesFor("privacy") },
};

export default function PrivacyPage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.privacy}>
      <LegalDocView doc="privacy" locale="en" />
    </PageLayout>
  );
}
