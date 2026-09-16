// Sube el contenido SEO de las categorías (src/db/seeds/category-content/*.json)
// a `find_your_prices.category_content` vía PostgREST, en español e inglés.
//
//   node scripts/seed-category-content.mjs            # sube todo
//   node scripts/seed-category-content.mjs --dry-run  # solo valida y cuenta
//   node scripts/seed-category-content.mjs --force    # pisa lo editado a mano
//
// Idempotente: hace upsert por (category_id, locale). Sin `--force` NO toca
// las filas que ya existen (lo que alguien escribió o retocó desde el panel se
// respeta); con `--force` las pisa todas. Las imágenes no se tocan nunca.
//
// Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY de .env.local.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedsDir = join(root, 'src', 'db', 'seeds', 'category-content');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');

for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_SECRET;
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local');

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Accept-Profile': 'find_your_prices',
  'Content-Profile': 'find_your_prices',
  'content-type': 'application/json',
};

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

// --- Carga y validación ------------------------------------------------------

const FIELDS = ['title', 'meta', 'intro', 'body', 'keywords'];
const entries = [];
for (const file of readdirSync(seedsDir).filter((name) => name.endsWith('.json')).sort()) {
  const parsed = JSON.parse(readFileSync(join(seedsDir, file), 'utf8'));
  for (const entry of parsed) {
    for (const locale of ['es', 'en']) {
      const content = entry[locale];
      if (!content) throw new Error(`${file}: ${entry.slug} no tiene "${locale}"`);
      for (const field of FIELDS) {
        if (content[field] === undefined) throw new Error(`${file}: ${entry.slug}.${locale} sin "${field}"`);
      }
      if (content.meta.length > 320) throw new Error(`${file}: ${entry.slug}.${locale}.meta pasa de 320 caracteres (${content.meta.length})`);
      if (!Array.isArray(content.keywords)) throw new Error(`${file}: ${entry.slug}.${locale}.keywords no es lista`);
    }
    entries.push({ ...entry, file });
  }
}

const seen = new Set();
for (const entry of entries) {
  if (seen.has(entry.slug)) throw new Error(`Slug repetido en los seeds: ${entry.slug}`);
  seen.add(entry.slug);
}

const categories = await rest('categories?select=id,slug&limit=1000');
const idBySlug = new Map(categories.map((row) => [row.slug, row.id]));
const missing = entries.filter((entry) => !idBySlug.has(entry.slug)).map((entry) => entry.slug);
if (missing.length > 0) console.warn(`Aviso: ${missing.length} slugs del seed no existen en la base y se saltan: ${missing.join(', ')}`);
const notCovered = categories.filter((row) => !seen.has(row.slug)).map((row) => row.slug);
if (notCovered.length > 0) console.warn(`Aviso: ${notCovered.length} categorías de la base sin seed: ${notCovered.join(', ')}`);

const rows = [];
for (const entry of entries) {
  const categoryId = idBySlug.get(entry.slug);
  if (!categoryId) continue;
  for (const locale of ['es', 'en']) {
    const c = entry[locale];
    rows.push({
      category_id: categoryId,
      locale,
      title: c.title,
      meta_description: c.meta,
      intro: c.intro,
      body: c.body,
      keywords: c.keywords,
    });
  }
}

console.log(`${entries.length} categorías en ${new Set(entries.map((e) => e.file)).size} archivos → ${rows.length} filas (es+en).`);
// Sin process.exit: en Windows corta el event loop de fetch con una aserción.
if (!dryRun) await write();

// --- Escritura ----------------------------------------------------------------

async function write() {
// Lo que ya existe se respeta salvo --force.
let toWrite = rows;
if (!force) {
  const existing = await rest('category_content?select=category_id,locale&limit=2000');
  const present = new Set(existing.map((row) => `${row.category_id}:${row.locale}`));
  toWrite = rows.filter((row) => !present.has(`${row.category_id}:${row.locale}`));
  if (toWrite.length < rows.length) {
    console.log(`Se respetan ${rows.length - toWrite.length} filas que ya existen (usar --force para pisarlas).`);
  }
}

for (let i = 0; i < toWrite.length; i += 100) {
  const chunk = toWrite.slice(i, i + 100);
  await rest('category_content?on_conflict=category_id,locale', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(chunk),
  });
  console.log(`  ${Math.min(i + 100, toWrite.length)}/${toWrite.length}`);
}
console.log('Listo. Las páginas se regeneran solas en la próxima hora (o antes con POST /api/revalidate).');
}
