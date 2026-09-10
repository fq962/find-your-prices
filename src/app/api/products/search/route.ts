import { searchCatalog, type CatalogLocale, type CatalogSort } from '@/server/services/catalog';

/**
 * GET /api/products/search
 *
 * Parámetros: q, store, category, brand, minPrice, maxPrice, onlyDiscounted,
 * onlyInStock, sort, limit, offset, locale.
 *
 * Búsqueda y filtrado sobre el catálogo completo. La página sirve un primer
 * lote curado; en cuanto el visitante escribe o filtra, la consulta se resuelve
 * en Postgres para que alcance los miles de artículos y no solo los servidos.
 *
 * Es de lectura pública: no expone nada que el catálogo no muestre ya.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SORTS: CatalogSort[] = [
  'newest',
  'relevance',
  'discount',
  'price-asc',
  'price-desc',
  'name-asc',
  'rating',
];

/** Lee un número de la query respetando el 0 y descartando basura. */
function numericParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const param = (name: string) => url.searchParams.get(name) ?? undefined;

  const rawSort = url.searchParams.get('sort');
  // El default coincide con DEFAULT_SORT del cliente: una petición sin `sort`
  // tiene que devolver lo mismo que la primera carga de la página.
  const sort = SORTS.includes(rawSort as CatalogSort) ? (rawSort as CatalogSort) : 'newest';
  const locale: CatalogLocale = url.searchParams.get('locale') === 'en' ? 'en' : 'es';

  const { products, total } = await searchCatalog({
    query: param('q'),
    store: param('store'),
    category: param('category'),
    brand: param('brand'),
    minPrice: numericParam(url.searchParams.get('minPrice')),
    maxPrice: numericParam(url.searchParams.get('maxPrice')),
    onlyDiscounted: url.searchParams.get('onlyDiscounted') === '1',
    onlyInStock: url.searchParams.get('onlyInStock') === '1',
    sort,
    locale,
    limit: numericParam(url.searchParams.get('limit')) ?? 60,
    offset: numericParam(url.searchParams.get('offset')) ?? 0,
  });

  return Response.json({ ok: true, products, total });
}
