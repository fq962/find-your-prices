import { getSupabaseAdmin } from './supabase';

/**
 * Lecturas por la API HTTPS de Supabase (PostgREST), para correr scripts desde
 * una red que bloquea el puerto de Postgres (5432/6543) pero deja pasar HTTPS.
 *
 * NO es una segunda forma de hablar con la base: cubre solo las lecturas que
 * arma el generador de sitemaps (fichas, árbol de categorías, tiendas y
 * conteos), devuelve las mismas filas que la consulta de Drizzle a la que
 * reemplaza, y el sitio nunca lo carga. Lo enciende el script con
 * `enableRestFallback()` (restFlag.ts) cuando Postgres no responde.
 *
 * Desaparece cuando la base salga de Supabase (fase 6): en Hetzner no hay
 * PostgREST, y desde esa red habrá que usar otra conexión.
 */

const PAGE = 1000;

type Row = Record<string, unknown>;

/** Todas las filas de una tabla o vista, de a 1 000 (el tope de PostgREST). */
async function selectAll(relation: string, columns: string, onlyActive = false): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = getSupabaseAdmin().from(relation).select(columns);
    const query = onlyActive ? base.eq('is_active', true) : base;
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`No se pudo leer ${relation} por la API de Supabase: ${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** `v_store_products_current` con precio, ordenada por id: lo mismo que `selectProducts` de sitemap.ts. */
export async function sitemapProductRows(page: {
  limit: number;
  offset?: number;
  afterId?: string | null;
}): Promise<Array<{ id: string; public_slug: string | null; last_seen_at: string | null }>> {
  const rows: Array<{ id: string; public_slug: string | null; last_seen_at: string | null }> = [];
  let afterId = page.afterId ?? null;
  let skip = page.offset ?? 0;

  // PostgREST corta en 1 000: un pedido más grande se arma en varios viajes.
  while (rows.length < page.limit) {
    const size = Math.min(PAGE, page.limit - rows.length);
    let query = getSupabaseAdmin()
      .from('v_store_products_current')
      .select('id, public_slug, last_seen_at')
      .gt('price', 0)
      .order('id', { ascending: true });
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query.range(skip, skip + size - 1);
    if (error) throw new Error(`No se pudo leer el catálogo por la API de Supabase: ${error.message}`);

    const batch = (data ?? []) as Array<{ id: string; public_slug: string | null; last_seen_at: string | null }>;
    rows.push(...batch);
    if (batch.length < size) break;
    // Seguir por cursor: el offset ya se consumió en el primer viaje.
    afterId = batch[batch.length - 1].id;
    skip = 0;
  }
  return rows;
}

/** Las tres lecturas de `loadCategoryNodes` (categoryPages.ts). */
export async function categoryTreeRows(): Promise<{ categories: Row[]; content: Row[]; facets: Row[] }> {
  const [categories, content, facets] = await Promise.all([
    selectAll(
      'categories',
      'id, parent_id, slug, name, level, position, is_active, image_url, image_alt, featured_position',
      true,
    ),
    selectAll('category_content', 'category_id, locale, title, meta_description, intro, body, keywords').catch(
      () => [],
    ),
    selectAll('v_catalog_canonical_category_facets', 'slug, parent_slug, product_count'),
  ]);
  // Mismo orden que la consulta de Drizzle: nivel, posición, nombre.
  categories.sort(
    (a, b) =>
      Number(a.level) - Number(b.level) ||
      Number(a.position) - Number(b.position) ||
      String(a.name).localeCompare(String(b.name)),
  );
  return { categories, content, facets };
}

/** Las dos lecturas de `loadStoreRows` (storePages.ts). */
export async function storeRows(): Promise<{ stores: Row[]; facets: Row[] }> {
  const [stores, facets] = await Promise.all([
    selectAll('stores', 'id, slug, name, base_url, logo_url, image_alt', true),
    selectAll('v_catalog_store_facets', 'store_slug, product_count'),
  ]);
  stores.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { stores, facets };
}

/** `v_catalog_store_category_facets`, para `loadStoreCategoryCountRows` (storePages.ts). */
export async function storeCategoryCountRows(): Promise<Row[]> {
  return selectAll('v_catalog_store_category_facets', 'store_slug, slug, product_count');
}
