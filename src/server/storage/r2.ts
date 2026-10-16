import { AwsClient } from 'aws4fetch';

/**
 * Archivos en Cloudflare R2 (imágenes del panel y sitemaps), por la API
 * compatible con S3.
 *
 * Por qué la API S3 y no el binding de R2 del Worker: la misma función sirve
 * en el sitio (Vercel o Workers), en los scripts de Node y en GitHub Actions,
 * sin depender de dónde corra. `aws4fetch` firma con Web Crypto y `fetch`, que
 * existen en los tres lados.
 *
 * Un solo bucket con una carpeta por cada bucket viejo de Supabase:
 *
 *   category-images/<archivo>   store-images/<archivo>
 *   affiliate-images/<archivo>  sitemaps/<archivo>
 *
 * Así la URL pública es la de Supabase con otro prefijo, y migrar es cambiar
 * `<supabase>/storage/v1/object/public/` por `R2_PUBLIC_URL/`.
 *
 * Sin `server-only` a propósito: lo usan también los scripts. Las llaves solo
 * se leen de `process.env`, nunca viajan al navegador.
 *
 * Variables:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   (token de R2 con
 *                                         permiso de lectura y escritura)
 *   R2_BUCKET        nombre del bucket (default: find-your-prices)
 *   R2_PUBLIC_URL    origen público del bucket: el dominio propio
 *                    (https://assets.findyourprices.com) o el r2.dev
 */

export type StorageFolder = 'category-images' | 'store-images' | 'affiliate-images' | 'sitemaps';

interface R2Config {
  endpoint: string;
  publicUrl: string;
  client: AwsClient;
}

let cached: R2Config | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name} (R2). Ver .env.example.`);
  return value;
}

function config(): R2Config {
  if (cached) return cached;
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = process.env.R2_BUCKET?.trim() || 'find-your-prices';
  cached = {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
    publicUrl: publicBase(),
    client: new AwsClient({
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      service: 's3',
      region: 'auto',
      retries: 3,
    }),
  };
  return cached;
}

function publicBase(): string {
  return requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
}

/** Cada segmento de la llave codificado, las barras no. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** True si están las variables para escribir en R2. */
export function hasR2Config(): boolean {
  return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'].every((name) =>
    Boolean(process.env[name]?.trim()),
  );
}

/** URL pública de una llave. Solo necesita `R2_PUBLIC_URL`. */
export function publicUrl(key: string): string {
  return `${publicBase()}/${encodeKey(key)}`;
}

/**
 * La llave de una URL pública de este bucket, o `null` si la URL es de otro
 * lado (una imagen externa pegada a mano, o una URL vieja de Supabase).
 */
export function keyFromPublicUrl(url: string | null | undefined): string | null {
  if (!url || !process.env.R2_PUBLIC_URL?.trim()) return null;
  const base = `${publicBase()}/`;
  if (!url.startsWith(base)) return null;
  return decodeURIComponent(url.slice(base.length).split('?')[0]);
}

async function send(method: string, key: string, init: RequestInit = {}): Promise<Response> {
  const { endpoint, client } = config();
  return client.fetch(`${endpoint}/${encodeKey(key)}`, { ...init, method });
}

async function failure(response: Response, what: string): Promise<Error> {
  const body = await response.text().catch(() => '');
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  return new Error(`${what}: R2 respondió ${response.status}${code ? ` (${code})` : ''}`);
}

export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array | string,
  options: { contentType: string; cacheControl?: string },
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': options.contentType };
  if (options.cacheControl) headers['Cache-Control'] = options.cacheControl;
  const response = await send('PUT', key, { body: body as BodyInit, headers });
  if (!response.ok) throw await failure(response, `No se pudo subir ${key}`);
}

/** Borra un objeto. Borrar uno que no existe no es error (S3 responde 204). */
export async function deleteObject(key: string): Promise<void> {
  const response = await send('DELETE', key);
  if (!response.ok && response.status !== 404) throw await failure(response, `No se pudo borrar ${key}`);
}

/** True si la llave existe en el bucket. */
export async function objectExists(key: string): Promise<boolean> {
  const response = await send('HEAD', key);
  if (response.status === 404) return false;
  if (!response.ok) throw await failure(response, `No se pudo consultar ${key}`);
  return true;
}

/** Todas las llaves bajo un prefijo (`sitemaps/products/`), paginando. */
export async function listKeys(prefix: string): Promise<string[]> {
  const { endpoint, client } = config();
  const keys: string[] = [];
  let token: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const url = new URL(endpoint);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (token) url.searchParams.set('continuation-token', token);

    const response = await client.fetch(url.toString());
    if (!response.ok) throw await failure(response, `No se pudo listar ${prefix}`);
    const xml = await response.text();

    for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(unescapeXml(match[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? unescapeXml(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '')
      : null;
    if (!token) break;
  }

  return keys;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Borra el objeto de una URL pública si es de este bucket. Nunca lanza. */
export async function deleteByPublicUrl(url: string | null | undefined): Promise<void> {
  const key = keyFromPublicUrl(url);
  if (!key) return;
  try {
    await deleteObject(key);
  } catch (error) {
    console.warn(`[r2] no se pudo borrar ${key}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Sube una imagen del panel a su carpeta y devuelve la URL pública.
 *
 * El nombre es `<slug>-<marca de tiempo>.<ext>`: reemplazar la foto cambia la
 * URL, y ninguna caché (CDN, navegador, Open Graph) sigue mostrando la vieja.
 */
export async function uploadImage(folder: Exclude<StorageFolder, 'sitemaps'>, slug: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede pasar de 5 MB.');

  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `${folder}/${slug}-${Date.now().toString(36)}.${extension}`;

  // Los bytes y no el `File`: así el Content-Type es exactamente el del archivo.
  const bytes = await file.arrayBuffer();
  try {
    await putObject(key, bytes, { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' });
  } catch (error) {
    throw new Error(`No se pudo subir la imagen: ${error instanceof Error ? error.message : String(error)}`);
  }
  return publicUrl(key);
}
