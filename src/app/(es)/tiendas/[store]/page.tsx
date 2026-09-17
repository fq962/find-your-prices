import type { Metadata } from "next";
import { StoreRoute, storePageMetadataFor } from "@/features/stores/storeRoutes";

/**
 * Landing de una tienda (es). Ver `features/stores/storeRoutes.tsx`.
 */
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ store: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { store } = await params;
  return storePageMetadataFor(store, null, "es");
}

export default async function StorePage({ params }: PageProps) {
  const { store } = await params;
  return <StoreRoute storeSlug={store} categorySlug={null} locale="es" />;
}
