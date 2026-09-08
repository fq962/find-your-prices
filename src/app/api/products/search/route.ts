import { searchCatalog, type CatalogLocale, type CatalogSort } from '@/server/services/catalog';

/**
 * GET /api/products/search?q=&store=&category=&sort=&locale=
 *
 * Búsqueda sobre el catálogo completo. La página sirve un primer lote curado;
 * en cuanto el visitante escribe, la consulta se resuelve en Postgres para que
 * la búsqueda alcance los miles de artículos y no solo los servidos.
 *
 * Es de lectura pública: no expone nada que el catálogo no muestre ya.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SORTS: CatalogSort[] = ['relevance', 'price-asc', 'price-desc', 'discount'];

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const rawSort = url.searchParams.get('sort');
  const sort = SORTS.includes(rawSort as CatalogSort) ? (rawSort as CatalogSort) : 'relevance';
  const locale: CatalogLocale = url.searchParams.get('locale') === 'en' ? 'en' : 'es';

  const products = await searchCatalog({
    query: url.searchParams.get('q') ?? undefined,
    store: url.searchParams.get('store') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    sort,
    locale,
    limit: Number(url.searchParams.get('limit')) || 60,
  });

  return Response.json({ ok: true, products });
}
