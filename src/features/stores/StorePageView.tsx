import type { CSSProperties, ReactNode } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/features/categories/CategoryIndexView";
import { CategoryRow } from "@/features/categories/CategoryRow";
import { CategoryTile } from "@/features/categories/CategoryTile";
import { PopularProducts } from "@/features/categories/PopularProducts";
import type { Locale } from "@/features/i18n/translate";
import type { FacetOption } from "@/features/products/categoryFacets";
import { ProductSearchApp } from "@/features/products/components/ProductSearchApp";
import { storeBreadcrumbs, storeCategoryPaths, storePaths } from "@/lib/seo/storeSeo";
import type { CategoryNode } from "@/server/services/categoryPages";
import type { StorePageData } from "@/server/services/storePages";
import { STORE_COPY } from "./storeCopy";

interface StorePageViewProps {
  locale: Locale;
  data: StorePageData;
}

/**
 * Landing de una tienda, sola o acotada a una categoría.
 *
 * Es la misma página en los dos casos —cambia el alcance, no la forma— y por
 * eso es un solo componente: "PriceSmart" muestra sus categorías raíz;
 * "Abarrotes en PriceSmart" muestra las subcategorías de abarrotes que
 * PriceSmart vende. El orden de las secciones es el de la página de
 * categoría, que ya está pensado de más a menos decidido:
 *
 *   1. Cabecera: categoría + tienda, cuánto hay, la imagen de la tienda.
 *   2. Categorías (o subcategorías) con foto, tituladas "X en Tienda".
 *   3. Productos populares del alcance.
 *   4. Las mismas categorías en lista (o las hermanas, en una hoja).
 *   5. El buscador acotado a la tienda (y a la categoría).
 *
 * Cada título concatena categoría y tienda a propósito: "Abarrotes en
 * PriceSmart" es la frase que se busca, y tiene que estar en el H1, en las
 * tarjetas y en los enlaces, no solo en el <title>.
 */
export function StorePageView({ locale, data }: StorePageViewProps) {
  const { store, category, parent, children, siblings, popular, initialProducts, facets } = data;
  const copy = STORE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "es" ? "es-HN" : "en-US");
  const paths = category ? storeCategoryPaths(store.slug, category.slug) : storePaths(store.slug);

  const scopeCount = category ? category.productCount : store.productCount;
  const countLabel = copy.productsCount(numberFormat.format(scopeCount));
  const intro = copy.intro(store.name, category?.name ?? null, numberFormat.format(scopeCount), store.categoryCount);

  const isLeaf = category !== null && children.length === 0;
  const listed = isLeaf ? siblings : children;
  const hasImage = Boolean(store.imageUrl);

  /** "Abarrotes en PriceSmart", con la tienda en el color de acento. */
  const inStore = (node: CategoryNode): ReactNode => (
    <>
      {node.name}{" "}
      <span className="text-[var(--accent)]">
        {locale === "es" ? "en" : "at"} {store.name}
      </span>
    </>
  );

  const childFacets: FacetOption[] = (category ? children : []).map((child) => ({
    value: child.slug,
    label: child.name,
    count: child.productCount,
  }));
  // En la landing de la tienda entera el buscador ofrece las raíces que la
  // tienda tiene; en una categoría, sus hijas.
  const searchCategoryFacets: FacetOption[] = category
    ? childFacets
    : children.map((root) => ({ value: root.slug, label: root.name, count: root.productCount }));

  return (
    <PageLayout locale={locale} localePaths={paths}>
      <div className={SHELL}>
        <div className="pt-6 sm:pt-8">
          <Breadcrumbs label={copy.breadcrumbs} items={storeBreadcrumbs(data, locale)} />
        </div>

        {/* Cabecera --------------------------------------------------------
            El H1 es la frase completa. La tienda va en acento para que se
            lea como el "para Ford Escape" de un catálogo de repuestos: la
            categoría es lo que se busca, la tienda es el dónde. */}
        <header className="relative isolate grid gap-8 overflow-visible pt-10 pb-12 sm:pt-14 sm:pb-16 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className={hasImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <p
              className="enter text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase"
              style={{ "--enter-delay": "60ms" } as CSSProperties}
            >
              {parent ? copy.inStore(parent.name, store.name) : category ? store.name : copy.storeEyebrow}
            </p>

            <h1
              lang={locale}
              className={`mt-4 leading-[0.94] font-semibold tracking-[-0.045em] text-balance break-words hyphens-auto text-[var(--text)] ${
                hasImage ? "text-[clamp(2.25rem,5.6vw,4.5rem)]" : "text-[clamp(2.5rem,7.5vw,5.75rem)]"
              }`}
            >
              {category ? (
                <>
                  <span className="enter inline-block" style={{ "--enter-delay": "140ms" } as CSSProperties}>
                    {category.name}
                  </span>{" "}
                  <span
                    className="enter inline-block text-[var(--accent)]"
                    style={{ "--enter-delay": "220ms" } as CSSProperties}
                  >
                    {locale === "es" ? "en" : "at"} {store.name}
                  </span>
                </>
              ) : (
                <span className="enter inline-block" style={{ "--enter-delay": "140ms" } as CSSProperties}>
                  {store.name}
                </span>
              )}
            </h1>

            <p
              className="enter mt-1 ml-[4%] font-serif text-[clamp(1.375rem,4vw,2.5rem)] leading-[1.05] tracking-[-0.015em] text-[var(--accent)] italic sm:ml-[8%]"
              style={{ "--enter-delay": "400ms" } as CSSProperties}
            >
              {countLabel}
            </p>

            <p
              className="enter mt-6 max-w-[52ch] text-[clamp(1rem,1.9vw,1.1875rem)] leading-[1.55] tracking-[-0.01em] text-[var(--text-secondary)]"
              style={{ "--enter-delay": "520ms" } as CSSProperties}
            >
              {intro}
            </p>

            {store.baseUrl && (
              <a
                href={store.baseUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="enter mt-6 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ "--enter-delay": "600ms" } as CSSProperties}
              >
                {copy.visitStore(store.name)}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
              </a>
            )}
          </div>

          {hasImage && (
            <figure
              className="enter relative lg:col-span-4"
              style={{ "--enter-delay": "300ms" } as CSSProperties}
            >
              <div className="relative mx-auto aspect-square w-full max-w-[16rem] overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] shadow-[var(--shadow-sm)] lg:max-w-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */}
                <img
                  src={store.imageUrl ?? undefined}
                  alt={store.imageAlt ?? store.name}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain p-10 sm:p-12"
                />
              </div>
            </figure>
          )}
        </header>

        {/* Categorías (o subcategorías) con foto --------------------------- */}
        {children.length > 0 && (
          <section aria-labelledby="sub-heading" className="pb-16 sm:pb-20">
            <SectionHeading
              id="sub-heading"
              title={copy.popularCategoriesHeading(store.name, category?.name ?? null)}
            />
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {children.map((child, index) => (
                <li key={child.id}>
                  <CategoryTile
                    category={child}
                    href={storeCategoryPaths(store.slug, child.slug)[locale]}
                    countLabel={copy.productsCount(numberFormat.format(child.productCount))}
                    label={inStore(child)}
                    index={index}
                    eager={index < 4}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Productos populares --------------------------------------------- */}
        {popular.length > 0 && (
          <Reveal aria-labelledby="popular-heading" className="pb-16 sm:pb-20">
            <SectionHeading
              id="popular-heading"
              title={copy.popularProductsHeading(store.name, category?.name ?? null)}
              sub={copy.popularProductsSub}
            />
            <div className="mt-6">
              <PopularProducts
                products={popular}
                locale={locale}
                label={copy.popularProductsHeading(store.name, category?.name ?? null)}
              />
            </div>
          </Reveal>
        )}

        {/* Lista: hijas, o hermanas si es una hoja ------------------------- */}
        {listed.length > 0 && (
          <Reveal aria-labelledby="browse-heading" className="pb-16 sm:pb-20" delayMs={60}>
            <SectionHeading
              id="browse-heading"
              title={
                isLeaf && parent
                  ? copy.alsoInHeading(parent.name, store.name)
                  : copy.browseHeading(store.name, category?.name ?? null)
              }
            />
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listed.map((node) => (
                <CategoryRow
                  key={node.id}
                  category={node}
                  href={storeCategoryPaths(store.slug, node.slug)[locale]}
                  meta={copy.productsCount(numberFormat.format(node.productCount))}
                  label={inStore(node)}
                />
              ))}
            </ul>
          </Reveal>
        )}

        {/* El buscador acotado ---------------------------------------------- */}
        <section
          aria-labelledby="search-heading"
          className="border-t border-[var(--border)] pt-12 pb-16 sm:pt-16 sm:pb-20"
        >
          <SectionHeading
            id="search-heading"
            title={copy.searchHeading(store.name, category?.name ?? null)}
            sub={copy.searchSub(store.name, category?.name ?? null)}
          />
          <div className="mt-8">
            <ProductSearchApp
              initialProducts={initialProducts}
              storeFacets={[]}
              categoryFacets={searchCategoryFacets}
              brandFacets={facets.brands}
              totalResults={scopeCount}
              remoteSearch
              locale={locale}
              scopeStore={store.slug}
              scopeCategory={category?.slug}
            />
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
