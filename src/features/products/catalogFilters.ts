/**
 * Estado de los filtros secundarios del catálogo.
 *
 * Módulo puro —sin React ni DOM— para que lo puedan importar tanto la barra
 * lateral como la hoja de teléfono y las pruebas, sin arrastrar un componente.
 * Antes vivía dentro de `FilterPanel.tsx`; cuando ese panel se partió en
 * secciones, el estado se quedó sin casa natural y esta es la que le
 * corresponde.
 */

export interface CatalogFilterState {
  minPrice?: number;
  maxPrice?: number;
  /** Marcas elegidas. Vacío es "todas"; varias se combinan con OR. */
  brand: string[];
  onlyDiscounted: boolean;
  /**
   * Mostrar también lo que no se puede comprar hoy: agotados, descontinuados
   * y artículos con precio 0.
   *
   * Está redactado en positivo —"incluir"— y no como "solo disponibles" a
   * propósito. El default del catálogo ya es mostrar solo lo comprable, así
   * que un control llamado "solo disponibles" que arranca apagado mentiría
   * sobre lo que está pasando: sugeriría que sin marcarlo se ve todo.
   */
  includeUnavailable: boolean;
}

export const EMPTY_FILTER_STATE: CatalogFilterState = {
  minPrice: undefined,
  maxPrice: undefined,
  brand: [],
  onlyDiscounted: false,
  includeUnavailable: false,
};

/**
 * Cuántos de estos filtros están activos.
 *
 * Alimenta el contador del botón de filtros, que existe para que plegar el
 * panel nunca esconda estado: si una búsqueda devuelve poco, la causa está a la
 * vista sin tener que abrir nada.
 *
 * El rango de precio cuenta como UN filtro aunque tenga dos campos: para quien
 * lo puso es una sola decisión ("entre 500 y 2 000"), y contarlo doble haría
 * que el botón dijera "2" tras un único gesto.
 */
export function countActiveFilters(state: CatalogFilterState): number {
  let count = 0;
  if (state.minPrice !== undefined || state.maxPrice !== undefined) count += 1;
  // Varias marcas son UNA decisión ("Sony o Samsung"), igual que el precio.
  if (state.brand.length > 0) count += 1;
  if (state.onlyDiscounted) count += 1;
  // Cuenta porque se aparta del default, no porque agregue una restricción.
  if (state.includeUnavailable) count += 1;
  return count;
}
