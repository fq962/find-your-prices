import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

/**
 * Subida y borrado de la imagen de una categoría contra Supabase de verdad
 * (bucket `category-images`, migración 0031). No corre en la suite normal:
 *
 *   SUPABASE_LIVE_TESTS=1 npx vitest run src/server/services/categoryContent.live.test.ts
 *
 * Necesita `.env.local` con la url y la secret key. Usa una categoría real
 * (por slug) y deja todo como estaba: la imagen que sube, la borra.
 */

vi.mock('server-only', () => import('@/test/server-only-stub'));
// `revalidatePath` fuera de una petición de Next lanza: acá no hay páginas.
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: <T>(fn: T) => fn,
}));

const enabled = process.env.SUPABASE_LIVE_TESTS === '1';
const SLUG = process.env.CATEGORY_SLUG ?? 'electronica-electrodomesticos';

/** Sin dotenv en el proyecto: se lee .env.local a mano. */
function loadEnvLocal(): void {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
  }
}

describe.skipIf(!enabled)('categoryContent contra Supabase', () => {
  test('sube una imagen al bucket, la enlaza a la categoría y la quita', async () => {
    loadEnvLocal();
    const { getSupabaseAdmin } = await import('@/server/db/supabase');
    const { uploadCategoryImage, removeCategoryImage } = await import('./categoryContent');

    const db = getSupabaseAdmin();
    const { data: category } = await db.from('categories').select('id').eq('slug', SLUG).single();
    expect(category?.id).toBeTruthy();
    const id = String(category!.id);

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="40" y="40" width="320" height="190" rx="14" fill="#0071e3"/></svg>';
    const file = new File([svg], 'prueba.svg', { type: 'image/svg+xml' });

    const url = await uploadCategoryImage(id, file);
    expect(url).toContain('/object/public/category-images/');

    // La URL pública responde y la categoría la referencia.
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const linked = await db.from('categories').select('image_url').eq('id', id).single();
    expect(linked.data?.image_url).toBe(url);

    await removeCategoryImage(id);
    const cleared = await db.from('categories').select('image_url').eq('id', id).single();
    expect(cleared.data?.image_url).toBeNull();
    // El objeto ya no está (404 o 400 según la CDN; nunca 200).
    const gone = await fetch(url, { cache: 'no-store' });
    expect(gone.status).not.toBe(200);
  }, 30_000);
});
