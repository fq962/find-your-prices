import type { Metadata } from "next";
import { CategoryIndexRoute, categoryIndexPageMetadata } from "@/features/categories/categoryRoutes";

/**
 * Índice de categorías (es). Ver `features/categories/categoryRoutes.tsx`.
 *
 * Una hora de revalidación: el árbol y sus cifras cambian con el scraping y
 * con el panel, nunca por visitante.
 */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return categoryIndexPageMetadata("es");
}

export default function CategoryIndexPage() {
  return <CategoryIndexRoute locale="es" />;
}
