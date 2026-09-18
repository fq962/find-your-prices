// Vuelve a colgar las imágenes del bucket `category-images` en `categories.image_url`.
//
// Los objetos del bucket se llaman `<slug>-<hash>.<ext>` (ver
// uploadCategoryImage en src/server/services/categoryContent.ts). Si el árbol
// se pierde y se vuelve a crear con los mismos slugs, este script recupera la
// relación sin subir nada de nuevo.
//
//   node scripts/relink-category-images.mjs            # aplica
//   node scripts/relink-category-images.mjs --dry-run  # solo muestra
//   node scripts/relink-category-images.mjs --force    # pisa image_url ya puesto
//
// Sin --force solo toca categorías con image_url null. Si un slug tiene varios
// objetos, gana el más reciente. Los slugs viejos que cambiaron de nombre se
// resuelven con ALIASES; lo que no coincide con nada se lista al final.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');

const BUCKET = 'category-images';

// Slug viejo (árbol anterior a 0035) → slug nuevo.
const ALIASES = {
  'electronica-electrodomesticos': 'tecnologia',
  'televisores-audio': 'tv-video',
  'computacion-accesorios': 'computadoras',
  'linea-blanca': 'electrodomesticos',
  'ferreteria-y-automotriz': 'ferreteria',
  'herramientas-manuales-electricas': 'herramientas-manuales',
  'electricidad-plomeria': 'electricidad',
  gaming: 'videojuegos',
};

for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_SECRET;
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local');

const auth = { apikey: key, Authorization: `Bearer ${key}` };

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...auth,
      'Accept-Profile': 'find_your_prices',
      'Content-Profile': 'find_your_prices',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// --- 1. Objetos del bucket ---------------------------------------------------
const objects = [];
for (let offset = 0; ; offset += 1000) {
  const response = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, offset, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  if (!response.ok) throw new Error(`list ${BUCKET} → ${response.status}: ${await response.text()}`);
  const page = await response.json();
  objects.push(...page.filter((o) => o.id));
  if (page.length < 1000) break;
}

// `<slug>-<hash>.<ext>` → slug. El hash es base36 de Date.now(): 8 caracteres
// alfanuméricos sin guion, así que basta cortar en el último guion.
const bySlug = new Map();
const unparsed = [];
for (const object of objects) {
  const match = object.name.match(/^(.+)-([a-z0-9]+)\.[a-z0-9]+$/i);
  if (!match) {
    unparsed.push(object.name);
    continue;
  }
  const slug = match[1];
  // Ya vienen ordenados por created_at desc: el primero de cada slug es el más nuevo.
  if (!bySlug.has(slug)) bySlug.set(slug, object.name);
}

// --- 2. Categorías -----------------------------------------------------------
const categories = await rest('categories?select=id,slug,image_url&limit=1000');
const idBySlug = new Map(categories.map((row) => [row.slug, row]));

const updates = [];
const unmatched = [];
for (const [fileSlug, name] of bySlug) {
  const slug = idBySlug.has(fileSlug) ? fileSlug : ALIASES[fileSlug];
  const category = slug ? idBySlug.get(slug) : null;
  if (!category) {
    unmatched.push(name);
    continue;
  }
  // Si existe un objeto con el slug nuevo, el alias del viejo no lo pisa.
  if (slug !== fileSlug && bySlug.has(slug)) continue;
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${name}`;
  if (category.image_url === publicUrl) continue;
  if (category.image_url && !force) continue;
  updates.push({ id: category.id, slug, name, publicUrl, via: slug === fileSlug ? '' : ` (alias de ${fileSlug})` });
}

console.log(`bucket: ${objects.length} objetos, ${bySlug.size} slugs distintos`);
console.log(`categorías: ${categories.length}, con imagen: ${categories.filter((c) => c.image_url).length}`);
console.log(`a enlazar: ${updates.length}${dryRun ? ' (dry-run, no se escribe nada)' : ''}`);
for (const u of updates) console.log(`  ${u.slug} ← ${u.name}${u.via}`);

if (!dryRun) {
  for (const u of updates) {
    await rest(`categories?id=eq.${u.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ image_url: u.publicUrl }),
    });
  }
  if (updates.length) console.log(`\nlistas: ${updates.length} categorías con image_url repuesto`);
}

if (unmatched.length) console.log(`\nsin categoría (${unmatched.length}), revisar a mano:\n  ${unmatched.join('\n  ')}`);
if (unparsed.length) console.log(`\nnombre sin patrón slug-hash (${unparsed.length}):\n  ${unparsed.join('\n  ')}`);
const stillEmpty = categories.filter((c) => !c.image_url && !updates.some((u) => u.id === c.id)).map((c) => c.slug);
if (stillEmpty.length) console.log(`\nquedan sin imagen (${stillEmpty.length}):\n  ${stillEmpty.join(', ')}`);
