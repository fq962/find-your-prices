import type { Metadata } from "next";
import { CategoryBrowseRoute, categoryBrowseMetadata } from "@/features/categories/categoryRoutes";

/**
 * Listado paginado "todos los productos" de una categoría (solo es). Ver
 * `server/services/browsePages.ts`.
 */
export const revalidate = 3600;

/** Cada página se guarda (ISR) en su primera visita. Ver `app/(es)/p/[slug]/page.tsx`. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string; page: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, page } = await params;
  return categoryBrowseMetadata(slug, page);
}

export default async function CategoryBrowsePage({ params }: PageProps) {
  const { slug, page } = await params;
  return <CategoryBrowseRoute slug={slug} rawPage={page} />;
}
