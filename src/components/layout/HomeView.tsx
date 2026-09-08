import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { CatalogStats } from "@/features/products/components/CatalogStats";
import { Hero } from "@/features/products/components/Hero";
import { ProductSearchApp } from "@/features/products/components/ProductSearchApp";
import { products } from "@/features/products/data";
import { getFacets } from "@/features/products/filterProducts";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

export interface HomeViewProps {
  locale: Locale;
}

/**
 * Cuerpo de la home, compartido por las dos rutas de idioma. La ruta es la
 * única que decide el locale; de acá para abajo todo lo lee del contexto.
 *
 * Cada bloque elige su propio ancho a propósito, en vez de heredar una única
 * columna: el hero desborda hacia la derecha, la herramienta se aprieta a
 * medida de lectura, y el cierre sale a sangre completa. Esa progresión
 * ancho → angosto → a sangre es el ritmo de la página.
 */
export function HomeView({ locale }: HomeViewProps) {
  const { stores, categories } = getFacets(products);

  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={locale}>
        <div className="flex flex-1 flex-col">
          <SiteNav />

          <main className="flex-1">
            <div className="mx-auto w-full max-w-[68rem] px-4 sm:px-6">
              <Hero />
            </div>

            <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
              <ProductSearchApp initialProducts={products} />
            </div>

            <CatalogStats
              productCount={products.length}
              storeCount={stores.length}
              categoryCount={categories.length}
            />
          </main>

          <SiteFooter />
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
