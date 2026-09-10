import type { Metadata } from "next";
import { PageLayout } from "@/components/layout/PageLayout";
import { SITE_ROUTES } from "@/features/i18n/routes";
import { legalJsonLd, legalMetadata } from "@/lib/seo/legalSeo";
import { JsonLd } from "@/lib/seo/JsonLd";
import { LegalDocView } from "@/features/legal/LegalDocView";

export const metadata: Metadata = legalMetadata("content", "en");

export default function ContentUsePage() {
  return (
    <PageLayout locale="en" localePaths={SITE_ROUTES.content}>
      <JsonLd data={legalJsonLd("content", "en")} />
      <LegalDocView doc="content" locale="en" />
    </PageLayout>
  );
}
