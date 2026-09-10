import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageLayout } from "@/components/layout/PageLayout";
import { ProductDetailView } from "@/features/products/components/ProductDetailView";
import {
  breadcrumbJsonLd,
  graph,
  organizationJsonLd,
  productJsonLd,
  productPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/schema";
import { JsonLd } from "@/lib/seo/JsonLd";
import {
  missingProductMetadata,
  productBreadcrumbs,
  productMetadata,
  productPaths,
} from "@/lib/seo/productSeo";
import { ProductOgTags } from "@/lib/seo/ProductOgTags";
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

  if (!product) return missingProductMetadata("en");
  return productMetadata(product, "en", id);
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProductDetail(id, "en");

  // A real 404 instead of an empty page: the item may have been delisted.
  if (!product) notFound();

  const related = await getRelatedProducts(product, "en");
  const path = productPaths(id).en;

  return (
    /* La misma ficha en el otro idioma comparte el id, así que su ruta se
       arma acá: cambiar de idioma en un producto lleva a ese producto, no a
       la portada. */
    <PageLayout locale="en" localePaths={productPaths(id)}>
      <JsonLd
        data={graph([
          organizationJsonLd("en"),
          websiteJsonLd("en"),
          productPageJsonLd({ product, locale: "en", path }),
          productJsonLd({ product, locale: "en", path }),
          breadcrumbJsonLd(productBreadcrumbs(product, "en", id)),
        ])}
      />
      <ProductOgTags product={product} />
      <ProductDetailView product={product} related={related} locale="en" />
    </PageLayout>
  );
}
