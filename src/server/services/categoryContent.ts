import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { categories, categoryContent } from '@/server/db/schema';
import { deleteByPublicUrl, uploadImage } from '@/server/storage/r2';
import type { Locale } from '@/features/i18n/translate';
import { categoryPaths, categoryIndexPaths } from '@/lib/seo/categorySeo';
import { CATALOG_SEARCH_CACHE_TAG } from './catalog';

/**
 * Mantenimiento del contenido de las páginas de categoría (migración 0031):
 * imagen en Storage, destacado, y texto SEO por idioma.
 *
 * Es la contraparte de escritura de `categoryPages.ts`. Lo llaman las server
 * actions del panel (`/admin/categorias/contenido`), que ya están detrás de
 * la puerta de `/admin`. Cada guardado revalida las landings afectadas: la
 * página de la categoría en los dos idiomas, la de su madre (que la lista) y
 * el índice, para que el cambio se vea sin esperar la hora de ISR.
 *
 * Las filas van por Drizzle y las imágenes viven en R2 (carpeta
 * `category-images/`, ver `server/storage/r2.ts`).
 */

export const CATEGORY_IMAGES_BUCKET = 'category-images';

/** Lo que el panel muestra en la lista y carga en el formulario. */
export interface CategoryContentRow {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  level: number;
  isActive: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  featuredPosition: number | null;
  content: Record<Locale, CategoryContentFields>;
}

export interface CategoryContentFields {
  title: string;
  metaDescription: string;
  intro: string;
  body: string;
  /** Una por línea en el formulario; array en la base. */
  keywords: string[];
}

const EMPTY_FIELDS: CategoryContentFields = {
  title: '',
  metaDescription: '',
  intro: '',
  body: '',
  keywords: [],
};

export async function listCategoriesForContent(): Promise<CategoryContentRow[]> {
  const db = getDb();
  const [categoryRows, content] = await Promise.all([
    db
      .select({
        id: categories.id,
        parent_id: categories.parent_id,
        slug: categories.slug,
        name: categories.name,
        level: categories.level,
        is_active: categories.is_active,
        image_url: categories.image_url,
        image_alt: categories.image_alt,
        featured_position: categories.featured_position,
      })
      .from(categories)
      .orderBy(asc(categories.level), asc(categories.position), asc(categories.name)),
    db.select().from(categoryContent),
  ]);

  const byCategory = new Map<string, Record<Locale, CategoryContentFields>>();
  for (const row of content) {
    const entry = byCategory.get(row.category_id) ?? { es: EMPTY_FIELDS, en: EMPTY_FIELDS };
    entry[row.locale] = {
      title: row.title ?? '',
      metaDescription: row.meta_description ?? '',
      intro: row.intro ?? '',
      body: row.body ?? '',
      keywords: row.keywords ?? [],
    };
    byCategory.set(row.category_id, entry);
  }

  return categoryRows.map((row) => ({
    id: row.id,
    parentId: row.parent_id ?? null,
    slug: row.slug,
    name: row.name,
    level: Number(row.level),
    isActive: row.is_active,
    imageUrl: row.image_url ?? null,
    imageAlt: row.image_alt ?? null,
    featuredPosition: row.featured_position ?? null,
    content: byCategory.get(row.id) ?? { es: EMPTY_FIELDS, en: EMPTY_FIELDS },
  }));
}

export async function getCategoryForContent(id: string): Promise<CategoryContentRow | null> {
  const rows = await listCategoriesForContent();
  return rows.find((row) => row.id === id) ?? null;
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

/** Vacío → null: la base distingue "sin escribir" de "escrito vacío", la página no. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export interface SaveCategoryContentInput {
  imageAlt: string;
  featuredPosition: number | null;
  content: Record<Locale, CategoryContentFields>;
}

export async function saveCategoryContent(id: string, input: SaveCategoryContentInput): Promise<void> {
  const db = getDb();

  const [category] = await db
    .update(categories)
    .set({ image_alt: nullable(input.imageAlt), featured_position: input.featuredPosition })
    .where(eq(categories.id, id))
    .returning({ slug: categories.slug, parent_id: categories.parent_id });
  if (!category) throw new Error('Categoría no encontrada.');

  const rows = (['es', 'en'] as const).map((locale) => {
    const fields = input.content[locale];
    return {
      category_id: id,
      locale,
      title: nullable(fields.title),
      meta_description: nullable(fields.metaDescription),
      intro: nullable(fields.intro),
      body: nullable(fields.body),
      keywords: fields.keywords.map((k) => k.trim()).filter(Boolean),
    };
  });

  await db
    .insert(categoryContent)
    .values(rows)
    .onConflictDoUpdate({
      target: [categoryContent.category_id, categoryContent.locale],
      set: {
        title: sql`excluded.title`,
        meta_description: sql`excluded.meta_description`,
        intro: sql`excluded.intro`,
        body: sql`excluded.body`,
        keywords: sql`excluded.keywords`,
      },
    });

  await revalidateCategory(category.slug, category.parent_id);
}

/**
 * Sube la imagen al bucket y guarda su URL pública en la categoría.
 *
 * El nombre del objeto es `<slug>-<hash corto>.<ext>` para que reemplazar la
 * foto cambie la URL: la anterior queda en cachés (CDN, navegador, Open
 * Graph) y con la misma ruta seguiría viéndose la vieja durante horas.
 */
export async function uploadCategoryImage(id: string, file: File): Promise<string> {
  const category = await readCategory(id);
  const publicUrl = await uploadImage(CATEGORY_IMAGES_BUCKET, category.slug, file);

  await getDb().update(categories).set({ image_url: publicUrl }).where(eq(categories.id, id));

  // La foto anterior ya no la referencia nadie: se borra para no acumular.
  await deleteByPublicUrl(category.image_url);
  await revalidateCategory(category.slug, category.parent_id);
  return publicUrl;
}

export async function removeCategoryImage(id: string): Promise<void> {
  const category = await readCategory(id);

  await getDb().update(categories).set({ image_url: null }).where(eq(categories.id, id));

  await deleteByPublicUrl(category.image_url);
  await revalidateCategory(category.slug, category.parent_id);
}

async function readCategory(
  id: string,
): Promise<{ slug: string; parent_id: string | null; image_url: string | null }> {
  const [category] = await getDb()
    .select({ slug: categories.slug, parent_id: categories.parent_id, image_url: categories.image_url })
    .from(categories)
    .where(eq(categories.id, id));
  if (!category) throw new Error('Categoría no encontrada.');
  return category;
}

/** Tira las copias ISR de todo lo que muestra esta categoría. */
async function revalidateCategory(slug: string, parentId: string | null): Promise<void> {
  const paths = new Set<string>([
    ...Object.values(categoryPaths(slug)),
    ...Object.values(categoryIndexPaths()),
  ]);
  if (parentId) {
    const [parent] = await getDb()
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, parentId));
    if (parent) for (const path of Object.values(categoryPaths(parent.slug))) paths.add(path);
  }
  for (const path of paths) revalidatePath(path);
  // Las búsquedas acotadas no cambian con el texto, pero sí las facetas
  // cacheadas si se desactivó algo: barato y evita una incoherencia de 5 min.
  revalidateTag(CATALOG_SEARCH_CACHE_TAG, 'max');
}
