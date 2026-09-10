import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';

/**
 * Datos para los sitemaps de producto.
 *
 * Vive aparte de `catalog.ts` porque no comparte nada con él salvo la tabla:
 * un sitemap no necesita precio, ni marca, ni imagen —sólo el id y la fecha
 * del último chequeo—, y pedir la fila completa de decenas de miles de
 * artículos para tirar el 95 % de las columnas es la manera fácil de que
 * generar el sitemap tarde minutos.
 */

/** La vista pública: sólo artículos activos y con precio. */
const VIEW = 'v_store_products_current';

/**
 * Artículos por archivo de sitemap.
 *
 * El límite del protocolo son 50 000 URLs o 50 MB por archivo. Se usa 10 000 y
 * no 50 000 por dos razones: un archivo de 10 000 entradas pesa ~2 MB y se
 * genera en pocos segundos, y cuando cambian precios de una tanda sólo se
 * invalida ese archivo. Google no penaliza tener más archivos —para eso está
 * el índice.
 */
export const SITEMAP_CHUNK_SIZE = 10_000;

/**
 * Tamaño de lote contra PostgREST.
 *
 * Supabase corta las respuestas en 1 000 filas por petición. No es negociable
 * desde el cliente, así que cada archivo de sitemap se arma con diez viajes
 * encadenados en vez de uno solo que devolvería mil filas en silencio.
 */
const FETCH_PAGE = 1_000;

export interface SitemapProduct {
  id: string;
  /** Último chequeo del scraper. Es el `lastmod` honesto de la ficha. */
  lastModified: string;
}

/**
 * Cuántos artículos entran al sitemap. De acá sale el número de archivos que
 * lista el índice.
 */
export async function countSitemapProducts(): Promise<number> {
  try {
    const { count, error } = await getSupabaseAdmin()
      .from(VIEW)
      .select('id', { count: 'exact', head: true })
      .not('price', 'is', null);

    if (error) return 0;
    return count ?? 0;
  } catch {
    // Sin base, el índice sale sin sitemaps de producto en vez de romperse:
    // un sitemap índice que responde 500 hace que Google deje de pedir todos
    // los demás, incluido el de las páginas fijas que sí funcionaría.
    return 0;
  }
}

/** Cuántos archivos de producto hacen falta para el catálogo actual. */
export function sitemapChunkCount(totalProducts: number): number {
  return Math.ceil(totalProducts / SITEMAP_CHUNK_SIZE);
}

/**
 * Una tanda de artículos para el archivo número `chunk` (base 1).
 *
 * El orden por `id` es obligatorio, no estético: sin un orden estable, dos
 * archivos consecutivos pueden repetirse artículos y saltarse otros, y el
 * sitemap dejaría fuera fichas que sí existen.
 */
export async function getSitemapProducts(chunk: number): Promise<SitemapProduct[]> {
  if (!Number.isInteger(chunk) || chunk < 1) return [];

  const start = (chunk - 1) * SITEMAP_CHUNK_SIZE;
  const results: SitemapProduct[] = [];

  try {
    const db = getSupabaseAdmin();

    for (let offset = 0; offset < SITEMAP_CHUNK_SIZE; offset += FETCH_PAGE) {
      const from = start + offset;
      const { data, error } = await db
        .from(VIEW)
        .select('id, last_seen_at')
        .not('price', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + FETCH_PAGE - 1);

      if (error) break;
      const rows = (data ?? []) as Array<{ id: string; last_seen_at: string | null }>;
      if (rows.length === 0) break;

      for (const row of rows) {
        results.push({
          id: String(row.id),
          lastModified: row.last_seen_at ?? new Date().toISOString(),
        });
      }

      // Menos filas que el lote significa fin del catálogo: no hay más páginas
      // que pedir y seguir sólo gasta viajes.
      if (rows.length < FETCH_PAGE) break;
    }
  } catch {
    return results;
  }

  return results;
}
