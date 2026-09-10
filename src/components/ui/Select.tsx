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
   * la píldora grande competiría con el filtro que de verdad manda.
   *
   * Con puntero grueso `sm` sube a 44px: 40px se puede apuntar con un ratón,
   * no con un pulgar, y esa cabecera se usa sobre todo en teléfono.
   */
  size?: "sm" | "md";
}

/**
 * Medidas de la píldora, por variante.
 *
 * El `<select>` ocupa la píldora ENTERA —alto y ancho— y lleva él mismo el
 * relleno; el icono y la flecha se dibujan encima, absolutos y sin recibir
 * clics. Antes el select era un hijo flex sin alto: la píldora medía 167×48 y
 * el control 85×24, así que dos tercios de lo que se ve no abría nada. Un
 * control que se ve de 48px tiene que responder en sus 48px, sobre todo en
 * teléfono, que es donde se usa esto.
 *
 * `pointer: coarse` y no un breakpoint de ancho: lo que decide el tamaño del
 * blanco es el dedo, no la pantalla. Un portátil táctil también lo necesita.
 */
const SHELL_HEIGHT = {
  sm: "h-10 [@media(pointer:coarse)]:h-11",
  md: "h-12",
} as const;

/**
 * Relleno izquierdo del select. Con icono deja libre su ancho (18px) más la
 * separación; sin icono es el margen normal de la píldora.
 */
const FIELD_PADDING = {
  sm: { withIcon: "pl-10 pr-8", withoutIcon: "pl-3 pr-8" },
  md: { withIcon: "pl-11 pr-9", withoutIcon: "pl-4 pr-9" },
} as const;

const ICON_POSITION = { sm: "left-3", md: "left-4" } as const;

/**
 * Tamaño del valor. Sube a 16px con puntero grueso porque iOS hace zoom sobre
 * cualquier control de formulario con letra menor y deja la página desencuadrada
 * al cerrar el desplegable.
 */
const FIELD_TEXT = {
  sm: "text-[0.875rem] [@media(pointer:coarse)]:text-[1rem]",
  md: "text-[0.95rem] [@media(pointer:coarse)]:text-[1rem]",
} as const;

/**
 * `<select>` nativo (accesibilidad y comportamiento móvil intactos) con la
 * apariencia por defecto suprimida: el borde, el fondo y el foco viven en la
 * píldora que lo envuelve. El icono sustituye a una etiqueta escrita — dos
 * filtros que muestran "Todas" se distinguen por su glifo, sin gastar ancho
 * repitiendo la palabra que el valor elegido ya va a decir.
 */
export function Select({ className = "", icon, size = "md", children, ...props }: SelectProps) {
  const padding = FIELD_PADDING[size][icon ? "withIcon" : "withoutIcon"];

  return (
    /* `fyp-select` es el gancho del CSS que reescribe el menú desplegable en
       Chromium 135+ (ver globals.css): sin él, el menú lo pinta el sistema
       operativo y en Windows se ve fuera de sitio. */
    <div
      className={`fyp-select group relative rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] hover:border-[var(--border-strong)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_var(--accent-soft)] ${SHELL_HEIGHT[size]}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-[var(--text-tertiary)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-focus-within:text-[var(--accent)] ${ICON_POSITION[size]}`}
        >
          {icon}
        </span>
      )}
      <select
        {...props}
        /* `items-center`: con `appearance: none` Chromium trata al select como
           una caja inline-flex, y al ocupar ahora el alto entero de la píldora
           su valor se alineaba arriba en vez de al centro. */
        className={`flex h-full w-full cursor-pointer appearance-none items-center truncate rounded-full bg-transparent tracking-[-0.01em] text-[var(--text)] outline-none focus-visible:outline-none ${FIELD_TEXT[size]} ${padding} ${className}`}
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
        className="pointer-events-none absolute top-1/2 right-3.5 z-10 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-y-[calc(-50%+1px)]"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
