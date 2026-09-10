import { notFound, permanentRedirect } from "next/navigation";
import { productPaths } from "@/lib/seo/productSeo";
import { getProductSlug } from "@/server/services/catalog";

/**
 * La dirección vieja de una ficha: `/en/product/<uuid>`.
 *
 * Ya no pinta nada, sólo redirige a `/en/p/<slug>`. No se borra, y ese es todo el
 * punto: estas URLs están en el índice de Google, en los enlaces que la gente
 * ya compartió y en los sitemaps que Search Console leyó la semana pasada.
 * Quitarlas de golpe convertiría cada una de esas visitas en un 404 y tiraría
 * la autoridad que la ficha hubiera acumulado.
 *
 * La redirección es 308 (permanente): es lo que le dice a Google que traslade
 * el índice a la dirección nueva en vez de tratarla como un desvío temporal y
 * seguir sirviendo la vieja.
 */
export const revalidate = 600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LegacyProductPage({ params }: PageProps) {
  const { id } = await params;
  const slug = await getProductSlug(id);

  // Sin slug no hay a dónde mandar a nadie: el artículo se retiró, o el uuid
  // nunca existió. Un 404 es la respuesta honesta; redirigir a la portada sería
  // decirle a Google que esa ficha AHORA es la portada.
  if (!slug) notFound();

  permanentRedirect(productPaths(slug).en);
}
