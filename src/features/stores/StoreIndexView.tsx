import type { CSSProperties } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { SectionHeading } from "@/features/categories/CategoryIndexView";
import { SITE_ROUTES } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { storeIndexPaths, storePaths } from "@/lib/seo/storeSeo";
import type { StoreIndexData } from "@/server/services/storePages";
import { STORE_COPY } from "./storeCopy";
import { StoreTile } from "./StoreTile";

interface StoreIndexViewProps {
  locale: Locale;
  data: StoreIndexData;
}

/**
 * Índice de tiendas: la puerta de entrada a las landings por comercio.
 *
 * Misma gramática que el índice de categorías —eyebrow, título monumental,
 * lectura en serif itálica— y una sola retícula de medallones: son pocas
 * tiendas y cada una merece su tarjeta.
 */
export function StoreIndexView({ locale, data }: StoreIndexViewProps) {
  const copy = STORE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "es" ? "es-HN" : "en-US");
  const paths = storeIndexPaths();
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
            {copy.indexTagline(numberFormat.format(data.totalProducts), data.stores.length)}
          </p>
        </header>

        <section aria-labelledby="stores-heading" className="pb-20 sm:pb-28">
          <SectionHeading id="stores-heading" title={copy.indexHeading} sub={copy.indexSub} />
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {data.stores.map((store, index) => (
              <li key={store.id}>
                <StoreTile
                  store={store}
                  href={storePaths(store.slug)[locale]}
                  meta={`${copy.productsCount(numberFormat.format(store.productCount))} · ${copy.categoriesCount(store.categoryCount)}`}
                  index={index}
                  eager={index < 5}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageLayout>
  );
}
