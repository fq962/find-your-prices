"use client";

/**
 * Interruptor sobre un checkbox nativo.
 *
 * El input real se mantiene en el DOM (`sr-only`, no `display:none`) para
 * conservar foco por teclado, semántica de casilla y estado leído por lector
 * de pantalla; lo que se ve es la píldora, que sigue a `peer-checked`.
 *
 * Vive en su propio archivo desde que el panel de filtros se partió en secciones:
 * lo usan la barra lateral de escritorio y la hoja de teléfono, y tenerlo dentro
 * de uno de los dos lo habría convertido en una dependencia rara del otro.
 */
export function Toggle({
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
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)]" />
      </span>
      {/* `text-balance` reparte las líneas de una etiqueta larga en vez de
          dejar una palabra sola abajo. "Incluir agotados y sin precio" caía
          como cuatro palabras y un huérfano, y esa segunda línea corta
          desalineaba el ritmo entre los dos interruptores de la columna. */}
      <span className="text-[0.875rem] text-balance text-[var(--text-secondary)] peer-checked:text-[var(--text)]">
        {label}
      </span>
    </label>
  );
}
