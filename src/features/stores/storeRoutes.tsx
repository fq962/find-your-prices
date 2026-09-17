import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "@/features/i18n/translate";
import { SITE_ROUTES } from "@/features/i18n/routes";
import { JsonLd } from "@/lib/seo/JsonLd";
import {
  breadcrumbJsonLd,
  categoryCollectionJsonLd,
  collectionPageJsonLd,
  graph,
  itemListJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/schema";
import {
  storeBreadcrumbs,
  storeCategoryPaths,
  storeIndexMetadata,
  storePageDescription,
  storePageHeading,
  storePageMetadata,
  storePaths,
} from "@/lib/seo/storeSeo";
import { getStoreIndex, getStorePage } from "@/server/services/storePages";
import { StoreIndexView } from "./StoreIndexView";
import { StorePageView } from "./StorePageView";

/**
 * Lo que comparten las seis rutas de tienda (índice, tienda y tienda ×
 * categoría, en dos idiomas). Cada `page.tsx` es una línea que elige el
 * idioma; datos, metadata, JSON-LD y vista viven acá una sola vez.
 */

export async function storeIndexPageMetadata(locale: Locale): Promise<Metadata> {
  const data = await getStoreIndex();
  return storeIndexMetadata(locale, data.totalProducts, data.stores.length);
}

export async function StoreIndexRoute({ locale }: { locale: Locale }) {
  const data = await getStoreIndex();

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd(locale),
          websiteJsonLd(locale),
          collectionPageJsonLd(locale, SITE_ROUTES.stores[locale]),
          breadcrumbJsonLd([
            { name: locale === "es" ? "Inicio" : "Home", path: SITE_ROUTES.home[locale] },
            { name: locale === "es" ? "Tiendas" : "Stores", path: SITE_ROUTES.stores[locale] },
          ]),
        ])}
      />
      <StoreIndexView locale={locale} data={data} />
    </>
  );
}

export async function storePageMetadataFor(
  storeSlug: string,
  categorySlug: string | null,
  locale: Locale,
): Promise<Metadata> {
  const data = await getStorePage(storeSlug, categorySlug, locale);
  if (!data) {
    return {
      title: locale === "es" ? "Tienda no encontrada" : "Store not found",
      robots: { index: false, follow: true },
    };
  }
  return storePageMetadata(data, locale);
}

export async function StoreRoute({
  storeSlug,
  categorySlug,
  locale,
}: {
  storeSlug: string;
  categorySlug: string | null;
  locale: Locale;
}) {
  const data = await getStorePage(storeSlug, categorySlug, locale);
  // 404 real: una tienda sin artículos, o una categoría que la tienda no
  // vende, no es una landing.
  if (!data) notFound();

  const path = data.category
    ? storeCategoryPaths(data.store.slug, data.category.slug)[locale]
    : storePaths(data.store.slug)[locale];

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd(locale),
          websiteJsonLd(locale),
          categoryCollectionJsonLd({
            locale,
            path,
            name: storePageHeading(data, locale),
            description: storePageDescription(data, locale),
            image: data.store.imageUrl,
          }),
          itemListJsonLd(data.popular.length > 0 ? data.popular : data.initialProducts, locale),
          breadcrumbJsonLd(storeBreadcrumbs(data, locale)),
        ])}
      />
      <StorePageView locale={locale} data={data} />
    </>
  );
}
