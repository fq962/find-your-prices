import {
  CATALOG_SEARCH_CACHE_SECONDS,
  getCatalogSuggestions,
} from "@/server/services/catalog";

/**
 * GET /api/products/suggest?q=
 *
 * Sugerencias para el buscador: tiendas, categorías y artículos cuyo nombre
 * coincide con lo escrito hasta ahora. Es lo que llena el desplegable bajo
 * la caja de búsqueda mientras se teclea.
 *
 * Misma política de caché que la búsqueda: el resultado de cada prefijo se
 * guarda cinco minutos en el data cache de Next y el CDN puede servir los
 * repetidos sin llegar a Node. Con dos letras o menos no se consulta nada.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = `public, s-maxage=${CATALOG_SEARCH_CACHE_SECONDS}, stale-while-revalidate=${CATALOG_SEARCH_CACHE_SECONDS * 2}`;

/** Tope de longitud: un tsquery de 500 palabras no sugiere nada útil. */
const MAX_QUERY_LENGTH = 80;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);

  try {
    const suggestions = await getCatalogSuggestions(query);
    return Response.json({ ok: true, ...suggestions }, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
