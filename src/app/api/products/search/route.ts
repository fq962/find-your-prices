import {
  CATALOG_SEARCH_CACHE_SECONDS,
  searchCatalogCached,
  type CatalogLocale,
  type CatalogSort,
} from "@/server/services/catalog";

/**
 * GET /api/products/search
 *
 * Parámetros: q, store, storeSlug, category, brand, minPrice, maxPrice,
 * onlyDiscounted, includeUnavailable, sort, limit, offset, locale. `store`,
 * `storeSlug`, `category` y `brand` se pueden repetir (`store=A&store=B`) y se
 * combinan con OR. `storeSlug` es el alcance fijo de una landing de tienda.
 *
 * Búsqueda y filtrado sobre el catálogo completo. La página sirve un primer
 * lote curado; en cuanto el visitante escribe o filtra, la consulta se resuelve
 * en Postgres para que alcance los miles de artículos y no solo los servidos.
 *
 * Es de lectura pública: no expone nada que el catálogo no muestre ya.
 *
 * Caché en dos capas, las dos de cinco minutos: `searchCatalogCached` guarda
 * el resultado en el data cache de Next (una consulta a Postgres por
 * combinación de filtros), y la cabecera `Cache-Control` deja que el CDN
 * sirva las repetidas sin llegar siquiera a Node. `force-dynamic` sigue
 * porque la ruta lee la query string; no impide el data cache.
 *
 * `total` solo se calcula en la primera página: es un `count(*)` sobre toda
 * la vista filtrada y el cliente ya lo tiene cuando pide la siguiente.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = `public, s-maxage=${CATALOG_SEARCH_CACHE_SECONDS}, stale-while-revalidate=${CATALOG_SEARCH_CACHE_SECONDS * 2}`;

const SORTS: CatalogSort[] = [
  "newest",
  "relevance",
  "discount",
  "price-asc",
  "price-desc",
  "name-asc",
  "rating",
];

/** Lee un número de la query respetando el 0 y descartando basura. */
function numericParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const param = (name: string) => url.searchParams.get(name) ?? undefined;
  const listParam = (name: string) =>
    url.searchParams
      .getAll(name)
      .map((raw) => raw.trim())
      .filter(Boolean);

  const rawSort = url.searchParams.get("sort");
  // El default coincide con DEFAULT_SORT del cliente: una petición sin `sort`
  // tiene que devolver lo mismo que la primera carga de la página.
  const sort = SORTS.includes(rawSort as CatalogSort)
    ? (rawSort as CatalogSort)
    : "newest";
  const locale: CatalogLocale =
    url.searchParams.get("locale") === "en" ? "en" : "es";

  const offset = numericParam(url.searchParams.get("offset")) ?? 0;

  try {
    const { products, total } = await searchCatalogCached({
      query: param("q"),
      store: listParam("store"),
      storeSlug: listParam("storeSlug"),
      category: listParam("category"),
      brand: listParam("brand"),
      minPrice: numericParam(url.searchParams.get("minPrice")),
      maxPrice: numericParam(url.searchParams.get("maxPrice")),
      onlyDiscounted: url.searchParams.get("onlyDiscounted") === "1",
      // Sin el parámetro, el endpoint filtra agotados y precio 0 igual que la
      // página. Es lo correcto para un default: quien no dice nada recibe lo que
      // se puede comprar hoy, y verlo todo hay que pedirlo.
      includeUnavailable: url.searchParams.get("includeUnavailable") === "1",
      sort,
      locale,
      limit: numericParam(url.searchParams.get("limit")) ?? 60,
      offset,
      withTotal: offset === 0,
    });

    return Response.json(
      { ok: true, products, total },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    // Un fallo de base es un 500 honesto, no "0 resultados": el cliente
    // muestra su estado de error y ofrece reintentar.
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
