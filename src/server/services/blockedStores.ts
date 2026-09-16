import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';

/**
 * PARCHE: tiendas excluidas del catálogo público.
 *
 * "Útiles de Honduras" —y cualquier variante de mayúsculas o acentos con que
 * el scraper la haya dado de alta: "UTILES DE HONDURAS", "Utiles de
 * Honduras"— no se muestra: ni sus artículos en el listado, la búsqueda, los
 * relacionados o la ficha, ni su nombre en el selector de tiendas.
 *
 * ESTO ES UN PARCHE. Si la exclusión se vuelve permanente, lo correcto es
 * apagar la tienda en la base (`stores.is_active = false`), que ya saca sus
 * artículos de `v_store_products_current` sin código que mantener.
 *
 * POR QUÉ NO SE FILTRA CON `ilike` CONTRA LA VISTA. La primera versión de este
 * parche ponía `store_name not ilike '%tiles de honduras%'` en cada consulta.
 * Es correcto, pero un patrón que empieza con comodín no puede usar índice: se
 * evalúa fila por fila sobre decenas de miles de artículos. En el cálculo de
 * facetas de respaldo —que ya iba justo de tiempo— eso bastó para que Postgres
 * cancelara la consulta ("canceling statement due to statement timeout") y el
 * build se cayera al prerenderizar la portada.
 *
 * Ahora el nombre difuso se resuelve UNA vez contra `stores`, que son un puñado
 * de filas, y las consultas grandes filtran por igualdad exacta
 * (`store_name not in (...)`), que sí es barata. Donde las filas ya se
 * recorren en memoria, se filtra ahí y no se le pide nada a la base.
 */

/**
 * Lo que se bloquea, ya normalizado: minúsculas, sin acentos. Comparar así
 * hace que "Útiles", "UTILES" y "ÚTILES DE HONDURAS" sean el mismo valor.
 */
const BLOCKED_NORMALIZED_NAMES = ['utiles de honduras'] as const;

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
 * Los nombres exactos, tal cual están escritos en `stores`, de las tiendas
 * bloqueadas que existen en esta base.
 *
 * Se memoiza el resultado —no el fallo— porque `stores` tiene unas pocas filas
 * y su contenido no cambia entre dos páginas del mismo build, pero un error de
 * red no debe quedar congelado para todo el proceso.
 *
 * Si la lectura falla, devuelve la lista vacía: el catálogo muestra de más, que
 * es preferible a que la portada entera deje de renderizar por un parche.
 */
let cachedBlockedNames: string[] | null = null;

export async function getBlockedStoreNames(): Promise<string[]> {
  if (cachedBlockedNames !== null) return cachedBlockedNames;

  try {
    const { data, error } = await getSupabaseAdmin().from('stores').select('name');
    if (error) return [];

    const names = ((data ?? []) as Array<{ name: string | null }>)
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string' && isBlockedStoreName(name));

    cachedBlockedNames = names;
    return names;
  } catch {
    return [];
  }
}

/** Sólo para las pruebas: olvida lo memoizado. */
export function resetBlockedStoreNamesCache(): void {
  cachedBlockedNames = null;
}

/**
 * Saca las tiendas bloqueadas de una consulta a `v_store_products_current`.
 *
 * Se aplica en la consulta, y no al mapear las filas, allí donde el `count`
 * exacto y la paginación los calcula Postgres: filtrar después dejaría páginas
 * cortas y un total inflado.
 *
 * Sin tiendas bloqueadas en esta base no toca la consulta: el caso normal no
 * paga nada.
 *
 * ES SÍNCRONA A PROPÓSITO, y por eso recibe los nombres ya resueltos en vez de
 * pedirlos ella misma. Los builders de supabase-js son «thenables»: tienen
 * `then`, que es lo que dispara la petición. Una versión `async` de esta
 * función devolvería el builder envuelto en una promesa, y `await` sobre ella
 * no daría el builder —lo EJECUTARÍA, y la llamada recibiría el resultado de
 * la consulta a medio construir, sin orden, sin rango y sin el resto de los
 * filtros.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function excludeBlockedStores(request: any, names: string[]): any {
  if (names.length === 0) return request;

  // Las comillas dobles alrededor de cada nombre son obligatorias en PostgREST:
  // sin ellas, un nombre con coma partiría la lista en dos valores.
  const list = `("${names.map((name) => name.replace(/"/g, '')).join('","')}")`;
  return request.not('store_name', 'in', list);
}
