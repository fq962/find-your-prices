import type { Metadata, Viewport } from "next";
import { RootDocument } from "@/components/layout/RootDocument";
import { siteConfig } from "@/config/site";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: "Compare prices across stores, all in one place.",
  metadataBase: new URL(siteConfig.url),
  alternates: {
    canonical: "/en",
    languages: { es: "/", en: "/en" },
  },
  openGraph: {
    title: siteConfig.name,
    description: "Compare prices across stores, all in one place.",
    url: `${siteConfig.url}/en`,
    siteName: siteConfig.name,
    locale: "en",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
  ],
};

export default function EnglishRootLayout({ children }: LayoutProps<"/en">) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
