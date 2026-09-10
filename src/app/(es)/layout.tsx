import type { Metadata, Viewport } from "next";
import { RootDocument } from "@/components/layout/RootDocument";
import { SITE_DESCRIPTION, SITE_TAGLINE, siteConfig } from "@/config/site";
import { SITE_KEYWORDS } from "@/lib/seo/keywords";
import { DEFAULT_ROBOTS, languageAlternates, OG_LOCALE } from "@/lib/seo/metadata";
import "../globals.css";

/**
 * Metadata por defecto de todo el árbol en español.
 *
 * Lo que se declara acá lo hereda cada página que no lo sobrescriba, así que
 * este objeto es el piso del SEO del sitio: si algo falta acá, falta en todas
 * las páginas que no lo declaren por su cuenta.
 */
export const metadata: Metadata = {
  // Sin esto, cualquier ruta relativa en canónicas, OG e imágenes se emite tal
  // cual y los buscadores no pueden resolverla. Es el requisito previo de todo
  // lo demás.
  metadataBase: new URL(siteConfig.url),

  title: {
    // El título de la portada lleva el lema: es la línea que compite en la
    // página de resultados, y "Find Your Prices" a secas no le dice a nadie
    // qué hace el sitio.
    default: `${siteConfig.name} — ${SITE_TAGLINE.es}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: SITE_DESCRIPTION.es,
  keywords: [...SITE_KEYWORDS.es],
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
    canonical: "/",
    languages: languageAlternates({ es: "/", en: "/en" }),
  },

  openGraph: {
    type: "website",
    title: `${siteConfig.name} — ${SITE_TAGLINE.es}`,
    description: SITE_DESCRIPTION.es,
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: OG_LOCALE.es,
    alternateLocale: OG_LOCALE.en,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${SITE_TAGLINE.es}`,
    description: SITE_DESCRIPTION.es,
  },

  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: siteConfig.shortName,
    statusBarStyle: "black-translucent",
  },

  /**
   * Safari convierte en enlaces telefónicos cualquier cosa que parezca un
   * número. En un catálogo lleno de precios y SKUs eso pinta media página de
   * azul y rompe el diseño; no tiene efecto en el ranking, pero sí en que la
   * página se vea como fue diseñada.
   */
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

export default function SpanishRootLayout({ children }: LayoutProps<"/">) {
  return <RootDocument locale="es">{children}</RootDocument>;
}
