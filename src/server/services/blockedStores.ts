import 'server-only';

/**
 * PARCHE: tiendas excluidas del catálogo público.
 *
 * "Útiles de Honduras" —y cualquier variante de mayúsculas o acentos con que
 * el scraper la haya dado de alta: "UTILES DE HONDURAS", "Utiles de
 * Honduras"— no se muestra: ni sus artículos en el listado, la búsqueda, los
 * relacionados o la ficha, ni su nombre en el selector de tiendas.
 *
 * Se filtra por NOMBRE y no por id porque la fila de `stores` puede no existir
 * aún en este entorno (no hay migración de seed para ella) y porque el uuid
 * cambia entre bases; el nombre es lo único estable entre entornos.
 *
 * Vive en un módulo aparte, y no repetido en cada consulta, por la misma razón
 * que `applyAvailabilityFloor`: si el listado, el conteo y las facetas no
 * filtran igual, el selector ofrece "Útiles de Honduras (120)" y la búsqueda
 * devuelve cero.
 *
 * ESTO ES UN PARCHE. Si la exclusión se vuelve permanente, lo correcto es
 * apagar la tienda en la base (`stores.is_active = false`), que ya saca sus
 * artículos de `v_store_products_current` sin código que mantener.
 */

/**
 * Lo que se bloquea, ya normalizado: minúsculas, sin acentos. Comparar así
 * hace que "Útiles", "UTILES" y "ÚTILES DE HONDURAS" sean el mismo valor.
 */
const BLOCKED_NORMALIZED_NAMES = ['utiles de honduras'] as const;

/**
 * El mismo criterio para Postgres.
 *
 * `ilike` ignora mayúsculas pero NO acentos, así que el patrón esquiva la
 * primera letra: `%tiles de honduras%` casa con "Útiles de Honduras" y con
 * "UTILES DE HONDURAS" sin necesitar una variante por cada forma de escribirlo.
 */
const BLOCKED_NAME_PATTERNS = ['%tiles de honduras%'] as const;

/** Minúsculas y sin acentos, para comparar nombres venidos de cualquier lado. */
function normalizeStoreName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Si un nombre de tienda está bloqueado. Para filtrar filas ya traídas. */
export function isBlockedStoreName(value: unknown): boolean {
  const normalized = normalizeStoreName(value);
  if (normalized === '') return false;
  return BLOCKED_NORMALIZED_NAMES.some((blocked) => normalized.includes(blocked));
}

/**
 * Saca las tiendas bloqueadas de una consulta a `v_store_products_current`.
 *
 * Se aplica en la consulta y no al mapear las filas porque el `count` exacto y
 * la paginación los calcula Postgres: filtrar después dejaría páginas cortas y
 * un total inflado.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function excludeBlockedStores(request: any): any {
  return BLOCKED_NAME_PATTERNS.reduce(
    (current, pattern) => current.not('store_name', 'ilike', pattern),
    request,
  );
}
