import type { CSSProperties } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Reveal } from "@/components/shared/Reveal";
import type { Locale } from "@/features/i18n/translate";
import type { FacetOption } from "@/features/products/categoryFacets";
import { ProductSearchApp } from "@/features/products/components/ProductSearchApp";
import { categoryBreadcrumbs, categoryPaths } from "@/lib/seo/categorySeo";
import type { CategoryPageData } from "@/server/services/categoryPages";
import { CATEGORY_COPY } from "./categoryCopy";
import { SectionHeading } from "./CategoryIndexView";
import { CategoryProse } from "./CategoryProse";
import { CategoryRow } from "./CategoryRow";
import { CategoryTile } from "./CategoryTile";
import { PopularProducts } from "./PopularProducts";

interface CategoryPageViewProps {
  locale: Locale;
  data: CategoryPageData;
}

/**
 * Página de una categoría, raíz o hija.
 *
 * El orden de las secciones es el orden de la intención de quien llega
 * desde un buscador, de más a menos decidido:
 *
 *   1. Cabecera: qué es esto, cuánto hay, y la foto.
 *   2. Subcategorías con foto: "ya sé qué tipo de cosa busco".
 *   3. Productos populares: "quiero ver artículos ya".
 *   4. Subcategorías en lista (o hermanas, en una hoja).
 *   5. El buscador acotado: "quiero filtrar en serio".
 *   6. El texto largo: para quien lee, y para el buscador.
 *
 * Todo el texto editorial sale de la base; lo que no está escrito cae a un
 * texto de respaldo que ya nombra la categoría y sus cifras reales, así que
 * ninguna landing sale vacía ni duplicada.
 */
export function CategoryPageView({ locale, data }: CategoryPageViewProps) {
  const { category, parent, children, siblings, popular, initialProducts, facets } = data;
  const copy = CATEGORY_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "es" ? "es-HN" : "en-US");
  const paths = categoryPaths(category.slug);

  const heading = category.name;
  const words = heading.split(" ");
  const countLabel = copy.productsCount(numberFormat.format(category.productCount));
  const intro =
    category.content.intro ??
    copy.defaultIntro(category.name, numberFormat.format(category.productCount), facets.stores.length);
  const body =
    category.content.body ??
    copy.defaultBody(
      category.name,
      children.map((child) => child.name),
    );

  const childFacets: FacetOption[] = children.map((child) => ({
    value: child.slug,
    label: child.name,
    count: child.productCount,
  }));

  const isLeaf = children.length === 0;
  const hasImage = Boolean(category.imageUrl);

  return (
    <PageLayout locale={locale} localePaths={paths}>
      <div className={SHELL}>
        <div className="pt-6 sm:pt-8">
          <Breadcrumbs label={copy.breadcrumbs} items={categoryBreadcrumbs(category, parent, locale)} />
        </div>

        {/* Cabecera --------------------------------------------------------
            El nombre de la categoría es la imagen principal de la página;
            la foto, cuando existe, es la segunda voz: una placa que entra
            desde la derecha y desborda el contenedor en escritorio. */}
        <header className="relative isolate grid gap-8 overflow-visible pt-10 pb-12 sm:pt-14 sm:pb-16 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className={hasImage ? "lg:col-span-7" : "lg:col-span-10"}>
            <p
              className="enter text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase"
              style={{ "--enter-delay": "60ms" } as CSSProperties}
            >
              {parent ? parent.name : copy.indexEyebrow}
            </p>

            <h1
              lang={locale}
              className={`mt-4 leading-[0.94] font-semibold tracking-[-0.045em] text-balance break-words hyphens-auto text-[var(--text)] ${
                hasImage ? "text-[clamp(2.25rem,5.6vw,4.75rem)]" : "text-[clamp(2.5rem,7.5vw,5.75rem)]"
              }`}
            >
              {words.map((word, index) => (
                <span key={`${word}-${index}`}>
                  <span
                    className="enter inline-block"
                    style={{ "--enter-delay": `${140 + index * 70}ms` } as CSSProperties}
                  >
                    {word}
                  </span>{" "}
                </span>
              ))}
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
          </div>

          {hasImage && (
            <figure
              className="enter relative lg:col-span-5 lg:-mr-10 xl:-mr-16"
              style={{ "--enter-delay": "300ms" } as CSSProperties}
            >
              <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--bg-subtle)] shadow-[var(--shadow-sm)] sm:rounded-[2.5rem]">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */}
                <img
                  src={category.imageUrl ?? undefined}
                  alt={category.imageAlt ?? category.name}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain p-8 sm:p-10"
                />
              </div>
            </figure>
          )}
        </header>

        {/* Subcategorías con foto ------------------------------------------ */}
        {children.length > 0 && (
          <section aria-labelledby="sub-heading" className="pb-16 sm:pb-20">
            <SectionHeading id="sub-heading" title={copy.popularSubHeading(category.name)} />
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {children.map((child, index) => (
                <li key={child.id}>
                  <CategoryTile
                    category={child}
                    href={categoryPaths(child.slug)[locale]}
                    countLabel={copy.productsCount(numberFormat.format(child.productCount))}
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
              title={copy.popularProductsHeading}
              sub={copy.popularProductsSub}
            />
            <div className="mt-6">
              <PopularProducts
                products={popular}
                locale={locale}
                label={copy.popularProductsHeading}
              />
            </div>
          </Reveal>
        )}

        {/* Lista: hijas, o hermanas si es una hoja ------------------------- */}
        {(children.length > 0 || (isLeaf && siblings.length > 0)) && (
          <Reveal aria-labelledby="browse-heading" className="pb-16 sm:pb-20" delayMs={60}>
            <SectionHeading
              id="browse-heading"
              title={
                isLeaf && parent ? copy.alsoInHeading(parent.name) : copy.browseSubHeading
              }
            />
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(isLeaf ? siblings : children).map((node) => (
                <CategoryRow
                  key={node.id}
                  category={node}
                  href={categoryPaths(node.slug)[locale]}
                  meta={copy.productsCount(numberFormat.format(node.productCount))}
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
            title={copy.searchHeading(category.name)}
            sub={copy.searchSub(category.name)}
          />
          <div className="mt-8">
            <ProductSearchApp
              initialProducts={initialProducts}
              storeFacets={facets.stores}
              categoryFacets={childFacets}
              brandFacets={facets.brands}
              totalResults={category.productCount}
              remoteSearch
              locale={locale}
              scopeCategory={category.slug}
            />
          </div>
        </section>
      </div>

      {/* El texto largo, a sangre completa sobre fondo tenue: es el cierre
          de la página y el bloque que un buscador lee como "de qué va". */}
      <Reveal
        as="section"
        aria-labelledby="about-heading"
        className="border-t border-[var(--border)] bg-[var(--bg-subtle)] py-16 sm:py-24"
      >
        <div className={`${SHELL} grid gap-8 lg:grid-cols-12 lg:gap-12`}>
          <div className="lg:col-span-4">
            <h2
              id="about-heading"
              className="text-[clamp(1.75rem,3.6vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance text-[var(--text)] lg:sticky lg:top-24"
            >
              {copy.aboutHeading(category.name)}
            </h2>
          </div>
          <div className="lg:col-span-8">
            <CategoryProse
              text={body}
              className="max-w-[68ch] text-[1rem] leading-[1.7] text-[var(--text-secondary)]"
            />
          </div>
        </div>
      </Reveal>
    </PageLayout>
  );
}
