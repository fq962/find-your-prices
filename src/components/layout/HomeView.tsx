import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { Hero } from "@/features/products/components/Hero";
import { ProductSearchApp } from "@/features/products/components/ProductSearchApp";
import { products } from "@/features/products/data";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

export interface HomeViewProps {
  locale: Locale;
}

/**
 * Cuerpo de la home, compartido por las dos rutas de idioma. La ruta es la
 * única que decide el locale; de acá para abajo todo lo lee del contexto.
 */
export function HomeView({ locale }: HomeViewProps) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={locale}>
        <div className="flex flex-1 flex-col">
          <SiteNav />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 sm:px-6">
            <Hero />
            <ProductSearchApp initialProducts={products} />
          </main>
          <SiteFooter />
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
