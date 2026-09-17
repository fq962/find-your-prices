"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import { categoryPaths } from "@/lib/seo/categorySeo";
import {
  catalogUrlSearch,
  EMPTY_CATALOG_URL_STATE,
  getCatalogUrlServerSnapshot,
  getCatalogUrlSnapshot,
  subscribeToCatalogUrl,
  writeCatalogUrl,
} from "@/features/products/catalogUrlState";
import type { Suggestion } from "@/features/products/useSearchSuggestions";
import { SearchBar } from "./SearchBar";

/** Suscripción vacía: fuera de la portada no hay URL de catálogo que seguir. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * El buscador de la barra de navegación: está en todas las páginas y siempre
 * busca en el catálogo entero.
 *
 * Hay dos situaciones y se resuelven distinto a propósito:
 *
 *   - En la portada el catálogo está debajo, así que escribir filtra en el
 *     sitio: se escribe en la URL (`writeCatalogUrl`) y `ProductSearchApp`,
 *     que la lee, reacciona. Nada de `router.push`: una navegación a la misma
 *     ruta con otra query vuelve a pedir la página y no avisa al store.
 *   - En cualquier otra página no hay catálogo que filtrar: la búsqueda lleva
 *     a la portada con `?q=`, y ahí se resuelve.
 *
 * Elegir una tienda del desplegable sigue la misma lógica —filtro en la
 * portada, enlace desde fuera— y una categoría siempre es un enlace a su
 * página, que es donde vive.
 */
export function SiteSearch() {
  const { locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const home = routeFor("home", locale);
  const isHome = pathname === home;

  // Sólo en la portada se escucha la URL. Suscribirse anota la dirección como
  // "último catálogo visitado" (ver `subscribeToCatalogUrl`), y hacerlo desde
  // una ficha de producto haría que "Volver al catálogo" llevara a la propia
  // ficha. Fuera de la portada la caja arranca vacía aunque la URL traiga
  // `?q=`: esa búsqueda es de esa página, no de este buscador.
  const catalogUrl = useSyncExternalStore(
    isHome ? subscribeToCatalogUrl : subscribeToNothing,
    isHome ? getCatalogUrlSnapshot : getCatalogUrlServerSnapshot,
    getCatalogUrlServerSnapshot,
  );
  const value = catalogUrl.query;

  const goHome = useCallback(
    (patch: { query?: string; store?: string[] }) => {
      const search = catalogUrlSearch({
        ...EMPTY_CATALOG_URL_STATE,
        query: patch.query ?? "",
        store: patch.store ?? [],
      });
      router.push(`${home}${search}`);
    },
    [router, home],
  );

  const onQueryChange = useCallback(
    (query: string) => {
      if (isHome) writeCatalogUrl({ ...getCatalogUrlSnapshot(), query });
    },
    [isHome],
  );

  const onSubmit = useCallback(
    (query: string) => {
      if (isHome) return;
      goHome({ query });
    },
    [isHome, goHome],
  );

  const onSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.kind === "category") {
        router.push(categoryPaths(suggestion.slug)[locale]);
        return;
      }
      if (suggestion.kind === "store") {
        // Elegir una tienda es "mostrame esta tienda": se borra lo escrito,
        // que era el nombre de la tienda a medias y no un artículo.
        if (isHome) {
          writeCatalogUrl({ ...getCatalogUrlSnapshot(), query: "", store: [suggestion.name] });
        } else {
          goHome({ store: [suggestion.name] });
        }
        return;
      }
      // Un artículo: la caja ya puso su nombre y avisó; fuera de la portada
      // además hay que ir hasta ella.
      if (!isHome) goHome({ query: suggestion.name });
    },
    [isHome, goHome, router, locale],
  );

  return (
    <SearchBar
      size="sm"
      value={value}
      suggest
      onQueryChange={onQueryChange}
      onSubmit={onSubmit}
      onSelectSuggestion={onSelectSuggestion}
    />
  );
}
