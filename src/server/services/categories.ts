import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { toErrorResponse } from '@/server/scraping/api-guard';
import type {
  CanonicalCategory,
  CanonicalUsage,
  StoreCategoryRow,
  StoreOption,
} from '@/features/admin-categories/types';

/**
 * Mantenimiento del árbol canónico (`categories`) y del mapeo desde las
 * categorías de cada tienda (`store_categories.category_id`).
 *
 * Es lo único que toca estas tablas desde la app: el scraper escribe
 * `store_categories` pero nunca `category_id`, que es una decisión humana.
 * Por eso vive acá y no en `scraping/`.
 *
 * Reglas del árbol que este módulo mantiene:
 *   - `path` es `padre.path/slug` para una hija, `slug` para una raíz.
 *   - `level` es `padre.level + 1`; una raíz es 0.
 *   - Renombrar el slug o mover un nodo reescribe el path de sus hijas.
 *   - Hoy hay dos niveles. Un tercero se admite, pero el filtro del catálogo
 *     (`category_root_slug` en la migración 0024) solo resuelve la raíz de
 *     una hija directa; por eso `createCategory` y `updateCategory` lo
 *     rechazan hasta que el filtro lo soporte.
 */

const MAX_LEVEL = 1;

export class CategoryError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'CategoryError';
  }
}

/** Respuesta json para los route handlers: 4xx si es un error de uso, 500 si no. */
export function categoryErrorResponse(error: unknown): Response {
  if (error instanceof CategoryError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  return toErrorResponse(error);
}

/**
 * Slug a partir del nombre: minúsculas, sin acentos, guiones. Es el mismo
 * criterio que `find_your_prices.slugify` en la base, para que un slug hecho
 * acá y uno hecho allá coincidan.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

export interface CategoryAdminData {
  categories: CanonicalCategory[];
  storeCategories: StoreCategoryRow[];
  stores: StoreOption[];
  usage: Record<string, CanonicalUsage>;
}

/** Todo lo que el panel necesita, en un viaje por tabla. */
export async function loadCategoryAdminData(): Promise<CategoryAdminData> {
  const db = getSupabaseAdmin();

  const [categories, storeCategories, stores, facets] = await Promise.all([
    db
      .from('categories')
      .select('id, parent_id, slug, name, description, icon, path, level, position, is_active')
      .order('level')
      .order('position')
      .order('name'),
    fetchAll((from, to) =>
      db
        .from('store_categories')
        .select(
          'id, store_id, external_id, parent_id, name, level, url, product_count, category_id, is_active',
        )
        .order('store_id')
        .order('name')
        .range(from, to),
    ),
    db.from('stores').select('id, name, slug').order('name'),
    // Conteo vivo por categoría de tienda: es lo que decide si vale la pena
    // mapearla. La vista aplica el mismo piso que el catálogo.
    fetchAll((from, to) =>
      db
        .from('v_catalog_category_facets')
        .select('store_category_id, product_count')
        .range(from, to),
    ),
  ]);

  const failure = categories.error ?? stores.error;
  if (failure) throw new Error(failure.message);

  const liveCounts = new Map<string, number>();
  for (const row of facets as Array<{ store_category_id: string; product_count: number }>) {
    liveCounts.set(row.store_category_id, Number(row.product_count ?? 0));
  }

  const storeNames = new Map(
    ((stores.data ?? []) as StoreOption[]).map((store) => [store.id, store.name]),
  );

  type RawStoreCategory = {
    id: string;
    store_id: string;
    external_id: string;
    parent_id: string | null;
    name: string;
    level: number;
    url: string | null;
    product_count: number | null;
    category_id: string | null;
    is_active: boolean;
  };
  const raw = storeCategories as RawStoreCategory[];
  const byId = new Map(raw.map((row) => [row.id, row]));

  /** "Hogar › Cocina › Ollas", subiendo por `parent_id` con tope por si hay ciclo. */
  const storePath = (row: RawStoreCategory): string => {
    const names: string[] = [];
    let current: RawStoreCategory | undefined = row;
    for (let depth = 0; current && depth < 8; depth += 1) {
      names.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return names.join(' › ');
  };

  const rows: StoreCategoryRow[] = raw.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    store_name: storeNames.get(row.store_id) ?? row.store_id,
    external_id: row.external_id,
    parent_id: row.parent_id,
    name: row.name,
    store_path: storePath(row),
    level: row.level,
    url: row.url,
    is_active: row.is_active,
    reported_count: row.product_count,
    live_count: liveCounts.get(row.id) ?? 0,
    category_id: row.category_id,
  }));

  const usage: Record<string, CanonicalUsage> = {};
  for (const row of rows) {
    if (!row.category_id) continue;
    const entry = (usage[row.category_id] ??= { storeCategories: 0, products: 0 });
    entry.storeCategories += 1;
    entry.products += row.live_count;
  }

  return {
    categories: (categories.data ?? []) as CanonicalCategory[],
    storeCategories: rows,
    stores: (stores.data ?? []) as StoreOption[],
    usage,
  };
}

/**
 * PostgREST corta en 1000 filas por petición. `store_categories` ya pasa de
 * 2600, así que se pagina hasta agotar.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let index = 0; index < 50; index += 1) {
    const { data, error } = await page(index * PAGE, index * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// -----------------------------------------------------------------------------
// Mapeo
// -----------------------------------------------------------------------------

/**
 * Apunta varias categorías de tienda a un nodo canónico, o a ninguno.
 * Devuelve cuántas filas cambiaron.
 */
export async function assignStoreCategories(
  storeCategoryIds: string[],
  categoryId: string | null,
): Promise<number> {
  const ids = [...new Set(storeCategoryIds.filter(Boolean))];
  if (ids.length === 0) throw new CategoryError('No se indicó ninguna categoría de tienda');

  const db = getSupabaseAdmin();

  if (categoryId) {
    const { data, error } = await db
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new CategoryError('La categoría canónica no existe', 404);
  }

  const { data, error } = await db
    .from('store_categories')
    .update({ category_id: categoryId })
    .in('id', ids)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

// -----------------------------------------------------------------------------
// Árbol canónico
// -----------------------------------------------------------------------------

export interface CategoryInput {
  name?: string;
  slug?: string;
  parent_id?: string | null;
  description?: string | null;
  icon?: string | null;
  position?: number;
  is_active?: boolean;
}

async function getCategory(id: string): Promise<CanonicalCategory> {
  const { data, error } = await getSupabaseAdmin()
    .from('categories')
    .select('id, parent_id, slug, name, description, icon, path, level, position, is_active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new CategoryError('La categoría no existe', 404);
  return data as CanonicalCategory;
}

/** Path y nivel que le tocan a un nodo dado su padre (o ninguno). */
function placement(parent: CanonicalCategory | null, slug: string) {
  if (!parent) return { path: slug, level: 0 };
  if (parent.level >= MAX_LEVEL) {
    throw new CategoryError(
      `"${parent.name}" ya es una subcategoría; el árbol admite dos niveles (raíz e hija).`,
    );
  }
  return { path: `${parent.path ?? parent.slug}/${slug}`, level: parent.level + 1 };
}

export async function createCategory(input: CategoryInput): Promise<CanonicalCategory> {
  const name = input.name?.trim() ?? '';
  if (!name) throw new CategoryError('El nombre es obligatorio');
  const slug = slugify(input.slug?.trim() || name);
  if (!slug) throw new CategoryError('El slug queda vacío; usá letras o números');

  const parent = input.parent_id ? await getCategory(input.parent_id) : null;
  const { path, level } = placement(parent, slug);

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: parent?.id ?? null,
      path,
      level,
      position: input.position ?? (await nextPosition(parent?.id ?? null)),
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      is_active: input.is_active ?? true,
    })
    .select('id, parent_id, slug, name, description, icon, path, level, position, is_active')
    .single();
  if (error) {
    if (error.code === '23505') throw new CategoryError(`Ya existe una categoría con el slug "${slug}"`, 409);
    throw new Error(error.message);
  }
  return data as CanonicalCategory;
}

/** Última posición entre los hermanos más uno, para que lo nuevo entre al final. */
async function nextPosition(parentId: string | null): Promise<number> {
  let query = getSupabaseAdmin()
    .from('categories')
    .select('position')
    .order('position', { ascending: false })
    .limit(1);
  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
  const { data } = await query.maybeSingle();
  return Number((data as { position?: number } | null)?.position ?? -1) + 1;
}

/**
 * Edita un nodo. Si cambia el slug o el padre, reescribe path y nivel del
 * nodo y de sus hijas: el path no se calcula al leer, se guarda, así que hay
 * que mantenerlo a mano.
 */
export async function updateCategory(id: string, input: CategoryInput): Promise<CanonicalCategory> {
  const current = await getCategory(id);
  const db = getSupabaseAdmin();

  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new CategoryError('El nombre es obligatorio');
  const slug = input.slug === undefined ? current.slug : slugify(input.slug.trim() || name);
  if (!slug) throw new CategoryError('El slug queda vacío; usá letras o números');

  const parentId = input.parent_id === undefined ? current.parent_id : input.parent_id;
  if (parentId === id) throw new CategoryError('Una categoría no puede ser su propia madre');

  const children = await listChildren(id);
  const parent = parentId ? await getCategory(parentId) : null;
  if (parent && children.length > 0) {
    throw new CategoryError(
      `"${current.name}" tiene ${children.length} subcategorías; no puede pasar a ser hija de otra.`,
    );
  }
  if (parent?.parent_id === id) throw new CategoryError('No se puede colgar una categoría de su propia hija');

  const { path, level } = placement(parent, slug);

  const patch: Record<string, unknown> = { name, slug, parent_id: parentId, path, level };
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.icon !== undefined) patch.icon = input.icon?.trim() || null;
  if (input.position !== undefined) patch.position = input.position;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await db
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select('id, parent_id, slug, name, description, icon, path, level, position, is_active')
    .single();
  if (error) {
    if (error.code === '23505') throw new CategoryError(`Ya existe una categoría con el slug "${slug}"`, 409);
    throw new Error(error.message);
  }

  // Las hijas heredan el path nuevo. Son pocas por nodo; un update por hija
  // es más claro que una sentencia con `case`.
  if (path !== current.path || level !== current.level) {
    for (const child of children) {
      const { error: childError } = await db
        .from('categories')
        .update({ path: `${path}/${child.slug}`, level: level + 1 })
        .eq('id', child.id);
      if (childError) throw new Error(childError.message);
    }
  }

  return data as CanonicalCategory;
}

async function listChildren(id: string): Promise<CanonicalCategory[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('categories')
    .select('id, parent_id, slug, name, description, icon, path, level, position, is_active')
    .eq('parent_id', id);
  if (error) throw new Error(error.message);
  return (data ?? []) as CanonicalCategory[];
}

/**
 * Borra un nodo. Solo si nada cuelga de él: ni hijas ni categorías de tienda.
 * Las llaves foráneas harían `set null` en silencio, y eso mandaría artículos
 * a "sin categorizar" sin que nadie lo pidiera.
 */
export async function deleteCategory(id: string): Promise<void> {
  const category = await getCategory(id);
  const db = getSupabaseAdmin();

  const [children, mapped] = await Promise.all([
    db.from('categories').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    db.from('store_categories').select('id', { count: 'exact', head: true }).eq('category_id', id),
  ]);
  if (children.error) throw new Error(children.error.message);
  if (mapped.error) throw new Error(mapped.error.message);

  if ((children.count ?? 0) > 0) {
    throw new CategoryError(
      `"${category.name}" tiene ${children.count} subcategorías. Movelas o borralas primero.`,
    );
  }
  if ((mapped.count ?? 0) > 0) {
    throw new CategoryError(
      `"${category.name}" tiene ${mapped.count} categorías de tienda relacionadas. Reasignalas primero.`,
    );
  }

  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
