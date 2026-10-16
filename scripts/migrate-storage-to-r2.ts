/**
 * Mueve los archivos de Supabase Storage a R2 y cambia las URLs en la base.
 * Fase 3 de docs/migracion-drizzle.md.
 *
 *   npm run storage:migrate              # ensayo: lista y cuenta, no toca nada
 *   npm run storage:migrate -- --apply   # copia y reescribe las URLs
 *
 * Qué hace, en orden:
 *   1. Recorre los buckets de Supabase (category-images, store-images,
 *      affiliate-images, sitemaps) y copia cada archivo a R2 en
 *      `<bucket>/<ruta>`, con su Content-Type y Cache-Control. Lo que ya está
 *      en R2 se salta, así que se puede correr las veces que haga falta.
 *   2. Junta las URLs de Supabase que guarda la base (logos de tiendas y
 *      aliados, imágenes de categorías y de ofertas) y comprueba que CADA una
 *      exista en R2.
 *   3. Comprueba que el bucket responda en público (R2_PUBLIC_URL).
 *   4. Solo si todo lo anterior salió bien, cambia el prefijo de esas URLs,
 *      fila por fila. Si se corta a la mitad, volver a correrlo termina el
 *      trabajo: lo que ya apunta a R2 no vuelve a aparecer.
 *
 * Todo va por HTTPS (API de Supabase y API S3 de R2), sin conexión directa a
 * Postgres: así corre también desde una red que bloquea el puerto de la base.
 *
 * Supabase no se toca: los archivos siguen allá hasta que se borre el
 * proyecto, así que si algo sale mal basta con volver al commit anterior.
 *
 * Opciones:
 *   --apply        copia y reescribe (sin esto es un ensayo)
 *   --force        vuelve a subir aunque el archivo ya exista en R2
 *   --skip-files   no copia archivos; solo verifica y reescribe la base
 *   --buckets=a,b  solo esos buckets
 *
 * Variables (en .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY   Storage y las URLs de la base
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL,
 *   R2_BUCKET (default find-your-prices)
 */
import { getSupabaseAdmin } from '@/server/db/supabase';
import { objectExists, publicUrl, putObject } from '@/server/storage/r2';

const ALL_BUCKETS = ['category-images', 'store-images', 'affiliate-images', 'sitemaps'] as const;
const CONCURRENCY = 6;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const force = args.has('--force');
const skipFiles = args.has('--skip-files');
const bucketArg = process.argv.find((arg) => arg.startsWith('--buckets='));
const buckets = bucketArg
  ? bucketArg.slice('--buckets='.length).split(',').filter(Boolean)
  : [...ALL_BUCKETS];

/** Columnas que guardan URLs de Storage. */
const URL_COLUMNS = [
  { table: 'categories', column: 'image_url' },
  { table: 'stores', column: 'logo_url' },
  { table: 'affiliate_partners', column: 'logo_url' },
  { table: 'affiliate_offers', column: 'image_url' },
] as const;

interface ReferencedUrl {
  table: string;
  column: string;
  id: string;
  url: string;
  label: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env.local`);
  return value;
}

const supabasePrefix = `${requireEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '')}/storage/v1/object/public/`;
const r2Prefix = `${requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '')}/`;
for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SUPABASE_SECRET_KEY']) requireEnv(name);

interface StoredFile {
  bucket: string;
  path: string;
  size: number;
  contentType?: string;
  cacheControl?: string;
}

// -----------------------------------------------------------------------------
// 1. Archivos
// -----------------------------------------------------------------------------

/** Todos los archivos de un bucket, entrando en las carpetas. */
async function listBucket(bucket: string, folder = ''): Promise<StoredFile[]> {
  const storage = getSupabaseAdmin().storage.from(bucket);
  const files: StoredFile[] = [];
  const PAGE = 1000;

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`No se pudo listar ${bucket}/${folder}: ${error.message}`);
    const entries = data ?? [];

    for (const entry of entries) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      // Las carpetas vienen sin id ni metadata.
      if (entry.id === null) {
        files.push(...(await listBucket(bucket, path)));
        continue;
      }
      if (entry.name === '.emptyFolderPlaceholder') continue;
      const metadata = (entry.metadata ?? {}) as { size?: number; mimetype?: string; cacheControl?: string };
      files.push({
        bucket,
        path,
        size: Number(metadata.size ?? 0),
        contentType: metadata.mimetype,
        cacheControl: metadata.cacheControl,
      });
    }

    if (entries.length < PAGE) break;
  }

  return files;
}

/** Cache-Control para R2: el de Supabase viene como "max-age=3600". */
function cacheControlFor(file: StoredFile): string {
  if (file.bucket === 'sitemaps') return 'public, max-age=300';
  const maxAge = /max-age=(\d+)/.exec(file.cacheControl ?? '')?.[1] ?? '31536000';
  return `public, max-age=${maxAge}${Number(maxAge) >= 31536000 ? ', immutable' : ''}`;
}

async function copyFile(file: StoredFile): Promise<'copied' | 'skipped'> {
  const key = `${file.bucket}/${file.path}`;
  if (!force && (await objectExists(key))) return 'skipped';

  const { data, error } = await getSupabaseAdmin().storage.from(file.bucket).download(file.path);
  if (error || !data) throw new Error(`No se pudo bajar ${key} de Supabase: ${error?.message ?? 'sin datos'}`);

  const contentType = file.contentType || data.type || 'application/octet-stream';
  await putObject(key, new Uint8Array(await data.arrayBuffer()), {
    contentType,
    cacheControl: cacheControlFor(file),
  });
  return 'copied';
}

/** Corre `work` sobre la lista con N a la vez. */
async function pool<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item);
    }
  });
  await Promise.all(workers);
}

async function copyFiles(): Promise<{ failed: number }> {
  let failed = 0;

  for (const bucket of buckets) {
    const files = await listBucket(bucket);
    const megabytes = files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024;
    console.log(`\n${bucket}: ${files.length} archivos, ${megabytes.toFixed(1)} MB`);
    if (!apply || files.length === 0) continue;

    let copied = 0;
    let skipped = 0;
    await pool(files, async (file) => {
      try {
        const result = await copyFile(file);
        if (result === 'copied') copied += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        console.error(`  ✗ ${file.bucket}/${file.path}: ${error instanceof Error ? error.message : error}`);
      }
      const done = copied + skipped;
      if (done % 50 === 0) console.log(`  ${done}/${files.length}`);
    });
    console.log(`  copiados ${copied}, ya estaban ${skipped}, fallaron ${files.length - copied - skipped}`);
  }

  return { failed };
}

// -----------------------------------------------------------------------------
// 2–4. URLs en la base
// -----------------------------------------------------------------------------

async function referencedUrls(): Promise<ReferencedUrl[]> {
  const db = getSupabaseAdmin();
  const found: ReferencedUrl[] = [];
  for (const { table, column } of URL_COLUMNS) {
    const { data, error } = await db
      .from(table)
      .select(`id, ${column}`)
      .like(column, `${supabasePrefix}%`)
      .limit(5000);
    if (error) throw new Error(`No se pudo leer ${table}.${column}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
      const url = row[column];
      if (url) found.push({ table, column, id: String(row.id), url, label: `${table}.${column}` });
    }
  }
  return found;
}

/** La llave de R2 de una URL de Supabase: lo que va después de `/public/`. */
function keyOf(url: string): string {
  return decodeURIComponent(url.slice(supabasePrefix.length).split('?')[0]);
}

async function verifyReferences(urls: ReferencedUrl[]): Promise<string[]> {
  const missing: string[] = [];
  await pool(urls, async ({ label, url }) => {
    if (!(await objectExists(keyOf(url)))) missing.push(`${label}: ${url}`);
  });
  return missing;
}

/** El bucket tiene que servir en público, o todas las imágenes del sitio se rompen. */
async function verifyPublicAccess(sampleKey: string): Promise<void> {
  const url = publicUrl(sampleKey);
  const response = await fetch(url, { method: 'GET' });
  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(
      `${url} respondió ${response.status}. ¿El bucket tiene acceso público (dominio propio o r2.dev) y R2_PUBLIC_URL es ese origen?`,
    );
  }
}

/**
 * Cambia cada URL por la de R2. La condición sobre el valor viejo hace que una
 * fila editada desde el panel mientras tanto no se pise.
 */
async function rewriteUrls(urls: ReferencedUrl[]): Promise<{ changed: number; failed: number }> {
  const db = getSupabaseAdmin();
  let changed = 0;
  let failed = 0;
  await pool(urls, async ({ table, column, id, url, label }) => {
    const { error } = await db
      .from(table)
      .update({ [column]: r2Prefix + url.slice(supabasePrefix.length) })
      .eq('id', id)
      .eq(column, url);
    if (error) {
      failed += 1;
      console.error(`  ✗ ${label} ${id}: ${error.message}`);
    } else {
      changed += 1;
    }
  });
  return { changed, failed };
}

// -----------------------------------------------------------------------------

async function main(): Promise<number> {
  console.log(apply ? 'Modo APLICAR: copia a R2 y cambia URLs.' : 'Ensayo: no se copia ni se cambia nada (usar --apply).');
  console.log(`Supabase: ${supabasePrefix}\nR2:       ${r2Prefix}`);

  if (!skipFiles) {
    const { failed } = await copyFiles();
    if (failed > 0) {
      console.error(`\n${failed} archivos no se pudieron copiar. No se toca la base; volver a correr (lo copiado se salta).`);
      return 1;
    }
  }

  const urls = await referencedUrls();
  console.log(`\nLa base tiene ${urls.length} URLs de Supabase Storage.`);
  if (urls.length === 0) {
    console.log('Nada que reescribir.');
    return 0;
  }
  if (!apply) {
    for (const { label, url } of urls.slice(0, 5)) console.log(`  ${label}: ${url}\n    → ${r2Prefix}${url.slice(supabasePrefix.length)}`);
    if (urls.length > 5) console.log(`  … y ${urls.length - 5} más`);
    return 0;
  }

  const missing = await verifyReferences(urls);
  if (missing.length > 0) {
    console.error(`\nFaltan en R2 ${missing.length} archivos que la base usa; no se cambia ninguna URL:`);
    for (const line of missing.slice(0, 20)) console.error(`  ${line}`);
    return 1;
  }
  console.log('Todos los archivos que usa la base están en R2.');

  await verifyPublicAccess(keyOf(urls[0].url));
  console.log('El bucket responde en público.');

  const { changed, failed } = await rewriteUrls(urls);
  if (failed > 0) {
    console.error(`\n${changed} URLs cambiadas y ${failed} con error. Volver a correr con --apply --skip-files para terminar.`);
    return 1;
  }
  console.log(`\nListo: ${changed} URLs apuntan ahora a R2.`);
  console.log('Siguiente: revalidar las páginas (o esperar la hora de ISR) y correr `npm run sitemaps:generate`.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
