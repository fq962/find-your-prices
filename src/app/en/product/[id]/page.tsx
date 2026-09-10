import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductDetailView } from "@/features/products/components/ProductDetailView";
import {
  getProductDetail,
  getRelatedProducts,
} from "@/server/services/catalog";

/**
 * Product detail page in English.
 *
 * Se revalida cada 10 minutos: los datos de un artículo cambian menos que el
 * listado, y una ficha servida desde caché carga al instante. El precio lleva
 * su marca de "último chequeo" a la vista, así que un desfase de minutos es
 * honesto y visible, no un dato caducado disfrazado de actual.
 */
export const revalidate = 600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductDetail(id, "en");

  if (!product) return { title: "Product not found" };

  const price = new Intl.NumberFormat("en-HN", {
    style: "currency",
    currency: product.currency,
  }).format(product.price);

  return {
    title: `${product.name} — ${price} en ${product.store}`,
    description:
      product.description ??
      `Price of ${product.name} at ${product.store}. Compare prices in Honduras with Find Your Prices.`,
    openGraph: {
      title: `${product.name} — ${price}`,
      description: `Available at ${product.store}.`,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProductDetail(id, "en");

  // A real 404 instead of an empty page: the item may have been delisted.
  if (!product) notFound();

  const related = await getRelatedProducts(product, "en");

  return (
    /* La misma ficha en el otro idioma comparte el id, así que su ruta se
       arma acá: cambiar de idioma en un producto lleva a ese producto, no a
       la portada. */
    <PageLayout
      locale="en"
      localePaths={{ es: `/producto/${id}`, en: `/en/product/${id}` }}
    >
      <ProductDetailView product={product} related={related} locale="en" />
    </PageLayout>
  );
}
