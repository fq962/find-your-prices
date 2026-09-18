// Genera las migraciones del árbol canónico y del mapeo de categorías de tienda
// a partir de tree.tsv y mapping-*.tsv. Uso:
//
//   node src/db/seeds/categories/build.mjs [--check]
//
// --check solo valida (cobertura del CSV, slugs desconocidos, nombres que no
// existen en el CSV) y no escribe nada. Sin --check escribe
// 0035_categories_tree.sql y 0036_map_store_categories.sql.
//
// La coincidencia nombre → slug se hace con la misma normalización que
// find_your_prices.normalize_text (minúsculas, sin acentos, solo [a-z0-9]),
// así que "Café"/"CAFE"/"Cafe " son la misma llave.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');
const csvPath = join(here, '..', '..', '..', '..', 'utils', 'categorias-distinct.csv');
const check = process.argv.includes('--check');

const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sqlStr = (s) => `'${s.replace(/'/g, "''")}'`;

const readTsv = (file) =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'));

// ---------------------------------------------------------------- árbol
const tree = readTsv(join(here, 'tree.tsv')).map(([slug, parent, name, description]) => ({
  slug,
  parent: parent || null,
  name,
  description: description || null,
}));
const slugs = new Set(tree.map((t) => t.slug));
const errors = [];
for (const t of tree) {
  if (t.parent && !slugs.has(t.parent)) errors.push(`tree: padre desconocido ${t.parent} en ${t.slug}`);
}

// --------------------------------------------------------------- mapeo
const mapping = new Map(); // normalized name -> { name, slug }
for (const file of readdirSync(here).filter((f) => /^mapping-.*\.tsv$/.test(f)).sort()) {
  for (const [name, slug] of readTsv(join(here, file))) {
    const key = normalize(name);
    if (!key) continue;
    if (slug !== '-' && !slugs.has(slug)) errors.push(`${file}: slug desconocido "${slug}" para "${name}"`);
    const prev = mapping.get(key);
    if (prev && prev.slug !== slug) errors.push(`${file}: "${name}" mapeado dos veces (${prev.slug} vs ${slug})`);
    mapping.set(key, { name, slug });
  }
}

// ------------------------------------------------------------- csv
const csvNames = new Map(); // normalized -> original
const csv = readFileSync(csvPath, 'utf8').split(/\r?\n/).slice(1);
for (const line of csv) {
  if (!line) continue;
  const m = line.match(/^"((?:[^"]|"")*)"|^([^,]*)/);
  const raw = (m[1] ?? m[2] ?? '').replace(/""/g, '"').trim();
  const key = normalize(raw);
  if (key && !csvNames.has(key)) csvNames.set(key, raw);
}

const missing = [...csvNames].filter(([k]) => !mapping.has(k)).map(([, v]) => v);
const extra = [...mapping].filter(([k]) => !csvNames.has(k)).map(([, v]) => v.name);
const skipped = [...mapping.values()].filter((m) => m.slug === '-').map((m) => m.name);
const mapped = [...mapping.values()].filter((m) => m.slug !== '-');

console.log(`árbol: ${tree.length} nodos (${tree.filter((t) => !t.parent).length} raíces)`);
console.log(`csv: ${csvNames.size} nombres distintos (normalizados)`);
console.log(`mapeados: ${mapped.length} · sin mapear a propósito: ${skipped.length}`);
if (missing.length) console.log(`\nSIN COBERTURA (${missing.length}):\n  ${missing.join('\n  ')}`);
if (extra.length) console.log(`\nEN MAPEO PERO NO EN CSV (${extra.length}):\n  ${extra.join('\n  ')}`);
if (errors.length) console.log(`\nERRORES:\n  ${errors.join('\n  ')}`);
if (check || errors.length || missing.length) process.exit(errors.length || missing.length ? 1 : 0);

// ------------------------------------------------------ 0035: árbol
const byParent = new Map();
for (const t of tree) {
  const list = byParent.get(t.parent) ?? [];
  list.push(t);
  byParent.set(t.parent, list);
}
const rows = [];
for (const [i, root] of (byParent.get(null) ?? []).entries()) {
  rows.push([root.slug, null, root.name, root.description, root.slug, 0, i]);
  for (const [j, child] of (byParent.get(root.slug) ?? []).entries()) {
    rows.push([child.slug, root.slug, child.name, child.description, `${root.slug}/${child.slug}`, 1, j]);
  }
}
const nullable = (v) => (v == null ? 'null' : sqlStr(v));
const treeSql = `-- =============================================================================
-- 0035_categories_tree.sql
-- Árbol canónico de categorías: ${rows.filter((r) => r[5] === 0).length} raíces y ${rows.filter((r) => r[5] === 1).length} hijas.
--
-- Por qué. El árbol anterior se perdió al reconstruir las relaciones, y las
-- tiendas publican más de 3.000 nombres de categoría distintos que en el
-- fondo son unas ${rows.length} cosas. Este árbol cubre todos los rubros que hoy se
-- rastrean (supermercado, hogar, tecnología, ferretería, farmacia, moda,
-- juguetería, papelería...) con dos niveles: raíz y hija, que es lo que
-- admite el filtro del catálogo (0024). Es el que ve el usuario final al
-- navegar y filtrar.
--
-- Los slugs del árbol anterior que ya tenían contenido SEO en
-- src/db/seeds/category-content se conservan tal cual (136 de 144); los 71
-- nodos nuevos tienen su contenido en los archivos 18 a 24 de esa carpeta.
-- Después de correr esto: \`node scripts/seed-category-content.mjs\`.
--
-- Origen. Generado por src/db/seeds/categories/build.mjs desde tree.tsv.
-- Para cambiar un nombre o agregar un nodo: editar el TSV y regenerar, no
-- este archivo.
--
-- Idempotente: inserta por slug; si el slug ya existe actualiza nombre,
-- descripción, padre, path, nivel y posición, y no toca imagen ni destacado.
-- =============================================================================

with nodes (slug, parent_slug, name, description, path, level, position) as (
  values
${rows.map((r) => `    (${sqlStr(r[0])}, ${nullable(r[1])}, ${sqlStr(r[2])}, ${nullable(r[3])}, ${sqlStr(r[4])}, ${r[5]}, ${r[6]})`).join(',\n')}
),
roots as (
  insert into find_your_prices.categories (slug, parent_id, name, description, path, level, position)
  select slug, null, name, description, path, level, position
  from nodes where parent_slug is null
  on conflict (slug) do update set
    parent_id   = null,
    name        = excluded.name,
    description = excluded.description,
    path        = excluded.path,
    level       = excluded.level,
    position    = excluded.position,
    is_active   = true
  returning id, slug
)
insert into find_your_prices.categories (slug, parent_id, name, description, path, level, position)
select n.slug, r.id, n.name, n.description, n.path, n.level, n.position
from nodes n
join roots r on r.slug = n.parent_slug
on conflict (slug) do update set
  parent_id   = excluded.parent_id,
  name        = excluded.name,
  description = excluded.description,
  path        = excluded.path,
  level       = excluded.level,
  position    = excluded.position,
  is_active   = true;

-- Reporte: cuántos nodos quedaron por nivel.
select level, count(*) as nodos
from find_your_prices.categories
group by level order by level;
`;

// ------------------------------------------------ 0036: mapeo tiendas
const mapSql = `-- =============================================================================
-- 0036_map_store_categories.sql
-- Mapea las categorías crudas de cada tienda (store_categories) al árbol
-- canónico (categories) por nombre normalizado.
--
-- Por qué. Al perder el árbol, todas las store_categories quedaron con
-- category_id null (la FK es on delete set null). Este archivo repone el
-- mapeo para ${mapped.length} nombres distintos, que cubren las ${csvNames.size} categorías
-- distintas que las tiendas publican hoy. Los ${skipped.length} nombres restantes son
-- promociones, marcas o cajones sin contenido ("Ofertas", "Samsung",
-- "Otros") y se dejan sin mapear a propósito: caen en "Sin categorizar aún".
--
-- Cómo. La coincidencia usa find_your_prices.normalize_text sobre el nombre,
-- así que no importa mayúsculas, acentos ni signos: "CAFÉ" = "Cafe". Una
-- misma fila de tienda se mapea en todas las tiendas donde aparezca ese
-- nombre. Solo toca filas sin mapeo (category_id is null): lo que ya se
-- corrigió a mano desde el panel se respeta.
--
-- Origen. Generado por src/db/seeds/categories/build.mjs desde mapping-*.tsv.
-- Para corregir un mapeo: editar el TSV y regenerar, o cambiarlo desde el
-- panel /admin/categorias (que gana, porque este script no pisa lo mapeado).
--
-- Idempotente: se puede volver a ejecutar; la segunda vez no hay filas nulas
-- que coincidan y no cambia nada.
-- =============================================================================

with pairs (name, slug) as (
  values
${mapped.map((m) => `    (${sqlStr(m.name)}, ${sqlStr(m.slug)})`).join(',\n')}
),
resolved as (
  select find_your_prices.normalize_text(p.name) as key, c.id as category_id
  from pairs p
  join find_your_prices.categories c on c.slug = p.slug
)
update find_your_prices.store_categories sc
set category_id = r.category_id
from resolved r
where sc.category_id is null
  and find_your_prices.normalize_text(sc.name) = r.key;

-- Reporte: qué quedó sin mapear, por tienda, para revisarlo en el panel.
select s.name as tienda, count(*) as sin_mapear
from find_your_prices.store_categories sc
join find_your_prices.stores s on s.id = sc.store_id
where sc.category_id is null and sc.is_active
group by s.name order by sin_mapear desc;
`;

writeFileSync(join(migrationsDir, '0035_categories_tree.sql'), treeSql);
writeFileSync(join(migrationsDir, '0036_map_store_categories.sql'), mapSql);
console.log('\nescrito: 0035_categories_tree.sql, 0036_map_store_categories.sql');
