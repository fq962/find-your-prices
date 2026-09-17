import type { Metadata } from "next";
import { StoreIndexRoute, storeIndexPageMetadata } from "@/features/stores/storeRoutes";

/**
 * Índice de tiendas (es). Ver `features/stores/storeRoutes.tsx`.
 *
 * Una hora de revalidación: las cifras cambian con el scraping y la imagen
 * con el panel, nunca por visitante.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return storeIndexPageMetadata("es");
}

export default function StoreIndexPage() {
  return <StoreIndexRoute locale="es" />;
}
