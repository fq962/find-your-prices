import type { Metadata } from "next";
import { StoreIndexRoute, storeIndexPageMetadata } from "@/features/stores/storeRoutes";

/**
 * Índice de tiendas (en). Ver `features/stores/storeRoutes.tsx`.
 *
 * Una hora de revalidación: las cifras cambian con el scraping y la imagen
 * con el panel, nunca por visitante.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return storeIndexPageMetadata("en");
}

export default function StoreIndexPage() {
  return <StoreIndexRoute locale="en" />;
}
