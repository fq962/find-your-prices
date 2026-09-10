"use client";

import { useId, useMemo, useState } from "react";
import type { FacetOption } from "@/server/services/catalog";

/**
 * Lista de opciones de una faceta, con buscador cuando hace falta.
 *
 * Son radios y no casillas, y conviene decir por qué: el catálogo resuelve
 * tienda y categoría con un `=` en Postgres, así que hoy sólo se puede elegir
 * una. Pintar casillas —que prometen "marcá varias"— sobre un backend que
 * ignora la segunda sería mentirle a la persona con la forma del control. El
 * día que la consulta use `in (...)`, esto pasa a casillas y el resto del panel
 * no se entera.
 *
 * El buscador aparece solo pasado cierto número de opciones. Con siete tiendas
 * es un campo de más; con 300 marcas, sin él la lista es inservible —hay que
 * desplazarse a ciegas buscando "Samsung" entre trescientas.
 *
 * La lista larga NO se mete en una caja con desplazamiento propio. Una caja de
 * 14rem con su barra dentro de un panel que ya se desplaza con la página son
 * dos superficies de scroll anidadas: la rueda actúa sobre una o sobre otra
 * según dónde esté el puntero, y lo que queda debajo se esconde detrás de una
 * barra de cuatro píxeles que casi nadie ve. En su lugar la lista se corta en
 * las primeras opciones y crece hacia abajo cuando se pide.
 */

/** A partir de acá una lista deja de recorrerse con la vista. */
const SEARCH_THRESHOLD = 12;

/**
 * Cuántas opciones se pintan antes de tener que pedir el resto.
 *
 * Ocho más "Todas" son nueve filas: alto suficiente para que se vea que la
 * lista sigue, y corto para que las cinco secciones del panel quepan juntas.
 * Las facetas llegan ordenadas por cantidad, así que lo que queda arriba es lo
 * que de verdad tiene artículos detrás.
 */
const COLLAPSED_LIMIT = 8;

export interface FilterOptionListProps {
  /** Agrupa los radios. Debe ser único en la página. */
  name: string;
  options: FacetOption[];
  /** `undefined` es "todas". */
  value?: string;
  onChange: (value: string | undefined) => void;
  labels: {
    all: string;
    search: string;
    /** Se muestra cuando el buscador no encuentra nada. */
    noMatches: string;
    /** Despliega el resto de la lista. Lleva pegado cuántas faltan. */
    showMore: string;
    showLess: string;
  };
}

export function FilterOptionList({
  name,
  options,
  value,
  onChange,
  labels,
}: FilterOptionListProps) {
  const searchId = useId();
  const [term, setTerm] = useState("");
  const [expanded, setExpanded] = useState(false);

  const showSearch = options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.value.toLowerCase().includes(needle));
  }, [options, term]);

  /**
   * Cuántas quedan fuera del corte. Con el buscador escrito la lista ya viene
   * acotada por el término, así que el corte se aplica igual sobre lo que haya
   * quedado: es coherente y no hace falta un caso aparte.
   */
  const hidden = Math.max(visible.length - COLLAPSED_LIMIT, 0);
  const shown = expanded || hidden === 0 ? visible : visible.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      {showSearch && (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {labels.search}
          </label>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={labels.search}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pr-3 pl-8 text-[0.8125rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          />
        </div>
      )}

      <ul className="m-0 flex list-none flex-col p-0">
        <Option
          name={name}
          label={labels.all}
          checked={value === undefined}
          onSelect={() => onChange(undefined)}
        />

        {shown.map((option) => (
          <Option
            key={option.value}
            name={name}
            label={option.value}
            count={option.count}
            checked={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}

        {visible.length === 0 && (
          <li className="px-1 py-3 text-[0.8125rem] text-[var(--text-tertiary)]">
            {labels.noMatches}
          </li>
        )}
      </ul>

      {/* Dice cuántas quedan, no sólo "ver más": saber que detrás hay 1 579
          categorías cambia la decisión —se teclea en el campo de arriba en vez
          de desplegar una lista que no se puede recorrer con la vista. */}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="self-start rounded-lg px-1 py-1.5 text-[0.8125rem] font-medium text-[var(--accent)] outline-none transition-opacity duration-[var(--dur-fast)] hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {expanded ? labels.showLess : `${labels.showMore} (${hidden})`}
        </button>
      )}
    </div>
  );
}

/**
 * Una opción.
 *
 * El radio real se queda en el DOM (`sr-only`, no `display:none`) para
 * conservar navegación por flechas dentro del grupo, semántica y lectura por
 * lector de pantalla; lo que se ve es el círculo, que sigue a `peer-checked`.
 * Es el mismo criterio que el interruptor del panel viejo.
 *
 * La fila entera es el blanco de clic y mide 36px de alto, que con puntero
 * grueso sube a 44 para cumplir el mínimo táctil.
 */
function Option({
  name,
  label,
  count,
  checked,
  onSelect,
}: {
  name: string;
  label: string;
  count?: number;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-1 pl-1 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] [@media(pointer:coarse)]:py-2.5">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onSelect}
          className="peer sr-only"
        />
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] transition-colors duration-[var(--dur-fast)] peer-checked:border-[var(--accent)] peer-checked:[&>span]:scale-100 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg-elevated)]">
          <span className="h-2 w-2 scale-0 rounded-full bg-[var(--accent)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]" />
        </span>

        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-[var(--text-secondary)] peer-checked:text-[var(--text)]">
          {label}
        </span>

        {/* El conteo va antes de elegir, no después: saber que "Televisores"
            tiene 12 artículos y "Celulares" 1 400 cambia cuál se elige. */}
        {count !== undefined && count > 0 && (
          <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">
            {count}
          </span>
        )}
      </label>
    </li>
  );
}
