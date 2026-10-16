/**
 * Arma todos los sitemaps y los deja en R2 (carpeta `sitemaps/` del bucket).
 *
 * Las rutas del sitio (`/sitemap.xml`, `/sitemaps/...`) sólo copian estos
 * archivos; armarlos al vuelo en un Worker de Cloudflare agotaba la CPU y
 * Google recibía 404, 503 o archivos truncados. Ver
 * `src/server/services/sitemapStore.ts`.
 *
 *   npm run sitemaps:generate
 *
 * Corre en GitHub Actions (.github/workflows/sitemaps.yml) después del
 * scraping. Orden de subida: primero los archivos de producto, después
 * categorías y tiendas, y el índice al final, para que el índice nunca apunte a
 * un archivo que todavía no existe. Los archivos de producto que sobran (el
 * catálogo se achicó) se borran al terminar.
 *
 * Si algo falla, sale con código 1 sin subir el índice: lo que ya estaba en el
 * bucket se queda como estaba, que es mejor que un índice a medias.
 *
 * Variables:
 *   DATABASE_URL                                  (o, si Postgres no responde,
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY: el catálogo se lee por la
 *   API HTTPS de Supabase; ver server/db/restFallback.ts)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL,
 *   R2_BUCKET                                     (ver server/storage/r2.ts)
 *   NEXT_PUBLIC_SITE_URL   origen de las URLs (default: el de producción)
 *   SITEMAPS_DRY=true      arma todo y muestra tamaños, sin subir nada
 *   GITHUB_STEP_SUMMARY    si existe, ahí va el resumen
 */
import { appendFileSync } from 'node:fs';
import { siteConfig } from '@/config/site';
import {
  categoriesSitemapXml,
  productSitemapXml,
  sitemapIndexXml,
  storesSitemapXml,
} from '@/lib/seo/sitemapBuild';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { pgErrorMessage } from '@/server/db/pg';
import { enableRestFallback } from '@/server/db/restFlag';
import { deleteObject, listKeys, putObject } from '@/server/storage/r2';
import { iterateSitemapProductChunks } from '@/server/services/sitemap';
import { SITEMAP_BUCKET, SITEMAP_OBJECTS } from '@/server/services/sitemapStore';

const dry = process.env.SITEMAPS_DRY === 'true';
const encoder = new TextEncoder();

/**
 * Un sitemap con URLs de localhost o de una preview, subido al bucket que lee
 * producción, le diría a Google que el catálogo vive en otro lado. Se corta
 * antes de armar nada.
 */
function assertProductionOrigin(): void {
  const { hostname } = new URL(siteConfig.url);
  if (hostname === 'localhost' || hostname.endsWith('.vercel.app') || hostname.endsWith('.workers.dev')) {
    throw new Error(`NEXT_PUBLIC_SITE_URL apunta a ${siteConfig.url}: los sitemaps tienen que llevar el dominio público.`);
  }
}

let uploadedBytes = 0;

/** Sube un archivo, con tres intentos: un fallo de red no tira la corrida. */
async function upload(objectPath: string, xml: string): Promise<void> {
  const bytes = encoder.encode(xml);
  uploadedBytes += bytes.byteLength;
  if (dry) {
    console.log(`[dry] ${objectPath}: ${(bytes.byteLength / 1024).toFixed(0)} KB`);
    return;
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      // Cache-Control corto: el archivo se reemplaza en el mismo nombre y la
      // CDN no tiene que servir el anterior por horas.
      await putObject(`${SITEMAP_BUCKET}/${objectPath}`, bytes, {
        contentType: 'application/xml; charset=utf-8',
        cacheControl: 'public, max-age=300',
      });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
}

/** Borra `products/N.xml` con N mayor que la cantidad actual de archivos. */
async function removeStaleProductFiles(chunks: number): Promise<number> {
  if (dry) return 0;
  const prefix = `${SITEMAP_BUCKET}/products/`;
  const stale = (await listKeys(prefix)).filter((key) => {
    const match = /^(\d+)\.xml$/.exec(key.slice(prefix.length));
    return match !== null && Number(match[1]) > chunks;
  });

  for (const key of stale) await deleteObject(key);
  return stale.length;
}

/**
 * Desde una red que bloquea el puerto de Postgres (pasa en la oficina), el
 * catálogo se lee por la API HTTPS de Supabase. Se decide una vez, al empezar.
 */
async function chooseSource(): Promise<void> {
  const canFallBack = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  try {
    if (!process.env.DATABASE_URL) throw new Error('sin DATABASE_URL');
    await getDb().execute(sql`select 1`);
    console.log('Catálogo: Postgres.');
  } catch (error) {
    if (!canFallBack) throw error;
    console.log(`Postgres no responde (${pgErrorMessage(error)}); el catálogo se lee por la API HTTPS de Supabase.`);
    enableRestFallback();
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  assertProductionOrigin();
  await chooseSource();

  let chunks = 0;
  let products = 0;
  for await (const batch of iterateSitemapProductChunks()) {
    chunks += 1;
    products += batch.length;
    await upload(SITEMAP_OBJECTS.product(chunks), productSitemapXml(batch));
  }
  // Sin fichas no es un catálogo vacío: es una consulta que falló a medias.
  // Subir un índice sin productos sacaría el catálogo entero de Google.
  if (chunks === 0) throw new Error('La vista no devolvió fichas; no se sube nada.');

  await upload(SITEMAP_OBJECTS.categories, await categoriesSitemapXml());
  await upload(SITEMAP_OBJECTS.stores, await storesSitemapXml());
  await upload(SITEMAP_OBJECTS.index, sitemapIndexXml(chunks));
  const removed = await removeStaleProductFiles(chunks);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const line = `Sitemaps: ${products} fichas en ${chunks} archivos, ${(uploadedBytes / 1024 / 1024).toFixed(1)} MB, ${removed} archivos viejos borrados, ${seconds} s${dry ? ' (dry, sin subir)' : ''}.`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
