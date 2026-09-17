import { SITE_TAGLINE, siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";

/**
 * Lo que la metadata necesita saber de la tarjeta de marca, sin importar
 * `next/og`. Vive aparte de `ogImage.tsx` porque `metadata.ts` lo importan
 * componentes cliente, y `next/og` arrastra `sharp` al bundle del navegador.
 */

/** Medida canónica de una tarjeta grande. La piden Facebook, X y LinkedIn. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/** Texto alternativo. Sale como `og:image:alt`, que es lo que leen los lectores de pantalla. */
export function ogAlt(locale: Locale): string {
  return `${siteConfig.name} — ${SITE_TAGLINE[locale]}`;
}

/** Dirección estable de la tarjeta de marca (ver `app/og/[locale]`). */
export function brandOgImagePath(locale: Locale): string {
  return `/og/${locale}`;
}
