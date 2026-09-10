import { HomeView } from "@/components/layout/HomeView";
import { CATALOG_PAGE_SIZE } from "@/features/products/catalogPaging";
import {
  collectionPageJsonLd,
  graph,
  itemListJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/schema";
import { JsonLd } from "@/lib/seo/JsonLd";
import { getCatalogSnapshot } from "@/server/services/catalog";

/**
 * El catálogo cambia cuando corre el scraper, no en cada visita. Con
 * revalidación cada 5 minutos la página se sirve desde caché —rápida y sin
 * golpear la base por visitante— y aun así refleja los precios nuevos poco
 * después de cada corrida. Sin esto Next la prerenderiza una sola vez en el
 * build y los precios quedarían congelados para siempre.
 */
export const revalidate = 300;

/** Inglés bajo /en. */
export default async function EnglishHome() {
  const catalog = await getCatalogSnapshot({ locale: "en", limit: CATALOG_PAGE_SIZE });

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd("en"),
          websiteJsonLd("en"),
          collectionPageJsonLd("en", "/en"),
          itemListJsonLd(catalog.products, "en"),
        ])}
      />
      <HomeView locale="en" catalog={catalog} />
    </>
  );
}
