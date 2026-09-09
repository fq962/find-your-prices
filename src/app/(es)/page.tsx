import { HomeView } from "@/components/layout/HomeView";
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
  const catalog = await getCatalogSnapshot({ locale: "es", limit: 48 });
  return <HomeView locale="es" catalog={catalog} />;
}
