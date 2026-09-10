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
 * Los artículos con precio 0 quedan fuera del sitemap.
 *
 * Un precio 0 no es una ganga: es un precio que la tienda no publicó y que el
 * scraper anotó como cero. Una ficha que sale en Google anunciando "L 0.00" es
 * un mal resultado —la persona hace clic, no encuentra el precio y se va—, y
 * Google lee esa vuelta atrás como una señal contra todo el dominio.
 *
 * Los AGOTADOS sí se listan, aunque el catálogo los esconda por defecto. Son
 * dos preguntas distintas: qué merece la primera pantalla de quien viene a
 * comparar, y qué merece existir en el índice. Un agotado vuelve a tener
 * existencias, su historial de precios sigue sirviendo, y el JSON-LD ya declara
 * `OutOfStock`, que es exactamente el caso que Google sabe manejar.
 */

/**
 * Artículos por archivo de sitemap.
 *
 * El límite del protocolo son 50 000 URLs o 50 MB por archivo, pero NO es el
 * límite que manda acá. El que manda es el de la plataforma: una función
 * serverless de Vercel no puede devolver más de 4,5 MB de cuerpo, y pasarse no
 * da un aviso —da un error, y Search Console lo reporta como "no se ha podido
 * obtener" sin decir por qué.
 *
 * Ya pasó: con 10 000 artículos por archivo cada uno pesaba 6,38 MB medidos, y
 * los cinco archivos de producto fallaron mientras el de páginas fijas (unos
 * pocos KB) se leía bien. Ese contraste es la firma del problema.
 *
 * La cuenta, con datos reales: cada `<url>` pesa ~670 bytes, porque lleva la
 * dirección cuatro veces —la propia más tres `hreflang`—. A 2 500 entradas el
 * archivo queda en ~1,6 MB, poco más de un tercio del techo, que es el margen
 * que hace falta para que un nombre de dominio más largo o un `hreflang` más
 * no vuelvan a romperlo.
 *
 * De paso arregla lo otro: 2 500 entradas son 3 viajes a PostgREST en vez de
 * 10, y el archivo se genera en menos de un segundo en lugar de rozar el
 * tiempo máximo de la función.
 *
 * Si alguna vez hay que subirlo, medí primero: `curl -s <url> | wc -c`.
 */
export const SITEMAP_CHUNK_SIZE = 2_500;

/**
 * Tamaño de lote contra PostgREST.
 *
 * Supabase corta las respuestas en 1 000 filas por petición. No es negociable
 * desde el cliente, así que cada archivo de sitemap se arma encadenando varios
 * viajes en vez de uno solo que devolvería mil filas en silencio. Con tandas de
 * 2 500 son tres.
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
      .gt('price', 0);

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
      /**
       * El último viaje se recorta al borde de la tanda.
       *
       * Sin esto se pide siempre un lote entero y la tanda se pasa de largo:
       * con tandas de 2 500 y lotes de 1 000 se traían 3 000, así que el
       * archivo 1 llevaba las filas 0–2999 y el archivo 2 empezaba en la 2 500.
       * Quinientas fichas repetidas en cada frontera, y ni el archivo ni el
       * protocolo se quejan —Google simplemente las rastrea dos veces.
       *
       * El fallo estaba escondido porque con tandas de 10 000 la división daba
       * exacta (10 lotes de 1 000) y nunca sobraba nada.
       */
      const size = Math.min(FETCH_PAGE, SITEMAP_CHUNK_SIZE - offset);
      const { data, error } = await db
        .from(VIEW)
        .select('id, last_seen_at')
        .gt('price', 0)
        .order('id', { ascending: true })
        .range(from, from + size - 1);

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
      if (rows.length < size) break;
    }
  } catch {
    return results;
  }

  return results;
}
