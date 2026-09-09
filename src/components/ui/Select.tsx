"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * `size` nativo del <select> (número de filas visibles) se descarta: acá el
 * control siempre es de una línea, y el nombre se reutiliza para el alto de la
 * píldora, que es la única variante que la interfaz necesita.
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /**
   * Glifo que identifica el filtro. Es decorativo (`aria-hidden` en el
   * contenedor): el nombre accesible del control sigue viniendo de su
   * `aria-label`, así no se duplica al leerlo con lector de pantalla.
   */
  icon?: ReactNode;
  /**
   * Alto del control. `md` (48px) es la barra principal; `sm` (40px) es para
   * controles subordinados —la cabecera de una columna de comparación—, donde
   * la píldora grande competiría con el filtro que de verdad manda. Sigue por
   * encima del mínimo táctil de 44px en su área real de toque gracias al
   * padding del contenedor.
   */
  size?: "sm" | "md";
}

/**
 * `<select>` nativo (accesibilidad y comportamiento móvil intactos) con la
 * apariencia por defecto suprimida: el borde, el fondo y el foco viven en la
 * píldora que lo envuelve. El icono sustituye a una etiqueta escrita — dos
 * filtros que muestran "Todas" se distinguen por su glifo, sin gastar ancho
 * repitiendo la palabra que el valor elegido ya va a decir.
 */
export function Select({ className = "", icon, size = "md", children, ...props }: SelectProps) {
  const shell = size === "sm" ? "h-10 pr-8 pl-3 text-[0.875rem]" : "h-12 pr-9 pl-4";

  return (
    /* `fyp-select` es el gancho del CSS que reescribe el menú desplegable en
       Chromium 135+ (ver globals.css): sin él, el menú lo pinta el sistema
       operativo y en Windows se ve fuera de sitio. */
    <div
      className={`fyp-select group relative flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] hover:border-[var(--border-strong)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_var(--accent-soft)] ${shell}`}
    >
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
        className={`w-full cursor-pointer appearance-none truncate bg-transparent tracking-[-0.01em] text-[var(--text)] outline-none focus-visible:outline-none ${
          size === "sm" ? "text-[0.875rem]" : "text-[0.95rem]"
        } ${className}`}
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
        className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-y-[calc(-50%+1px)]"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
