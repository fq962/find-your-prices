import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { storeIndexPaths, storePaths } from '@/lib/seo/storeSeo';
import { CATALOG_SEARCH_CACHE_TAG } from './catalog';

/**
 * Mantenimiento de la imagen de cada tienda (migración 0033): subida a
 * Storage, texto alternativo y baja de la imagen.
 *
 * Es la contraparte de escritura de `storePages.ts`, y la hermana de
 * `categoryContent.ts`: mismas reglas de nombre de objeto, misma limpieza
 * de la foto anterior y misma revalidación de las landings afectadas.
 */

export const STORE_IMAGES_BUCKET = 'store-images';

export interface StoreContentRow {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
}

export async function listStoresForContent(): Promise<StoreContentRow[]> {
  const db = getSupabaseAdmin();
  const select = (columns: string) => db.from('stores').select(columns).order('name');
  const firstTry = await select('id, slug, name, base_url, is_active, logo_url, image_alt');
  // Sin la 0033 no hay `image_alt`; la lista sigue.
  const stores =
    firstTry.error && firstTry.error.code === '42703'
      ? await select('id, slug, name, base_url, is_active, logo_url')
      : firstTry;
  if (stores.error) throw new Error(stores.error.message);

  return ((stores.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    baseUrl: String(row.base_url ?? ''),
    isActive: Boolean(row.is_active),
    imageUrl: (row.logo_url as string | null) ?? null,
    imageAlt: (row.image_alt as string | null) ?? null,
  }));
}

export async function getStoreForContent(id: string): Promise<StoreContentRow | null> {
  const rows = await listStoresForContent();
  return rows.find((row) => row.id === id) ?? null;
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function saveStoreContent(id: string, input: { imageAlt: string }): Promise<void> {
  const db = getSupabaseAdmin();
  const store = await db
    .from('stores')
    .update({ image_alt: nullable(input.imageAlt) })
    .eq('id', id)
    .select('slug')
    .single();
  if (store.error) throw new Error(store.error.message);
  revalidateStore(String(store.data.slug));
}

/**
 * Sube la imagen al bucket y guarda su URL pública en `logo_url`.
 *
 * El nombre del objeto es `<slug>-<hash corto>.<ext>` para que reemplazar la
 * foto cambie la URL: la anterior queda en cachés y con la misma ruta
 * seguiría viéndose la vieja durante horas.
 */
export async function uploadStoreImage(id: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede pasar de 5 MB.');

  const db = getSupabaseAdmin();
  const store = await db.from('stores').select('slug, logo_url').eq('id', id).single();
  if (store.error) throw new Error(store.error.message);

  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectPath = `${store.data.slug}-${Date.now().toString(36)}.${extension}`;

  // Los bytes y no el `File`: ver `uploadCategoryImage`.
  const bytes = await file.arrayBuffer();
  const upload = await db.storage
    .from(STORE_IMAGES_BUCKET)
    .upload(objectPath, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (upload.error) throw new Error(`No se pudo subir la imagen: ${upload.error.message}`);

  const { data } = db.storage.from(STORE_IMAGES_BUCKET).getPublicUrl(objectPath);
  const publicUrl = data.publicUrl;

  const update = await db.from('stores').update({ logo_url: publicUrl }).eq('id', id);
  if (update.error) throw new Error(update.error.message);

  await removeStoredObject(store.data.logo_url as string | null);
  revalidateStore(String(store.data.slug));
  return publicUrl;
}

export async function removeStoreImage(id: string): Promise<void> {
  const db = getSupabaseAdmin();
  const store = await db.from('stores').select('slug, logo_url').eq('id', id).single();
  if (store.error) throw new Error(store.error.message);

  const update = await db.from('stores').update({ logo_url: null }).eq('id', id);
  if (update.error) throw new Error(update.error.message);

  await removeStoredObject(store.data.logo_url as string | null);
  revalidateStore(String(store.data.slug));
}

/** Borra el objeto del bucket si la URL es de este bucket. Nunca lanza. */
async function removeStoredObject(url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/object/public/${STORE_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const objectPath = decodeURIComponent(url.slice(index + marker.length));
  await getSupabaseAdmin().storage.from(STORE_IMAGES_BUCKET).remove([objectPath]);
}

/**
 * Tira las copias ISR del índice y de la landing de la tienda. Las de
 * tienda × categoría son muchas y caducan solas en una hora: la imagen
 * cambia una vez, no vale la pena enumerarlas.
 */
function revalidateStore(slug: string): void {
  for (const path of [...Object.values(storePaths(slug)), ...Object.values(storeIndexPaths())]) {
    revalidatePath(path);
  }
  revalidateTag(CATALOG_SEARCH_CACHE_TAG, 'max');
}
