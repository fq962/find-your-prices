"use client";

import type { Density, ViewMode } from "@/features/products/viewPreferences";
import { DENSITIES, VIEW_MODES } from "@/features/products/viewPreferences";

/**
 * Controles de presentación: cómo se ven los resultados, no cuáles se ven.
 *
 * Se separan visualmente de los filtros por una razón concreta: mezclar "qué
 * busco" con "cómo lo miro" en una sola barra obliga a leerlo todo cada vez.
 * Aquí van juntos los dos ejes de presentación —forma y tamaño— y el tamaño
 * desaparece en modo lista, donde no significa nada.
 */

export interface CatalogControlsProps {
  mode: ViewMode;
  density: Density;
  onModeChange: (mode: ViewMode) => void;
  onDensityChange: (density: Density) => void;
  labels: {
    viewMode: string;
    density: string;
    modes: Record<ViewMode, string>;
    densities: Record<Density, string>;
  };
}

/**
 * Iconos dibujados a medida en vez de una librería.
 *
 * Cada uno describe literalmente la retícula que produce: una fila con miniatura,
 * una cuadrícula de cuatro, dos fichas grandes. Un icono genérico de "lista" o
 * "cuadrícula" obligaría a probar cada modo para entender la diferencia.
 */
const MODE_ICONS: Record<ViewMode, React.ReactNode> = {
  list: (
    <>
      <rect x="3" y="5" width="5" height="5" rx="1.2" />
      <path d="M10.5 6.2h10.5M10.5 8.8h7" />
      <rect x="3" y="14" width="5" height="5" rx="1.2" />
      <path d="M10.5 15.2h10.5M10.5 17.8h7" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.4" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.4" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.4" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.4" />
    </>
  ),
  gallery: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="1.4" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.4" />
    </>
  ),
};

export function CatalogControls({
  mode,
  density,
  onModeChange,
  onDensityChange,
  labels,
}: CatalogControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label={labels.viewMode}
        className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5"
      >
        {VIEW_MODES.map((candidate) => {
          const isActive = candidate === mode;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => onModeChange(candidate)}
              aria-pressed={isActive}
              /* El nombre accesible va en aria-label y no como texto visible:
                 el icono ya comunica la forma y tres etiquetas competirían con
                 los filtros por la atención. */
              aria-label={labels.modes[candidate]}
              title={labels.modes[candidate]}
              className={`flex h-8 w-8 items-center justify-center rounded-full outline-none transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                isActive
                  ? "bg-[var(--text)] text-[var(--text-inverted)]"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                {MODE_ICONS[candidate]}
              </svg>
            </button>
          );
        })}
      </div>

      {/* En lista el tamaño no aplica: las filas tienen alto fijo. Ocultarlo es
          más honesto que dejarlo deshabilitado sin explicación. */}
      {mode !== "list" && (
        <div
          role="group"
          aria-label={labels.density}
          className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5"
          style={{ animation: "fyp-fade 260ms var(--ease-out-quart) both" }}
        >
          {DENSITIES.map((candidate) => {
            const isActive = candidate === density;
            // El glifo crece con la densidad: la barra más alta es el tamaño
            // más grande. Se entiende sin leer.
            const barHeight = { compact: 7, cosy: 11, roomy: 15 }[candidate];
            return (
              <button
                key={candidate}
                type="button"
                onClick={() => onDensityChange(candidate)}
                aria-pressed={isActive}
                aria-label={labels.densities[candidate]}
                title={labels.densities[candidate]}
                className={`flex h-8 w-7 items-center justify-center rounded-full outline-none transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  isActive
                    ? "bg-[var(--text)] text-[var(--text-inverted)]"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <rect
                    x={(20 - barHeight) / 2}
                    y={(20 - barHeight) / 2}
                    width={barHeight}
                    height={barHeight}
                    rx="1.6"
                  />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
