import type { ReactNode } from "react";
import { Instrument_Serif, Space_Grotesk } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/features/theme/themeStorage";
import type { Locale } from "@/features/i18n/translate";

/** Client id de AdSense (ca-pub-...), no un secreto: va en html publico. */
const ADSENSE_CLIENT_ID = "ca-pub-4061396045570252";

/** Display y UI: geométrica, con carácter propio en la 'g', la 'a' y los números. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/** Contrapunto editorial: sólo para la línea nativa del hero. */
const instrumentSerif = Instrument_Serif({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Copia verbatim de la tabla de decisión de `resolveInitialTheme` (ver ese
 * módulo): un `<script>` en el `<head>` no puede importar módulos, y esto
 * tiene que correr antes del primer paint para que no haya flash de tema.
 * Si cambia la lógica allá, cambia acá.
 */
const themeScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var s=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var t=p==="light"||p==="dark"?p:p==="system"?s:"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export interface RootDocumentProps {
  locale: Locale;
  children: ReactNode;
}

/**
 * `<html>`/`<body>` compartidos por los root layouts de cada idioma. Existe
 * un root layout por locale para que `lang` sea correcto ya en el HTML del
 * servidor; todo lo demás del documento se define una sola vez, acá.
 */
export function RootDocument({ locale, children }: RootDocumentProps) {
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      {/* Es el `<head>` de un root layout del App Router, no el `next/head` de
          Pages: es el único lugar donde el script anti-FOUC corre antes del
          primer paint. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Etiqueta <script> literal (no next/script): el verificador de
            AdSense lee el html crudo del servidor sin ejecutar JS, y
            next/script con "beforeInteractive" solo deja un <link rel=preload>
            en ese html (el <script> real lo inserta client-side antes de
            hidratar), lo que el verificador no detecta. */}
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--bg)] font-sans text-[var(--text)]">
        {children}
      </body>
    </html>
  );
}
