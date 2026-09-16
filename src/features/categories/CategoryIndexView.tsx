import Link from "next/link";
import type { CSSProperties } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Reveal } from "@/components/shared/Reveal";
import { SITE_ROUTES } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { categoryIndexPaths, categoryPaths } from "@/lib/seo/categorySeo";
import type { CategoryIndexData } from "@/server/services/categoryPages";
import { CATEGORY_COPY } from "./categoryCopy";
import { CategoryRow } from "./CategoryRow";
import { CategoryTile } from "./CategoryTile";

interface CategoryIndexViewProps {
  locale: Locale;
  data: CategoryIndexData;
}

/** Cuántas tarjetas con imagen arriba cuando nadie marcó destacadas. */
const FEATURED_FALLBACK = 12;

/**
 * Índice de categorías: la puerta de entrada al árbol.
 *
 * Tres capas, de la más visual a la más densa: las destacadas con foto, la
 * lista de raíces con su cifra, y al final cada raíz con todas sus hijas
 * como enlaces de texto. Esa última capa parece redundante y no lo es: es la
 * que reparte enlaces internos a las ~130 landings de categoría desde una
 * sola página, que es lo que hace que un rastreador las descubra todas de
 * una vez en lugar de a través de las fichas.
 */
export function CategoryIndexView({ locale, data }: CategoryIndexViewProps) {
  const copy = CATEGORY_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "es" ? "es-HN" : "en-US");
  const paths = categoryIndexPaths();

  const featured =
    data.featured.length > 0 ? data.featured : data.roots.slice(0, FEATURED_FALLBACK);

  const words = copy.indexTitle.split(" ");

  return (
    <PageLayout locale={locale} localePaths={paths}>
      <div className={SHELL}>
        <div className="pt-6 sm:pt-8">
          <Breadcrumbs
            label={copy.breadcrumbs}
            items={[
              { name: locale === "es" ? "Inicio" : "Home", path: SITE_ROUTES.home[locale] },
              { name: copy.indexTitle, path: paths[locale] },
            ]}
          />
        </div>

        {/* Cabecera. Misma gramática que la portada: título monumental en la
            sans, lectura en serif itálica montada y corrida a la derecha. */}
        <header className="relative isolate overflow-hidden pt-10 pb-12 sm:pt-16 sm:pb-16">
          <div
            aria-hidden="true"
            className="parallax-slow pointer-events-none absolute -top-24 -right-32 -z-10 h-[420px] w-[620px] max-w-[150vw]"
          >
            <div
              className="aurora h-full w-full rounded-full opacity-60 blur-3xl"
              style={{
                background: "radial-gradient(closest-side, var(--accent-soft), transparent 72%)",
              }}
            />
          </div>

          <p
            className="enter text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase"
            style={{ "--enter-delay": "60ms" } as CSSProperties}
          >
            {copy.indexEyebrow}
          </p>

          <h1 className="mt-4 max-w-[14ch] text-[clamp(2.75rem,9vw,7rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-balance text-[var(--text)]">
            {words.map((word, index) => (
              <span key={`${word}-${index}`}>
                <span
                  className="enter inline-block"
                  style={{ "--enter-delay": `${140 + index * 80}ms` } as CSSProperties}
                >
                  {word}
                </span>{" "}
              </span>
            ))}
          </h1>

          <p
            className="enter -mt-1 ml-[6%] font-serif text-[clamp(1.5rem,5vw,3.25rem)] leading-[1.05] tracking-[-0.015em] text-[var(--accent)] italic sm:-mt-2 sm:ml-[12%]"
            style={{ "--enter-delay": "420ms" } as CSSProperties}
          >
            {copy.indexNative}
          </p>

          <p
            className="enter mt-6 max-w-[46ch] text-[clamp(1rem,2vw,1.25rem)] leading-[1.5] tracking-[-0.01em] text-[var(--text-secondary)]"
            style={{ "--enter-delay": "540ms" } as CSSProperties}
          >
            {copy.indexTagline(numberFormat.format(data.totalProducts), data.roots.length)}
          </p>
        </header>

        {/* Destacadas: la capa con foto. */}
        {featured.length > 0 && (
          <section aria-labelledby="featured-heading" className="pb-16 sm:pb-20">
            <SectionHeading id="featured-heading" title={copy.featuredHeading} />
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {featured.map((category, index) => (
                <li key={category.id}>
                  <CategoryTile
                    category={category}
                    href={categoryPaths(category.slug)[locale]}
                    countLabel={copy.productsCount(numberFormat.format(category.productCount))}
                    index={index}
                    eager={index < 4}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Todas las raíces, en filas. */}
        <Reveal aria-labelledby="all-heading" className="pb-16 sm:pb-20">
          <SectionHeading id="all-heading" title={copy.allHeading} sub={copy.allSub} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.roots.map((root) => {
              const children = data.childrenOf[root.id] ?? [];
              const meta = [
                copy.productsCount(numberFormat.format(root.productCount)),
                children.length > 0 ? copy.subcategoriesCount(children.length) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <CategoryRow
                  key={root.id}
                  category={root}
                  href={categoryPaths(root.slug)[locale]}
                  meta={meta}
                />
              );
            })}
          </ul>
        </Reveal>

        {/* El árbol entero como texto: una raíz por bloque con sus hijas. */}
        <Reveal
          aria-labelledby="tree-heading"
          className="border-t border-[var(--border)] pt-12 pb-20 sm:pt-16 sm:pb-28"
          delayMs={80}
        >
          <h2 id="tree-heading" className="sr-only">
            {copy.allHeading}
          </h2>
          <div className="columns-1 gap-x-10 sm:columns-2 lg:columns-3">
            {data.roots.map((root) => {
              const children = data.childrenOf[root.id] ?? [];
              return (
                <div key={root.id} className="mb-8 break-inside-avoid">
                  <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--text)]">
                    <Link
                      href={categoryPaths(root.slug)[locale]}
                      className="rounded-sm outline-none hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                    >
                      {root.name}
                    </Link>
                  </h3>
                  {children.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[0.8125rem] leading-snug text-[var(--text-secondary)]">
                      {children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={categoryPaths(child.slug)[locale]}
                            className="rounded-sm outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </PageLayout>
  );
}

/**
 * Cabecera de sección: un título en versalitas de tracking ancho y una
 * línea de apoyo. Es la misma voz que los rótulos de la portada.
 */
export function SectionHeading({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2
        id={id}
        className="text-[clamp(1.375rem,2.8vw,1.875rem)] font-semibold tracking-[-0.025em] text-balance text-[var(--text)]"
      >
        {title}
      </h2>
      {sub && (
        <p className="max-w-[56ch] text-[0.9375rem] leading-[1.5] text-[var(--text-secondary)]">
          {sub}
        </p>
      )}
    </div>
  );
}
