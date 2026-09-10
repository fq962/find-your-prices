import type { ReactNode } from "react";
import { BackToTop } from "@/components/shared/BackToTop";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

/**
 * Estructura común de una página completa: tema, idioma, navegación y pie.
 *
 * Existe porque a la cuarta página este bloque ya estaba copiado cuatro veces,
 * y cada copia era una oportunidad de que una página se quedara sin
 * `ThemeProvider` y parpadeara en blanco al cargar.
 */
/**
 * El botón de volver arriba está fuera del proveedor de idioma —lo monta el
 * mismo componente que lo instala—, así que su texto se resuelve acá.
 */
const BACK_TO_TOP: Record<Locale, string> = {
  es: "Volver arriba",
  en: "Back to top",
};

export interface PageLayoutProps {
  locale: Locale;
  /**
   * La misma página en el otro idioma. Se lo pasa al selector de idioma para
   * que cambiar de idioma en "Privacidad" lleve a "Privacy" y no a la portada,
   * que es lo que hacía antes por no tener esta información.
   */
  localePaths?: Record<Locale, string>;
  children: ReactNode;
}

export function PageLayout({ locale, localePaths, children }: PageLayoutProps) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={locale}>
        <div className="flex flex-1 flex-col">
          <SiteNav localePaths={localePaths} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          {/* Vive acá y no en el catálogo porque las páginas de texto también
              son largas, y el botón se esconde solo donde no hace falta. */}
          <BackToTop label={BACK_TO_TOP[locale]} />
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
