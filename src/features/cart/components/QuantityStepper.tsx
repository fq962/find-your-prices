"use client";

import { useState } from "react";
import { clampQuantity, MAX_QUANTITY } from "../cart";

export interface QuantityStepperLabels {
  decrease: string;
  increase: string;
  quantity: string;
}

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  labels: QuantityStepperLabels;
  /** Nombre del producto, para que el lector de pantalla sepa de qué renglón es. */
  itemName?: string;
  size?: "sm" | "md";
}

/**
 * Cantidad con − / + y un campo editable en el medio.
 *
 * El campo acepta escribir "12" de una vez —ir de 1 a 12 con el botón son
 * once clics— y solo confirma al salir o con Enter: confirmar en cada tecla
 * haría que borrar para reescribir dejara la cantidad en 1 a mitad de camino.
 */
export function QuantityStepper({
  value,
  onChange,
  labels,
  itemName,
  size = "md",
}: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const height = size === "sm" ? "h-8" : "h-10";
  const button = `${size === "sm" ? "w-8" : "w-10"} ${height} flex items-center justify-center rounded-full text-[var(--text-secondary)] outline-none transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] hover:bg-[var(--bg-inset)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-90 disabled:pointer-events-none disabled:opacity-35`;
  const suffix = itemName ? `: ${itemName}` : "";

  function commit() {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isNaN(parsed)) onChange(clampQuantity(parsed));
    setDraft(null);
  }

  return (
    <div
      className={`inline-flex ${height} shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]`}
    >
      <button
        type="button"
        className={button}
        aria-label={`${labels.decrease}${suffix}`}
        disabled={value <= 1}
        onClick={() => onChange(clampQuantity(value - 1))}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${labels.quantity}${suffix}`}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
        className="w-8 bg-transparent text-center text-[0.9375rem] font-semibold tabular-nums text-[var(--text)] outline-none"
      />
      <button
        type="button"
        className={button}
        aria-label={`${labels.increase}${suffix}`}
        disabled={value >= MAX_QUANTITY}
        onClick={() => onChange(clampQuantity(value + 1))}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 12h12M12 6v12" />
        </svg>
      </button>
    </div>
  );
}
