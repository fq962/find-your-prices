import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseAdmin } from '@/server/db/supabase';
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
  const db = getSupabaseAdmin();
  const [categories, content] = await Promise.all([
    db
      .from('categories')
      .select('id, parent_id, slug, name, level, is_active, image_url, image_alt, featured_position')
      .order('level')
      .order('position')
      .order('name'),
    db.from('category_content').select('category_id, locale, title, meta_description, intro, body, keywords'),
  ]);
  if (categories.error) throw new Error(categories.error.message);
  if (content.error) throw new Error(content.error.message);

  const byCategory = new Map<string, Record<Locale, CategoryContentFields>>();
  for (const row of (content.data ?? []) as Array<{
    category_id: string;
    locale: Locale;
    title: string | null;
    meta_description: string | null;
    intro: string | null;
    body: string | null;
    keywords: string[] | null;
  }>) {
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

  return ((categories.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    parentId: (row.parent_id as string | null) ?? null,
    slug: String(row.slug),
    name: String(row.name),
    level: Number(row.level),
    isActive: Boolean(row.is_active),
    imageUrl: (row.image_url as string | null) ?? null,
    imageAlt: (row.image_alt as string | null) ?? null,
    featuredPosition: (row.featured_position as number | null) ?? null,
    content: byCategory.get(String(row.id)) ?? { es: EMPTY_FIELDS, en: EMPTY_FIELDS },
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
  const db = getSupabaseAdmin();

  const category = await db
    .from('categories')
    .update({ image_alt: nullable(input.imageAlt), featured_position: input.featuredPosition })
    .eq('id', id)
    .select('slug, parent_id')
    .single();
  if (category.error) throw new Error(category.error.message);

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

  const upsert = await db.from('category_content').upsert(rows, { onConflict: 'category_id,locale' });
  if (upsert.error) throw new Error(upsert.error.message);

  await revalidateCategory(String(category.data.slug), category.data.parent_id as string | null);
}

/**
 * Sube la imagen al bucket y guarda su URL pública en la categoría.
 *
 * El nombre del objeto es `<slug>-<hash corto>.<ext>` para que reemplazar la
 * foto cambie la URL: la anterior queda en cachés (CDN, navegador, Open
 * Graph) y con la misma ruta seguiría viéndose la vieja durante horas.
 */
export async function uploadCategoryImage(id: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede pasar de 5 MB.');

  const db = getSupabaseAdmin();
  const category = await db.from('categories').select('slug, parent_id, image_url').eq('id', id).single();
  if (category.error) throw new Error(category.error.message);

  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectPath = `${category.data.slug}-${Date.now().toString(36)}.${extension}`;

  // Los bytes y no el `File`: con un File, supabase-js decide el tipo MIME
  // según el runtime (en Node lo mandaba como text/plain y el bucket lo
  // rechazaba). Con un ArrayBuffer manda exactamente `contentType`.
  const bytes = await file.arrayBuffer();
  const upload = await db.storage
    .from(CATEGORY_IMAGES_BUCKET)
    .upload(objectPath, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (upload.error) throw new Error(`No se pudo subir la imagen: ${upload.error.message}`);

  const { data } = db.storage.from(CATEGORY_IMAGES_BUCKET).getPublicUrl(objectPath);
  const publicUrl = data.publicUrl;

  const update = await db.from('categories').update({ image_url: publicUrl }).eq('id', id);
  if (update.error) throw new Error(update.error.message);

  // La foto anterior ya no la referencia nadie: se borra para no acumular.
  await removeStoredObject(category.data.image_url as string | null);
  await revalidateCategory(String(category.data.slug), category.data.parent_id as string | null);
  return publicUrl;
}

export async function removeCategoryImage(id: string): Promise<void> {
  const db = getSupabaseAdmin();
  const category = await db.from('categories').select('slug, parent_id, image_url').eq('id', id).single();
  if (category.error) throw new Error(category.error.message);

  const update = await db.from('categories').update({ image_url: null }).eq('id', id);
  if (update.error) throw new Error(update.error.message);

  await removeStoredObject(category.data.image_url as string | null);
  await revalidateCategory(String(category.data.slug), category.data.parent_id as string | null);
}

/** Borra el objeto del bucket si la URL es de este bucket. Nunca lanza. */
async function removeStoredObject(url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/object/public/${CATEGORY_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const objectPath = decodeURIComponent(url.slice(index + marker.length));
  await getSupabaseAdmin().storage.from(CATEGORY_IMAGES_BUCKET).remove([objectPath]);
}

/** Tira las copias ISR de todo lo que muestra esta categoría. */
async function revalidateCategory(slug: string, parentId: string | null): Promise<void> {
  const paths = new Set<string>([
    ...Object.values(categoryPaths(slug)),
    ...Object.values(categoryIndexPaths()),
  ]);
  if (parentId) {
    const parent = await getSupabaseAdmin().from('categories').select('slug').eq('id', parentId).single();
    if (!parent.error) for (const path of Object.values(categoryPaths(String(parent.data.slug)))) paths.add(path);
  }
  for (const path of paths) revalidatePath(path);
  // Las búsquedas acotadas no cambian con el texto, pero sí las facetas
  // cacheadas si se desactivó algo: barato y evita una incoherencia de 5 min.
  revalidateTag(CATALOG_SEARCH_CACHE_TAG, 'max');
}
