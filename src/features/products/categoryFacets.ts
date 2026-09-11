/**
 * Árbol de categorías del filtro.
 *
 * Módulo puro —sin React, sin red— porque lo usan el servicio del catálogo
 * (para armar el árbol a partir de las filas de la vista) y la barra lateral
 * (para pintar el árbol y resolver etiquetas). Las pruebas lo importan sin
 * arrastrar nada.
 *
 * El árbol es el de la tabla `categories`, el propio del sitio, NO el de cada
 * tienda. Dos niveles: raíz e hija. Lo que aún no tiene mapeo canónico cae en
 * una opción sintética al final, `UNCATEGORIZED_VALUE`, cuya etiqueta la pone
 * la interfaz según el idioma.
 */

export interface FacetOption {
  /** Lo que viaja en la URL y en la consulta. Para categorías es el slug. */
  value: string;
  count: number;
  /**
   * Texto a mostrar. Sin él se muestra `value`, que es lo correcto para
   * tiendas y marcas, donde el valor ya es el nombre.
   */
  label?: string;
  /** Hijas, en el caso de una raíz del árbol de categorías. */
  children?: FacetOption[];
}

/**
 * Valor reservado de la opción "Sin categorizar aún".
 *
 * No es un slug de `categories` y no puede llegar a serlo: la tabla usa slugs
 * de nombres reales y ninguno arranca con `__`.
 */
export const UNCATEGORIZED_VALUE = "__uncategorized";

/** Una fila de `v_catalog_canonical_category_facets`, ya con tipos. */
export interface CanonicalCategoryFacetRow {
  slug: string | null;
  name: string | null;
  parentSlug: string | null;
  parentName: string | null;
  count: number;
}

/**
 * Arma el árbol de opciones a partir de filas planas de conteo directo.
 *
 * El conteo de una raíz es el suyo más el de sus hijas: es lo que el filtro
 * devuelve al marcarla. Las raíces y las hijas se ordenan por conteo, como
 * las demás facetas, para que lo que tiene artículos quede arriba. La opción
 * de sin categorizar va siempre al final, y sólo si tiene algo.
 */
export function buildCategoryTree(rows: CanonicalCategoryFacetRow[]): FacetOption[] {
  const roots = new Map<string, FacetOption>();
  let uncategorized = 0;

  const ensureRoot = (slug: string, name: string): FacetOption => {
    let root = roots.get(slug);
    if (!root) {
      root = { value: slug, label: name, count: 0, children: [] };
      roots.set(slug, root);
    }
    return root;
  };

  for (const row of rows) {
    if (row.count <= 0) continue;
    if (!row.slug) {
      uncategorized += row.count;
      continue;
    }
    if (row.parentSlug) {
      const root = ensureRoot(row.parentSlug, row.parentName ?? row.parentSlug);
      root.count += row.count;
      root.children!.push({ value: row.slug, label: row.name ?? row.slug, count: row.count });
    } else {
      const root = ensureRoot(row.slug, row.name ?? row.slug);
      root.count += row.count;
    }
  }

  const byCount = (a: FacetOption, b: FacetOption) => b.count - a.count;
  const tree = [...roots.values()].sort(byCount);
  for (const root of tree) {
    root.children!.sort(byCount);
    if (root.children!.length === 0) delete root.children;
  }

  if (uncategorized > 0) tree.push({ value: UNCATEGORIZED_VALUE, count: uncategorized });
  return tree;
}

/** Etiqueta de un valor, buscándolo en el árbol. Devuelve el valor si no está. */
export function categoryLabel(options: FacetOption[], value: string): string {
  for (const option of options) {
    if (option.value === value) return option.label ?? option.value;
    const child = option.children?.find((item) => item.value === value);
    if (child) return child.label ?? child.value;
  }
  return value;
}
