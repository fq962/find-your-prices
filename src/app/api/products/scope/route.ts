import { CATALOG_SEARCH_CACHE_SECONDS } from "@/server/services/catalog";
import { getSearchScope } from "@/server/services/storePages";

/**
 * GET /api/products/scope?store=&locale=
 *
 * Las categorías del selector del buscador de la barra: las del catálogo
 * entero y, con `store`, solo las que esa tienda vende. La barra está en
 * todas las páginas y estas páginas se sirven estáticas, así que el selector
 * lo pide aparte en vez de cargarlo cada ruta.
 *
 * Misma política de caché que la búsqueda: cambia solo con el scraping.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = `public, s-maxage=${CATALOG_SEARCH_CACHE_SECONDS}, stale-while-revalidate=${CATALOG_SEARCH_CACHE_SECONDS * 2}`;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const store = url.searchParams.get("store")?.trim() || null;
  const locale = url.searchParams.get("locale") === "en" ? "en" : "es";

  try {
    const scope = await getSearchScope(store, locale);
    return Response.json({ ok: true, ...scope }, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
