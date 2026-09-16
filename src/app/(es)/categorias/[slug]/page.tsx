import type { Metadata } from "next";
import { CategoryRoute, categoryPageMetadata } from "@/features/categories/categoryRoutes";

/**
 * Página de una categoría (es). Ver `features/categories/categoryRoutes.tsx`.
 *
 * Una hora de revalidación, como las fichas: son ~130 landings que los
 * rastreadores recorren seguido y cuyos datos cambian con el scraping.
 */
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return categoryPageMetadata(slug, "es");
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  return <CategoryRoute slug={slug} locale="es" />;
}
