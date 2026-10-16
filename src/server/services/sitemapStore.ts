import 'server-only';
import { xmlResponse } from '@/lib/seo/sitemapXml';
import { publicUrl } from '@/server/storage/r2';

/**
 * Sitemaps ya hechos, guardados en R2 (carpeta `sitemaps/` del bucket).
 *
 * Armar el sitemap al vuelo era caro justo donde no puede serlo: 58 archivos
 * de 2 500 fichas, cada uno con tres viajes a la base, en un Worker de
 * Cloudflare con un techo de CPU de milisegundos. Medido en producción: un
 * archivo de cada siete respondía 404, 503 (error 1102, CPU agotada) o salía
 * truncado, y Google veía un catálogo distinto en cada lectura.
 *
 * El catálogo sólo cambia cuando corre el scraper, así que no hace falta
 * recalcularlo en cada visita del rastreador. `scripts/generate-sitemaps.ts`
 * (en GitHub Actions) arma todos los archivos y los sube acá; las rutas sólo
 * los copian, sin tocar la base y sin armar XML. Las URLs públicas no cambian:
 * Google sigue pidiendo `/sitemaps/products/3.xml` en el dominio propio, que es
 * donde el protocolo exige que esté.
 */

/** Carpeta del bucket de R2 (antes, el bucket de Supabase del mismo nombre). */
export const SITEMAP_BUCKET = 'sitemaps';

/** Nombre del objeto en el bucket para cada archivo. */
export const SITEMAP_OBJECTS = {
  index: 'sitemap.xml',
  categories: 'categories.xml',
  stores: 'stores.xml',
  product: (chunk: number) => `products/${chunk}.xml`,
} as const;

/**
 * El archivo guardado, como respuesta lista para devolver; `null` si no está o
 * Storage no responde.
 *
 * El cuerpo se pasa tal cual, como stream: el Worker no lee ni copia el XML,
 * sólo lo deja correr. Es lo que mantiene la CPU en casi nada aunque el
 * archivo pese 1,6 MB.
 */
async function readStored(objectPath: string): Promise<Response | null> {
  if (!process.env.R2_PUBLIC_URL) return null;

  try {
    const upstream = await fetch(publicUrl(`${SITEMAP_BUCKET}/${objectPath}`), {
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) return null;

    const response = xmlResponse(upstream.body);
    response.headers.set('X-Sitemap-Source', 'storage');
    return response;
  } catch {
    return null;
  }
}

/**
 * Sirve un sitemap: el guardado si existe; si no, el que arma `live`.
 *
 * `live` devuelve `null` cuando el archivo no existe (404) y lanza cuando la
 * base falla. Ese fallo sale como 503 con `Retry-After`, nunca como un archivo
 * vacío o a medias: un 503 le dice a Google "volvé más tarde" y conserva lo que
 * ya indexó; un 200 con menos URLs le dice que las que faltan se retiraron.
 */
export async function serveSitemap(
  objectPath: string,
  live: () => Promise<string | null>,
): Promise<Response> {
  const stored = await readStored(objectPath);
  if (stored) return stored;

  try {
    const xml = await live();
    if (xml === null) return new Response('Not found', { status: 404 });

    const response = xmlResponse(xml);
    response.headers.set('X-Sitemap-Source', 'live');
    return response;
  } catch (error) {
    console.error(`[sitemap] no se pudo armar ${objectPath}:`, error);
    return new Response('Sitemap temporalmente no disponible', {
      status: 503,
      headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' },
    });
  }
}
