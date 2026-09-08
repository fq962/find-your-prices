"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Glifo que identifica el filtro. Es decorativo (`aria-hidden` en el
   * contenedor): el nombre accesible del control sigue viniendo de su
   * `aria-label`, así no se duplica al leerlo con lector de pantalla.
   */
  icon?: ReactNode;
}

/**
 * `<select>` nativo (accesibilidad y comportamiento móvil intactos) con la
 * apariencia por defecto suprimida: el borde, el fondo y el foco viven en la
 * píldora que lo envuelve. El icono sustituye a una etiqueta escrita — dos
 * filtros que muestran "Todas" se distinguen por su glifo, sin gastar ancho
 * repitiendo la palabra que el valor elegido ya va a decir.
 */
export function Select({ className = "", icon, children, ...props }: SelectProps) {
  return (
    <div className="group relative flex h-12 items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] pr-9 pl-4 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] hover:border-[var(--border-strong)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none mr-2.5 shrink-0 text-[var(--text-tertiary)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-focus-within:text-[var(--accent)]"
        >
          {icon}
        </span>
      )}
      <select
        {...props}
        className={`w-full cursor-pointer appearance-none truncate bg-transparent text-[0.95rem] tracking-[-0.01em] text-[var(--text)] outline-none focus-visible:outline-none ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-y-[calc(-50%+1px)]"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
