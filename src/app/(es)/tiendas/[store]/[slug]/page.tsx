import type { Metadata } from "next";
import { StoreRoute, storePageMetadataFor } from "@/features/stores/storeRoutes";

/**
 * Una categoría dentro de una tienda (es): "Abarrotes en PriceSmart". Ver
 * `features/stores/storeRoutes.tsx`.
 */
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ store: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { store, slug } = await params;
  return storePageMetadataFor(store, slug, "es");
}

export default async function StoreCategoryPage({ params }: PageProps) {
  const { store, slug } = await params;
  return <StoreRoute storeSlug={store} categorySlug={slug} locale="es" />;
}
