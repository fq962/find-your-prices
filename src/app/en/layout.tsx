import type { Metadata, Viewport } from "next";
import { RootDocument } from "@/components/layout/RootDocument";
import { SITE_DESCRIPTION, SITE_TAGLINE, siteConfig } from "@/config/site";
import { SITE_KEYWORDS } from "@/lib/seo/keywords";
import { DEFAULT_ROBOTS, languageAlternates, OG_LOCALE } from "@/lib/seo/metadata";
import "../globals.css";

/**
 * Metadata por defecto de todo el árbol en inglés. Espejo del layout español;
 * la diferencia son los textos, el `og:locale` y la canónica, que apunta a
 * `/en` y no a la raíz.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),

  title: {
    default: `${siteConfig.name} — ${SITE_TAGLINE.en}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: SITE_DESCRIPTION.en,
  keywords: [...SITE_KEYWORDS.en],
  applicationName: siteConfig.name,
  category: "shopping",
  authors: siteConfig.creators.map((creator) => ({
    name: creator.nick,
    url: creator.url,
  })),
  creator: siteConfig.creators.map((creator) => creator.nick).join(", "),
  publisher: siteConfig.name,
  robots: DEFAULT_ROBOTS,

  alternates: {
    canonical: "/en",
    languages: languageAlternates({ es: "/", en: "/en" }),
  },

  openGraph: {
    type: "website",
    title: `${siteConfig.name} — ${SITE_TAGLINE.en}`,
    description: SITE_DESCRIPTION.en,
    url: `${siteConfig.url}/en`,
    siteName: siteConfig.name,
    locale: OG_LOCALE.en,
    alternateLocale: OG_LOCALE.es,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${SITE_TAGLINE.en}`,
    description: SITE_DESCRIPTION.en,
  },

  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: siteConfig.shortName,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, address: false, email: false },

  verification: {
    google: siteConfig.verification.google,
    yandex: siteConfig.verification.yandex,
    other: siteConfig.verification.bing
      ? { "msvalidate.01": siteConfig.verification.bing }
      : undefined,
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
