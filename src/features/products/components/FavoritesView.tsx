"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { SHELL } from "@/components/layout/shell";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { productPath } from "@/features/products/productPath";
import { useFavorites } from "@/features/products/useFavorites";
import type { Product } from "@/types";
import { ProductGrid } from "./ProductGrid";

/**
 * Página "Mis favoritos".
 *
 * Es cliente entera: la lista vive en `localStorage`, así que el servidor no
 * tiene nada que pintar más que el marco. El primer render del cliente
 * coincide con el del servidor (lista vacía) y React reconcilia con la real;
 * para que ese instante no muestre el estado vacío como si fuera verdad, la
 * vista espera a estar hidratada antes de decidir qué mostrar.
 *
 * Reutiliza `ProductGrid` tal cual —misma tarjeta, mismo corazón, mismo
 * comparar— para que quitar un favorito desde acá sea el mismo gesto que
 * agregarlo desde el catálogo.
 */
export interface FavoritesViewProps {
  locale: Locale;
}

const noop = () => () => {};

/**
 * `false` en el servidor y durante la hidratación, `true` después. Es el
 * truco canónico con `useSyncExternalStore`: no dispara un render extra ni
 * necesita un efecto, y no hay ventana en la que el cliente muestre algo
 * distinto de lo que mandó el servidor.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function FavoritesView({ locale }: FavoritesViewProps) {
  const { t } = useLocale();
  const favorites = useFavorites();
  const hydrated = useHydrated();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const favoriteLabels = useMemo(
    () => ({ add: t("favoriteAddLabel"), remove: t("favoriteRemoveLabel") }),
    [t],
  );
  const compareLabels = useMemo(
    () => ({
      add: t("compareAddLabel"),
      remove: t("compareRemoveLabel"),
      full: t("compareFullLabel"),
    }),
    [t],
  );

  const href = (product: Product) => (product.slug ? productPath(locale, product.slug) : undefined);
  const count = favorites.count;
  const isEmpty = count === 0;

  function handleClear() {
    // Vaciar borra de un golpe algo que se marcó a mano, uno por uno: pide un
    // segundo clic en vez de un diálogo, que para esto es demasiado.
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    favorites.clear();
    setConfirmingClear(false);
  }

  return (
    <div className={`${SHELL} pb-16`}>
      <header className="flex flex-col items-start pt-14 pb-8 sm:pt-20 sm:pb-10">
        <h1
          className="enter text-[clamp(2.5rem,8vw,4rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]"
          style={{ "--enter-delay": "80ms" } as CSSProperties}
        >
          {t("favoritesTitle")}
        </h1>
        <p
          className="enter mt-4 max-w-[28ch] font-serif text-[clamp(1.25rem,4.5vw,1.875rem)] leading-[1.15] tracking-[-0.015em] text-[var(--favorite)] italic"
          style={{ "--enter-delay": "180ms" } as CSSProperties}
        >
          {t("favoritesLede")}
        </p>
      </header>

      {!isEmpty && (
        <div
          className="enter mb-5 flex flex-wrap items-center justify-between gap-3"
          style={{ "--enter-delay": "260ms" } as CSSProperties}
        >
          <p className="text-[0.9375rem] text-[var(--text-secondary)]" aria-live="polite">
            <span className="font-semibold tabular-nums text-[var(--text)]">{count}</span>{" "}
            {count === 1 ? t("favoritesCountOne") : t("favoritesCountMany")}
          </p>

          <button
            type="button"
            onClick={handleClear}
            onBlur={() => setConfirmingClear(false)}
            className={`rounded-full border px-4 py-2 text-[0.8125rem] font-medium outline-none transition-[background-color,border-color,color] duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              confirmingClear
                ? "border-[var(--critical)] bg-[var(--critical-soft)] text-[var(--critical)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            }`}
          >
            {confirmingClear ? `${t("favoritesClearLabel")}?` : t("favoritesClearLabel")}
          </button>
        </div>
      )}

      {!hydrated ? (
        /* Mientras no se sepa qué hay guardado no se afirma que no hay nada:
           un "todavía no tenés favoritos" que parpadea antes de la lista real
           se lee como que se perdieron. */
        <div aria-hidden="true" className="h-64 rounded-3xl bg-[var(--bg-subtle)]" />
      ) : isEmpty ? (
        <div
          className="enter flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--border-strong)] px-6 py-20 text-center"
          style={{ "--enter-delay": "260ms" } as CSSProperties}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--favorite-soft)] text-[var(--favorite)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 6.9 4.5c1.9 0 3.5 1 4.4 2.4a5.1 5.1 0 0 1 4.4-2.4c3.3 0 5.6 3.1 4.3 6.6C19.5 15.9 12 20.5 12 20.5Z" />
            </svg>
          </span>
          <p className="text-[1.125rem] font-medium tracking-[-0.01em] text-[var(--text)]">
            {t("favoritesEmptyTitle")}
          </p>
          <p className="max-w-[40ch] text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            {t("favoritesEmptyBody")}
          </p>
          <Link
            href={routeFor("home", locale)}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-[var(--text)] px-5 py-2.5 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {t("favoritesBrowseLabel")}
          </Link>
        </div>
      ) : (
        <>
          <ProductGrid
            products={favorites.items}
            // Igual que ProductSearchApp: "es-HN" imprime "L 299.00".
            locale={locale === "en" ? "en-HN" : "es-HN"}
            columns={4}
            productHref={href}
            compareLabels={compareLabels}
            favoriteLabels={favoriteLabels}
            label={t("favoritesTitle")}
          />
          <p className="mt-6 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
            {t("favoritesPriceNote")}
          </p>
        </>
      )}
    </div>
  );
}
