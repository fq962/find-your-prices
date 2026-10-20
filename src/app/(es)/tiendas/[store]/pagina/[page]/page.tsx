import type { Metadata } from "next";
import { StoreBrowseRoute, storeBrowseMetadata } from "@/features/stores/storeRoutes";

/**
 * Listado paginado "todos los productos" de una tienda (solo es). Ver
 * `server/services/browsePages.ts`.
 *
 * El segmento fijo `pagina` gana sobre `[slug]` del mismo nivel, así que
 * `/tiendas/walmart/pagina/3` llega acá y no a una categoría llamada "pagina".
 */
export const revalidate = 3600;

/** Cada página se guarda (ISR) en su primera visita. Ver `app/(es)/p/[slug]/page.tsx`. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ store: string; page: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { store, page } = await params;
  return storeBrowseMetadata(store, page);
}

export default async function StoreBrowsePage({ params }: PageProps) {
  const { store, page } = await params;
  return <StoreBrowseRoute storeSlug={store} rawPage={page} />;
}
