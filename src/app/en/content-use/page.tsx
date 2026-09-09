import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { alternatesFor, SITE_ROUTES } from "@/features/i18n/routes";
import { LegalDocView } from "@/features/legal/LegalDocView";
import { LEGAL_DOCS } from "@/features/legal/legalContent";

export const metadata: Metadata = {
  title: LEGAL_DOCS.en.content.title,
  description: LEGAL_DOCS.en.content.lede,
  alternates: { canonical: SITE_ROUTES.content.en, languages: alternatesFor("content") },
};

export default function ContentUsePage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.content}>
      <LegalDocView doc="content" locale="en" />
    </PageLayout>
  );
}
