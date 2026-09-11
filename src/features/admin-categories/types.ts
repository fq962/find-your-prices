/** Tipos que consume el panel de categorías. Espejo de las tablas. */

/** Una fila de `find_your_prices.categories`, el árbol propio del sitio. */
export interface CanonicalCategory {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  path: string | null;
  level: number;
  position: number;
  is_active: boolean;
}

/**
 * Una categoría de tienda con lo que el panel necesita para decidir a dónde
 * mapearla: de qué tienda es, dónde cuelga en el árbol de la tienda, cuántos
 * artículos comprables tiene hoy y a qué nodo canónico apunta.
 */
export interface StoreCategoryRow {
  id: string;
  store_id: string;
  store_name: string;
  external_id: string;
  parent_id: string | null;
  name: string;
  /** Ruta dentro del árbol de la tienda: "Hogar › Cocina › Ollas". */
  store_path: string;
  level: number;
  url: string | null;
  is_active: boolean;
  /** Conteo que reporta la tienda; puede ser null o estar viejo. */
  reported_count: number | null;
  /** Artículos activos y comprables hoy que cuelgan de ella. */
  live_count: number;
  category_id: string | null;
}

export interface StoreOption {
  id: string;
  name: string;
  slug: string;
}

/** Cuántas categorías de tienda y artículos apuntan a cada nodo canónico. */
export interface CanonicalUsage {
  storeCategories: number;
  products: number;
}
