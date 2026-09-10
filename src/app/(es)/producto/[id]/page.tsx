import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductDetailView } from "@/features/products/components/ProductDetailView";
import {
  getProductDetail,
  getRelatedProducts,
} from "@/server/services/catalog";

/**
 * Ficha de producto en español.
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
  const product = await getProductDetail(id, "es");

  if (!product) return { title: "Producto no encontrado" };

  const price = new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: product.currency,
  }).format(product.price);

  return {
    title: `${product.name} — ${price} en ${product.store}`,
    description:
      product.description ??
      `Precio de ${product.name} en ${product.store}. Compará precios en Honduras con Find Your Prices.`,
    openGraph: {
      title: `${product.name} — ${price}`,
      description: `Disponible en ${product.store}.`,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProductDetail(id, "es");

  // 404 real en vez de una ficha vacía: el artículo puede haber sido retirado.
  if (!product) notFound();

  const related = await getRelatedProducts(product, "es");

  return (
    /* La misma ficha en el otro idioma comparte el id, así que su ruta se
       arma acá: cambiar de idioma en un producto lleva a ese producto, no a
       la portada. */
    <PageLayout
      locale="es"
      localePaths={{ es: `/producto/${id}`, en: `/en/product/${id}` }}
    >
      <ProductDetailView product={product} related={related} locale="es" />
    </PageLayout>
  );
}
