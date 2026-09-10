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

/** Español en la raíz: es el idioma por defecto del sitio, sin prefijo. */
export default async function Home() {
  const catalog = await getCatalogSnapshot({ locale: "es", limit: CATALOG_PAGE_SIZE });

  return (
    <>
      {/* Un solo grafo con la organización, el sitio, la portada y el primer
          lote de productos. Es lo que le permite a Google entender que estas
          cuatro cosas son la misma entidad y no cuatro páginas sueltas. */}
      <JsonLd
        data={graph([
          organizationJsonLd("es"),
          websiteJsonLd("es"),
          collectionPageJsonLd("es", "/"),
          itemListJsonLd(catalog.products, "es"),
        ])}
      />
      <HomeView locale="es" catalog={catalog} />
    </>
  );
}
