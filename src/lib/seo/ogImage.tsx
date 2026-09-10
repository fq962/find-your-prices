import { ImageResponse } from "next/og";
import { SITE_TAGLINE, siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";

/**
 * Imagen de vista previa de marca (Open Graph / Twitter).
 *
 * Es la tarjeta que se ve cuando alguien pega un enlace del sitio en WhatsApp,
 * Facebook o X. Sin ella, esas plataformas eligen por su cuenta —normalmente
 * un recorte arbitrario de la página, o nada— y el enlace se ve roto. En un
 * sitio que se comparte por WhatsApp, que es como circula casi todo en
 * Honduras, esa tarjeta es la portada real.
 *
 * Se genera con `ImageResponse` en vez de guardarse como PNG por una razón
 * práctica: son dos idiomas y el texto cambia, y mantener dos PNG sincronizados
 * a mano con el texto del sitio es la clase de cosa que se desincroniza al
 * primer cambio de copy.
 */

/** Medida canónica de una tarjeta grande. La piden Facebook, X y LinkedIn. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/** Texto alternativo. Sale como `og:image:alt`, que es lo que leen los lectores de pantalla. */
export function ogAlt(locale: Locale): string {
  return `${siteConfig.name} — ${SITE_TAGLINE[locale]}`;
}

/**
 * El mismo mark de `app/icon.svg`, como data URI.
 *
 * Va embebido y no como `<img src="/icon.svg">` porque la imagen se genera en
 * el servidor, a veces en el build, cuando todavía no hay un origen al que
 * pedirle el archivo. Una URL relativa acá se resuelve a nada.
 */
const MARK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="128" height="128">
    <rect width="32" height="32" rx="7" fill="#0f0f13"/>
    <circle cx="14" cy="13.4" r="6.1" fill="none" stroke="#2997ff" stroke-width="2.9"/>
    <path d="M18.6 18.1 L24.4 23.9" fill="none" stroke="#2997ff" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M14 9.6 V15.4 M11.4 12.9 L14 15.6 L16.6 12.9" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
)}`;

/**
 * Construye la tarjeta.
 *
 * Todo el layout es flex explícito: el motor que renderiza esto (satori) no
 * implementa `display: block`, así que cualquier contenedor con más de un hijo
 * tiene que declarar `display: flex` o el render falla en el build, no en
 * tiempo de ejecución.
 */
export function renderBrandOgImage(locale: Locale): ImageResponse {
  const stores = siteConfig.stores.join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#08080a",
          // Un resplandor azul arriba a la izquierda: rompe el rectángulo negro
          // plano, que en el feed de WhatsApp se confunde con una imagen rota.
          backgroundImage:
            "radial-gradient(900px 500px at 12% 0%, rgba(41,151,255,0.22), rgba(8,8,10,0) 70%)",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={104} height={104} alt="" />
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#f5f5f7",
            }}
          >
            {siteConfig.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.035em",
              maxWidth: 940,
              color: "#ffffff",
            }}
          >
            {SITE_TAGLINE[locale]}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              lineHeight: 1.35,
              maxWidth: 900,
              color: "#a1a1a6",
            }}
          >
            {locale === "es"
              ? "Compará precios de las tiendas del país en una sola búsqueda. Gratis y sin cuenta."
              : "Compare prices across the country's stores in a single search. Free, no account."}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(245,245,247,0.14)",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 21, color: "#87878d", whiteSpace: "nowrap" }}>
            {stores}
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#2997ff" }}>
            findyourprices.com
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
