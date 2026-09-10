"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import { useDebounce } from "@/hooks/useDebounce";

export interface SearchBarProps {
  /**
   * Término que viene de fuera: el `?q=` de la URL al cargar, o un borrado
   * desde otro control. Es opcional a propósito —quien monta la barra sin él
   * sigue teniendo un campo que se gestiona solo— y NO la convierte en un
   * input controlado: lo que se teclea manda mientras se teclea, y esto sólo
   * entra cuando el valor de fuera cambia por su cuenta.
   */
  value?: string;
  onQueryChange: (query: string) => void;
}

export function SearchBar({ value = "", onQueryChange }: SearchBarProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState(value);
  const debouncedQuery = useDebounce(query);

  /**
   * El último término que este componente y su entorno dan por acordado.
   *
   * Hace de árbitro entre las dos direcciones. Hacia afuera evita avisar de un
   * cambio que no hubo —incluido el del montaje, con la cadena vacía—; hacia
   * adentro distingue "la URL trae algo nuevo" de "es el eco de lo que acabo
   * de teclear", que es el bucle en el que cae cualquier campo que se sincroniza
   * con la barra de direcciones.
   */
  const settled = useRef(value);

  useEffect(() => {
    if (value === settled.current) return;
    settled.current = value;
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (debouncedQuery === settled.current) return;
    settled.current = debouncedQuery;
    onQueryChange(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  return (
    <div className="group relative">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-[var(--text-tertiary)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-focus-within:text-[var(--accent)]"
      >
        <circle cx="11" cy="11" r="6.4" />
        <path d="m20 20-3.6-3.6" />
      </svg>
      <input
        type="search"
        aria-label={t("searchPlaceholder")}
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] pr-4 pl-11 text-[0.95rem] tracking-[-0.01em] text-[var(--text)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,background-color] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] outline-none placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-soft)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
}
