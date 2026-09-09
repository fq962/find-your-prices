"use client";

import { Select } from "@/components/ui/Select";
import { useLocale } from "@/features/i18n/LocaleContext";
import {
  MAX_COMPARE_COLUMNS,
  MIN_COMPARE_COLUMNS,
} from "@/features/products/viewPreferences";

/**
 * Configuración de la comparación: cuántas columnas y qué tienda va en cada una.
 *
 * Vive encima de las columnas y no dentro de cada cabecera porque son dos
 * decisiones de distinto nivel — cuántas comparo, contra qué comparo— y la
 * primera cambia la forma de toda la vista. En pantalla angosta los selectores
 * se apilan en dos por fila: un selector de tienda por debajo de ~150px muestra
 * "Supermerc…" y deja de servir para elegir.
 */

export interface CompareBarProps {
  /** Tiendas disponibles, ya ordenadas por cantidad de artículos. */
  stores: string[];
  columnCount: number;
  onColumnCountChange: (count: number) => void;
  /** Tienda de cada columna, en orden. `undefined` = sin elegir. */
  selection: (string | undefined)[];
  onSelectionChange: (index: number, store: string | undefined) => void;
}

const COLUMN_COUNTS = Array.from(
  { length: MAX_COMPARE_COLUMNS - MIN_COMPARE_COLUMNS + 1 },
  (_, index) => MIN_COMPARE_COLUMNS + index,
);

export function CompareBar({
  stores,
  columnCount,
  onColumnCountChange,
  selection,
  onSelectionChange,
}: CompareBarProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-sm)] sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] font-medium text-[var(--text-secondary)]">
          {t("compareColumnsLabel")}
        </span>

        {/* Botones y no un <select>: son cuatro valores contiguos y el número
            elegido tiene que verse sin abrir nada, porque es lo que explica
            cuántas columnas hay debajo. */}
        <div
          role="group"
          aria-label={t("compareColumnsLabel")}
          className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5"
        >
          {COLUMN_COUNTS.map((count) => {
            const isActive = count === columnCount;
            // Más columnas que tiendas disponibles daría columnas vacías por
            // construcción: se deshabilitan en vez de dejar elegirlas.
            const isPossible =
              count <= Math.max(stores.length, MIN_COMPARE_COLUMNS);
            return (
              <button
                key={count}
                type="button"
                disabled={!isPossible}
                onClick={() => onColumnCountChange(count)}
                aria-pressed={isActive}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-[0.875rem] font-medium tabular-nums outline-none transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-35 ${
                  isActive
                    ? "bg-[var(--text)] text-[var(--text-inverted)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flex y no grid: cada selector se reparte el ancho en la misma
          proporción que su columna, sea cual sea el número de columnas, así el
          selector queda encima de la columna que gobierna. Apilados en
          teléfono, donde no hay ancho que repartir. */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {selection.slice(0, columnCount).map((store, index) => (
          <div key={index} className="min-w-0 sm:flex-1">
            <Select
              size="sm"
              aria-label={`${t("compareStoreLabel")} ${index + 1}`}
              value={store ?? ""}
              onChange={(event) =>
                onSelectionChange(
                  index,
                  event.target.value === "" ? undefined : event.target.value,
                )
              }
            >
              <option value="">{t("compareChooseStoreLabel")}</option>
              {stores.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
