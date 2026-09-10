"use client";

import { useId } from "react";

/**
 * Filtro de precio: tramos predefinidos y, debajo, un rango a medida.
 *
 * Los dos controles no sobran uno al otro. Casi todo el mundo no tiene una
 * cifra en la cabeza, tiene una intención —"algo barato", "gama alta"—, y para
 * eso un tramo de un clic es más rápido que teclear dos números. Quien sí tiene
 * la cifra ("no paso de 3 000") necesita los campos, y ningún juego de tramos
 * se la va a adivinar.
 *
 * Los tramos están en lempiras y elegidos por lo que se compra en Honduras, no
 * traducidos de una escala en dólares: bajo 500 es consumible, 500–2 000 es
 * accesorio o ropa, 2 000–10 000 es electrodoméstico, y de ahí para arriba es
 * la compra que se piensa dos veces.
 */

export interface PriceRange {
  min?: number;
  max?: number;
}

/** Los tramos, en la moneda del catálogo. `max` sin valor es "y más". */
const RANGES: PriceRange[] = [
  { min: 0, max: 500 },
  { min: 500, max: 2_000 },
  { min: 2_000, max: 10_000 },
  { min: 10_000 },
];

export interface PriceFilterProps {
  minPrice?: number;
  maxPrice?: number;
  onChange: (range: PriceRange) => void;
  currencySymbol: string;
  /** Formatea las cifras de los tramos. Se recibe para no duplicar el locale. */
  formatAmount: (amount: number) => string;
  labels: {
    min: string;
    max: string;
    andUp: string;
    any: string;
  };
}

export function PriceFilter({
  minPrice,
  maxPrice,
  onChange,
  currencySymbol,
  formatAmount,
  labels,
}: PriceFilterProps) {
  const name = useId();
  const minId = useId();
  const maxId = useId();

  const matches = (range: PriceRange) => range.min === minPrice && range.max === maxPrice;
  const isAny = minPrice === undefined && maxPrice === undefined;

  /** Un campo vacío significa "sin tope", no cero. */
  const toBound = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  const rangeLabel = (range: PriceRange) =>
    range.max === undefined
      ? `${formatAmount(range.min ?? 0)} ${labels.andUp}`
      : `${formatAmount(range.min ?? 0)} – ${formatAmount(range.max)}`;

  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col p-0">
        <RangeOption
          name={name}
          label={labels.any}
          checked={isAny}
          onSelect={() => onChange({ min: undefined, max: undefined })}
        />
        {RANGES.map((range) => (
          <RangeOption
            key={`${range.min}-${range.max ?? "up"}`}
            name={name}
            label={rangeLabel(range)}
            checked={matches(range)}
            onSelect={() => onChange(range)}
          />
        ))}
      </ul>

      {/* Los campos a medida escriben el mismo estado que los tramos, así que
          teclear 700–900 desmarca el tramo 500–2 000 solo. Dos controles que
          no comparten estado son dos filtros que se contradicen en silencio. */}
      <div className="flex items-center gap-2 pt-1">
        <BoundInput
          id={minId}
          label={labels.min}
          currencySymbol={currencySymbol}
          value={minPrice}
          onChange={(next) => onChange({ min: next, max: maxPrice })}
        />
        <span aria-hidden="true" className="text-[var(--text-tertiary)]">
          –
        </span>
        <BoundInput
          id={maxId}
          label={labels.max}
          currencySymbol={currencySymbol}
          value={maxPrice}
          onChange={(next) => onChange({ min: minPrice, max: next })}
        />
      </div>
    </div>
  );

  function BoundInput({
    id,
    label,
    currencySymbol,
    value,
    onChange: onBoundChange,
  }: {
    id: string;
    label: string;
    currencySymbol: string;
    value?: number;
    onChange: (value: number | undefined) => void;
  }) {
    return (
      <div className="relative flex-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[0.75rem] text-[var(--text-tertiary)]"
        >
          {currencySymbol}
        </span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder={label}
          value={value ?? ""}
          onChange={(event) => onBoundChange(toBound(event.target.value))}
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pr-2 pl-6 text-[0.8125rem] tabular-nums text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    );
  }
}

function RangeOption({
  name,
  label,
  checked,
  onSelect,
}: {
  name: string;
  label: string;
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
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] tabular-nums text-[var(--text-secondary)] peer-checked:text-[var(--text)]">
          {label}
        </span>
      </label>
    </li>
  );
}
