import { SHELL } from "@/components/layout/shell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { CatalogStats } from "@/features/products/components/CatalogStats";
import { Hero } from "@/features/products/components/Hero";
import { ProductSearchApp } from "@/features/products/components/ProductSearchApp";
import { products as fixtureProducts } from "@/features/products/data";
import { getFacets } from "@/features/products/filterProducts";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import type { CatalogSnapshot } from "@/server/services/catalog";

export interface HomeViewProps {
  locale: Locale;
  /**
   * Catálogo ya resuelto por la ruta. Se recibe en vez de cargarse acá para
   * que este componente siga siendo síncrono y puro: la ruta decide de dónde
   * salen los datos, la vista solo los pinta.
   */
  catalog: CatalogSnapshot;
}

/**
 * Cuerpo de la home, compartido por las dos rutas de idioma. La ruta es la
 * única que decide el locale; de acá para abajo todo lo lee del contexto.
 *
 * Cada bloque elige su propio ancho a propósito, en vez de heredar una única
 * columna: el hero desborda hacia la derecha, la herramienta se aprieta a
 * medida de lectura, y el cierre sale a sangre completa. Esa progresión
 * ancho → angosto → a sangre es el ritmo de la página.
 *
 * Los productos salen de la base (lo que dejó el scraping). Si la base todavía
 * no está lista se cae al fixture: preferible una home que funcione con datos
 * de muestra a una pantalla de error.
 */
export function HomeView({ locale, catalog: snapshot }: HomeViewProps) {
  const usingRealCatalog = snapshot.products.length > 0;
  const products = usingRealCatalog ? snapshot.products : fixtureProducts;

  // Con el fixture no hay conteos reales: se derivan del propio fixture para
  // que los selectores sigan funcionando en desarrollo y en las pruebas.
  const fallbackFacets = getFacets(fixtureProducts);
  const toFacets = (values: string[]) =>
    values.map((value) => ({
      value,
      count: fixtureProducts.filter((p) => p.store === value || p.category === value).length,
    }));

  const storeFacets = usingRealCatalog
    ? snapshot.facets.stores
    : toFacets(fallbackFacets.stores);
  const categoryFacets = usingRealCatalog
    ? snapshot.facets.categories
    : toFacets(fallbackFacets.categories);

  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={locale}>
        <div className="flex flex-1 flex-col">
          <SiteNav />

          <main className="flex-1">
            <div className={SHELL}>
              <Hero />
            </div>

            {/* La herramienta usa el mismo ancho que el resto de la página:
                antes vivía en una columna de 48rem y en pantalla grande el
                catálogo quedaba encajonado entre dos franjas vacías. */}
            <div className={SHELL}>
              <ProductSearchApp
                initialProducts={products}
                storeFacets={storeFacets}
                categoryFacets={categoryFacets}
                brandFacets={snapshot.facets.brands}
                priceBounds={{
                  min: snapshot.facets.minPrice,
                  max: snapshot.facets.maxPrice,
                }}
                totalResults={usingRealCatalog ? snapshot.total : products.length}
                /* Con catálogo real la búsqueda va al servidor: filtrar en el
                   navegador solo encontraría entre los 90 artículos servidos y
                   el visitante creería que el resto no existe. */
                remoteSearch={usingRealCatalog}
                locale={locale}
              />
            </div>

            <CatalogStats
              productCount={usingRealCatalog ? snapshot.facets.totalProducts : products.length}
              storeCount={usingRealCatalog ? snapshot.facets.totalStores : storeFacets.length}
              categoryCount={
                usingRealCatalog ? snapshot.facets.totalCategories : categoryFacets.length
              }
            />
          </main>

          <SiteFooter />
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
