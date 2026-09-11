"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { UNCATEGORIZED_VALUE, type FacetOption } from "@/features/products/categoryFacets";

/**
 * Lista de opciones de una faceta, con buscador cuando hace falta.
 *
 * Son casillas: se pueden marcar varias opciones de la misma faceta y el
 * catálogo las resuelve con `in (...)` en Postgres. "Todas" es la casilla que
 * queda marcada cuando no hay ninguna elegida, y marcarla vacía la selección.
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
 *
 * Las opciones pueden traer hijas (`children`): es el árbol de categorías.
 * Una raíz marcada abarca a sus hijas —que se ven marcadas— y desmarcar una
 * hija en ese estado deja marcadas a las demás, que es lo que la vista
 * prometía. Las hijas se despliegan con un chevrón, y solas cuando alguna
 * está marcada o hay un término escrito, para que lo elegido nunca quede
 * escondido.
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
  /** Agrupa las casillas. Debe ser único en la página. */
  name: string;
  options: FacetOption[];
  /** Opciones marcadas. Vacío es "todas". */
  value: string[];
  onChange: (value: string[]) => void;
  labels: {
    all: string;
    search: string;
    /** Se muestra cuando el buscador no encuentra nada. */
    noMatches: string;
    /** Despliega el resto de la lista. Lleva pegado cuántas faltan. */
    showMore: string;
    showLess: string;
    /** Texto de la opción `UNCATEGORIZED_VALUE`. Solo aplica a categorías. */
    uncategorized?: string;
    /** Nombre accesible del chevrón que abre las hijas. Se le pega la raíz. */
    expand?: string;
    collapse?: string;
  };
}

/** Texto visible de una opción: la etiqueta, o el valor si no trae. */
function optionLabel(option: FacetOption, uncategorized?: string): string {
  if (option.value === UNCATEGORIZED_VALUE) return uncategorized ?? option.value;
  return option.label ?? option.value;
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
  /** Raíces que la persona abrió o cerró a mano. Pisa el despliegue automático. */
  const [openRoots, setOpenRoots] = useState<Map<string, boolean>>(new Map());

  const showSearch = options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    const matches = (option: FacetOption) =>
      optionLabel(option, labels.uncategorized).toLowerCase().includes(needle);
    // Una raíz que coincide se muestra entera; si no, se muestra recortada a
    // las hijas que coinciden, y sólo si queda alguna.
    return options.flatMap((option) => {
      if (matches(option)) return [option];
      const children = option.children?.filter(matches) ?? [];
      return children.length > 0 ? [{ ...option, children }] : [];
    });
  }, [options, term, labels.uncategorized]);

  /**
   * Cuántas quedan fuera del corte. Con el buscador escrito la lista ya viene
   * acotada por el término, así que el corte se aplica igual sobre lo que haya
   * quedado: es coherente y no hace falta un caso aparte.
   *
   * Lo marcado nunca se corta: una opción elegida que quedó detrás de "Ver
   * más" —"Sin categorizar aún" va siempre al final— dejaría el filtro activo
   * sin ninguna casilla marcada a la vista.
   */
  const isSelected = (option: FacetOption) =>
    value.includes(option.value) ||
    (option.children ?? []).some((child) => value.includes(child.value));
  const shown =
    expanded || visible.length <= COLLAPSED_LIMIT
      ? visible
      : [...visible.slice(0, COLLAPSED_LIMIT), ...visible.slice(COLLAPSED_LIMIT).filter(isSelected)];
  const hidden = visible.length - shown.length;

  /** Marca o desmarca una opción sin tocar las demás. */
  const toggleOption = (option: string) =>
    onChange(
      value.includes(option) ? value.filter((item) => item !== option) : [...value, option],
    );

  /**
   * Marca una raíz. Sus hijas sueltas se quitan: marcada la raíz ya están
   * dentro, y dejarlas en la URL sería repetir el filtro.
   */
  const toggleRoot = (root: FacetOption) => {
    if (value.includes(root.value)) return onChange(value.filter((item) => item !== root.value));
    const childValues = new Set(root.children?.map((child) => child.value) ?? []);
    onChange([...value.filter((item) => !childValues.has(item)), root.value]);
  };

  /**
   * Marca una hija. Si la raíz está marcada, desmarcarla significa "todas
   * menos ésta": la raíz sale y entran sus hermanas.
   */
  const toggleChild = (root: FacetOption, child: FacetOption) => {
    if (!value.includes(root.value)) return toggleOption(child.value);
    const siblings = (root.children ?? [])
      .map((item) => item.value)
      .filter((item) => item !== child.value);
    onChange([...value.filter((item) => item !== root.value), ...siblings]);
  };

  const isRootOpen = (root: FacetOption) => {
    const manual = openRoots.get(root.value);
    if (manual !== undefined) return manual;
    if (term.trim()) return true;
    return (root.children ?? []).some((child) => value.includes(child.value));
  };

  const toggleRootOpen = (root: FacetOption) =>
    setOpenRoots((current) => {
      const next = new Map(current);
      next.set(root.value, !isRootOpen(root));
      return next;
    });

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
          checked={value.length === 0}
          onSelect={() => onChange([])}
        />

        {shown.map((option) => {
          const children = option.children ?? [];
          if (children.length === 0) {
            return (
              <Option
                key={option.value}
                name={name}
                label={optionLabel(option, labels.uncategorized)}
                count={option.count}
                checked={value.includes(option.value)}
                onSelect={() => toggleOption(option.value)}
              />
            );
          }

          const rootLabel = optionLabel(option, labels.uncategorized);
          const rootChecked = value.includes(option.value);
          const open = isRootOpen(option);
          return (
            <Option
              key={option.value}
              name={name}
              label={rootLabel}
              count={option.count}
              checked={rootChecked}
              onSelect={() => toggleRoot(option)}
              expander={{
                open,
                label: `${open ? (labels.collapse ?? "-") : (labels.expand ?? "+")} ${rootLabel}`,
                onToggle: () => toggleRootOpen(option),
              }}
            >
              {open && (
                <ul className="m-0 flex list-none flex-col p-0 pl-5">
                  {children.map((child) => (
                    <Option
                      key={child.value}
                      name={name}
                      label={optionLabel(child, labels.uncategorized)}
                      count={child.count}
                      checked={rootChecked || value.includes(child.value)}
                      onSelect={() => toggleChild(option, child)}
                    />
                  ))}
                </ul>
              )}
            </Option>
          );
        })}

        {visible.length === 0 && (
          <li className="px-1 py-3 text-[0.8125rem] text-[var(--text-tertiary)]">
            {labels.noMatches}
          </li>
        )}
      </ul>

      {/* Dice cuántas quedan, no sólo "ver más": saber que detrás hay 1 579
          categorías cambia la decisión —se teclea en el campo de arriba en vez
          de desplegar una lista que no se puede recorrer con la vista. */}
      {(hidden > 0 || expanded) && (
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
 * La casilla real se queda en el DOM (`sr-only`, no `display:none`) para
 * conservar foco por teclado, semántica y lectura por lector de pantalla; lo
 * que se ve es el cuadro con la marca, que sigue a `peer-checked`. Es el mismo
 * criterio que el interruptor del panel viejo.
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
  expander,
  children,
}: {
  name: string;
  label: string;
  count?: number;
  checked: boolean;
  onSelect: () => void;
  /**
   * Chevrón que abre las hijas. Va fuera del `<label>` a propósito: dentro,
   * pulsarlo también marcaría la casilla.
   */
  expander?: { open: boolean; label: string; onToggle: () => void };
  /** Las hijas ya pintadas, debajo de la fila. */
  children?: ReactNode;
}) {
  return (
    <li>
      <div className="flex items-center">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-1 pl-1 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] [@media(pointer:coarse)]:py-2.5">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={onSelect}
          className="peer sr-only"
        />
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border-strong)] transition-colors duration-[var(--dur-fast)] peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:[&>svg]:scale-100 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg-elevated)]">
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="h-3 w-3 scale-0 text-[var(--accent-contrast)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m2.5 6.5 2.5 2.5 4.5-5" />
          </svg>
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
      {expander && (
        <button
          type="button"
          aria-expanded={expander.open}
          aria-label={expander.label}
          onClick={expander.onToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ${expander.open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
      </div>
      {children}
    </li>
  );
}
