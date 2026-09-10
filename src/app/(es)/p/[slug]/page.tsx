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
 * Ficha de producto en español.
 *
 * Se revalida cada 10 minutos: los datos de un artículo cambian menos que el
 * listado, y una ficha servida desde caché carga al instante. El precio lleva
 * su marca de "último chequeo" a la vista, así que un desfase de minutos es
 * honesto y visible, no un dato caducado disfrazado de actual.
 *
 * Esa misma revalidación es la que mantiene el precio del `<title>` y del
 * JSON-LD alineado con el que ve el visitante. Un precio en los datos
 * estructurados que no coincide con el de la página es motivo de sanción
 * manual de Google, no un detalle cosmético.
 */
export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductDetail(slug, "es");

  if (!product) return missingProductMetadata("es");
  return productMetadata(product, "es", slug);
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductDetail(slug, "es");

  // 404 real en vez de una ficha vacía: el artículo puede haber sido retirado.
  if (!product) notFound();

  const related = await getRelatedProducts(product, "es");
  const path = productPaths(slug).es;

  return (
    /* La misma ficha en el otro idioma comparte el id, así que su ruta se
       arma acá: cambiar de idioma en un producto lleva a ese producto, no a
       la portada. */
    <PageLayout locale="es" localePaths={productPaths(slug)}>
      {/* Producto, oferta, página y migas en un solo grafo: es lo que hace que
          el resultado salga con precio, disponibilidad y estrellas en vez de
          con dos líneas de texto. */}
      <JsonLd
        data={graph([
          organizationJsonLd("es"),
          websiteJsonLd("es"),
          productPageJsonLd({ product, locale: "es", path }),
          productJsonLd({ product, locale: "es", path }),
          breadcrumbJsonLd(productBreadcrumbs(product, "es", slug)),
        ])}
      />
      <ProductOgTags product={product} />
      <ProductDetailView product={product} related={related} locale="es" />
    </PageLayout>
  );
}
