"use client";

import { useId } from "react";
import type { FacetOption } from "@/server/services/catalog";

/**
 * Filtros secundarios, plegados tras un botón.
 *
 * Los tres controles que casi todo el mundo usa —buscar, tienda, categoría—
 * viven siempre a la vista. Estos otros aparecen cuando alguien los pide.
 * Es divulgación progresiva: mostrar siete controles de entrada a un visitante
 * que solo quiere buscar "licuadora" hace que el sitio parezca trabajo.
 *
 * El botón que abre este panel muestra cuántos filtros hay activos, para que
 * plegarlo nunca esconda estado: si una búsqueda devuelve poco, la causa está
 * a la vista sin tener que abrir nada.
 */

export interface CatalogFilterState {
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  onlyDiscounted: boolean;
  onlyInStock: boolean;
}

export const EMPTY_FILTER_STATE: CatalogFilterState = {
  minPrice: undefined,
  maxPrice: undefined,
  brand: undefined,
  onlyDiscounted: false,
  onlyInStock: false,
};

/** Cuántos de estos filtros están activos. Alimenta el contador del botón. */
export function countActiveFilters(state: CatalogFilterState): number {
  let count = 0;
  if (state.minPrice !== undefined) count += 1;
  if (state.maxPrice !== undefined) count += 1;
  if (state.brand) count += 1;
  if (state.onlyDiscounted) count += 1;
  if (state.onlyInStock) count += 1;
  return count;
}

export interface FilterPanelProps {
  state: CatalogFilterState;
  onChange: (next: CatalogFilterState) => void;
  brands: FacetOption[];
  priceBounds: { min: number; max: number };
  currencySymbol: string;
  labels: {
    priceRange: string;
    minPrice: string;
    maxPrice: string;
    brand: string;
    all: string;
    onlyDiscounted: string;
    onlyInStock: string;
  };
}

export function FilterPanel({
  state,
  onChange,
  brands,
  priceBounds,
  currencySymbol,
  labels,
}: FilterPanelProps) {
  const minId = useId();
  const maxId = useId();
  const brandId = useId();

  const patch = (partial: Partial<CatalogFilterState>) => onChange({ ...state, ...partial });

  /** Un campo vacío significa "sin tope", no cero. */
  const toBound = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  return (
    <div
      className="grid gap-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:grid-cols-2 lg:grid-cols-4"
      style={{ animation: "fyp-rise 380ms var(--ease-out-expo) both" }}
    >
      {/* Precio ---------------------------------------------------------- */}
      <fieldset className="sm:col-span-2 lg:col-span-2">
        <legend className="mb-2 block text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
          {labels.priceRange}
        </legend>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <label htmlFor={minId} className="sr-only">
              {labels.minPrice}
            </label>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.8125rem] text-[var(--text-tertiary)]"
            >
              {currencySymbol}
            </span>
            <input
              id={minId}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={String(Math.floor(priceBounds.min))}
              value={state.minPrice ?? ""}
              onChange={(event) => patch({ minPrice: toBound(event.target.value) })}
              className={numberInputClass}
            />
          </div>
          <span aria-hidden="true" className="text-[var(--text-tertiary)]">
            –
          </span>
          <div className="relative flex-1">
            <label htmlFor={maxId} className="sr-only">
              {labels.maxPrice}
            </label>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.8125rem] text-[var(--text-tertiary)]"
            >
              {currencySymbol}
            </span>
            <input
              id={maxId}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={String(Math.ceil(priceBounds.max))}
              value={state.maxPrice ?? ""}
              onChange={(event) => patch({ maxPrice: toBound(event.target.value) })}
              className={numberInputClass}
            />
          </div>
        </div>
      </fieldset>

      {/* Marca ----------------------------------------------------------- */}
      <div>
        <label
          htmlFor={brandId}
          className="mb-2 block text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase"
        >
          {labels.brand}
        </label>
        <select
          id={brandId}
          value={state.brand ?? ""}
          onChange={(event) => patch({ brand: event.target.value || undefined })}
          className="h-10 w-full cursor-pointer truncate rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-[0.875rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] focus:border-[var(--accent)]"
        >
          <option value="">{labels.all}</option>
          {brands.map((brand) => (
            <option key={brand.value} value={brand.value}>
              {brand.value} ({brand.count})
            </option>
          ))}
        </select>
      </div>

      {/* Interruptores ---------------------------------------------------- */}
      <div className="flex flex-col justify-end gap-3">
        <Toggle
          checked={state.onlyDiscounted}
          onChange={(checked) => patch({ onlyDiscounted: checked })}
          label={labels.onlyDiscounted}
        />
        <Toggle
          checked={state.onlyInStock}
          onChange={(checked) => patch({ onlyInStock: checked })}
          label={labels.onlyInStock}
        />
      </div>
    </div>
  );
}

const numberInputClass =
  "h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pr-3 pl-7 text-[0.875rem] tabular-nums text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Interruptor sobre un checkbox nativo.
 *
 * El input real se mantiene en el DOM (`sr-only`, no `display:none`) para
 * conservar foco por teclado, semántica de casilla y estado leído por lector
 * de pantalla; lo que se ve es la píldora, que sigue a `peer-checked`.
 */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-[var(--bg-inset)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] peer-checked:bg-[var(--accent)] peer-checked:[&>span]:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg-elevated)]">
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)]  transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)]" />
      </span>
      <span className="text-[0.875rem] text-[var(--text-secondary)] peer-checked:text-[var(--text)]">
        {label}
      </span>
    </label>
  );
}
