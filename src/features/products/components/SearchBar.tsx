"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import { useDebounce } from "@/hooks/useDebounce";
import {
  flattenSuggestions,
  useSearchSuggestions,
  type Suggestion,
  type SuggestionGroups,
} from "@/features/products/useSearchSuggestions";

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
  /**
   * Alto de la caja. `md` (48px) es la de la página; `sm` (40px) es la de la
   * barra de navegación, donde compite en altura con el logo y los iconos.
   */
  size?: "sm" | "md";
  /**
   * Ofrecer sugerencias mientras se escribe. Apagado no consulta nada, que es
   * lo correcto sin catálogo remoto (fixture, pruebas).
   */
  suggest?: boolean;
  /**
   * Qué hacer con la sugerencia elegida. Quien monta la barra decide: en la
   * portada una tienda es un filtro, en cualquier otra página es un enlace.
   */
  onSelectSuggestion?: (suggestion: Suggestion) => void;
  /** Enter sin sugerencia marcada. Recibe el texto tal cual está en la caja. */
  onSubmit?: (query: string) => void;
  /**
   * Control pegado a la izquierda de la caja, dentro de la misma píldora: el
   * selector de alcance de la barra. La caja pierde su borde izquierdo
   * redondeado y ese lado lo cierra este control.
   */
  leading?: ReactNode;
}

const HEIGHT = { sm: "h-10", md: "h-12" } as const;
const FIELD_TEXT = { sm: "text-[0.9375rem]", md: "text-[0.95rem]" } as const;

export function SearchBar({
  value = "",
  onQueryChange,
  size = "md",
  suggest = false,
  onSelectSuggestion,
  onSubmit,
  leading,
}: SearchBarProps) {
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

  /** Avisa ya, sin esperar el retraso: Enter y borrar no deberían esperar. */
  function commit(next: string) {
    setQuery(next);
    if (next === settled.current) return;
    settled.current = next;
    onQueryChange(next);
  }

  // ---------------------------------------------------------------------------
  // Sugerencias
  //
  // Patrón combobox: la caja es el control, el desplegable es un listbox y la
  // opción marcada viaja por aria-activedescendant. El foco NUNCA sale de la
  // caja —se sigue escribiendo mientras se recorren las opciones con las
  // flechas—, que es lo que hace usable el desplegable con teclado.
  // ---------------------------------------------------------------------------

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  // Sólo se pregunta con la caja abierta: al cargar `/?q=iphone` la caja ya
  // trae texto, y pedir sugerencias que nadie va a ver es una petición de más.
  const groups = useSearchSuggestions(query, suggest && isOpen);
  const options = flattenSuggestions(groups);
  // La marca se guarda junto a la lista a la que pertenece: cada tanda nueva
  // de sugerencias arranca sin marca, porque la que había apuntaba a otra
  // lista. Se deriva en el render en vez de borrarse desde un efecto, que
  // pintaría un fotograma con la marca vieja sobre la lista nueva.
  const [marked, setMarked] = useState<{ groups: SuggestionGroups; index: number } | null>(null);
  const activeIndex = marked?.groups === groups ? marked.index : -1;
  const setActiveIndex = (next: number | ((index: number) => number)) =>
    setMarked({ groups, index: typeof next === "function" ? next(activeIndex) : next });

  const showList = suggest && isOpen && options.length > 0;

  function select(suggestion: Suggestion) {
    setIsOpen(false);
    setActiveIndex(-1);
    if (suggestion.kind === "item") commit(suggestion.name);
    onSelectSuggestion?.(suggestion);
    inputRef.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (showList) {
        event.preventDefault();
        setIsOpen(false);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = showList ? options[activeIndex] : undefined;
      if (active) {
        select(active);
        return;
      }
      setIsOpen(false);
      commit(query);
      onSubmit?.(query);
      return;
    }
    if (!showList) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
    }
  }

  const optionId = (index: number) => `${listboxId}-${index}`;

  return (
    // Con `leading` la píldora son dos piezas en fila; la caja y sus iconos
    // van en su propio contenedor para que se posicionen contra ella y no
    // contra el conjunto. Sin él, ese contenedor no existe para el layout.
    <div className={leading ? "relative flex min-w-0" : "group relative"}>
      {leading}
      <div className={leading ? "group relative min-w-0 flex-1" : "contents"}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className={`pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--text-tertiary)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-focus-within:text-[var(--accent)] ${
          size === "sm" ? "left-3.5" : "left-4"
        }`}
      >
        <circle cx="11" cy="11" r="6.4" />
        <path d="m20 20-3.6-3.6" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        // Con sugerencias la caja pasa a ser un combobox; sin ellas sigue
        // siendo la caja de búsqueda de siempre (y así la conocen las pruebas).
        role={suggest ? "combobox" : undefined}
        aria-label={t("searchPlaceholder")}
        aria-autocomplete={suggest ? "list" : undefined}
        aria-expanded={suggest ? showList : undefined}
        aria-controls={showList ? listboxId : undefined}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        // Con retraso: el clic en una opción dispara blur ANTES que su propio
        // click, y cerrar de inmediato desmontaría la opción bajo el puntero.
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={onKeyDown}
        className={`${HEIGHT[size]} ${FIELD_TEXT[size]} w-full ${leading ? "rounded-l-none rounded-r-full" : "rounded-full"} border border-[var(--border)] bg-[var(--bg-elevated)] pr-10 tracking-[-0.01em] text-[var(--text)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,background-color] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] outline-none placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-soft)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden ${
          size === "sm" ? "pl-10" : "pl-11"
        }`}
      />

      {/* Borrar de un toque. El botón nativo del `type=search` se esconde
          porque cada navegador lo dibuja distinto; este es el mismo en todos
          y mide 36px, que se puede pulsar con el pulgar. */}
      {query.length > 0 && (
        <button
          type="button"
          aria-label={t("clearSearchLabel")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            commit("");
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-tertiary)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          >
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      </div>

      {showList && (
        <SuggestionList
          id={listboxId}
          groups={groups}
          query={query}
          activeIndex={activeIndex}
          optionId={optionId}
          onHover={setActiveIndex}
          onSelect={select}
          labels={{
            list: t("suggestionsLabel"),
            stores: t("suggestStoresLabel"),
            categories: t("suggestCategoriesLabel"),
            items: t("suggestItemsLabel"),
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// El desplegable
// -----------------------------------------------------------------------------

interface SuggestionListProps {
  id: string;
  groups: SuggestionGroups;
  query: string;
  activeIndex: number;
  optionId: (index: number) => string;
  onHover: (index: number) => void;
  onSelect: (suggestion: Suggestion) => void;
  labels: { list: string; stores: string; categories: string; items: string };
}

/**
 * Tres secciones rotuladas, una lista plana por debajo: el índice de cada
 * opción es global para que las flechas la recorran de arriba abajo sin saber
 * de secciones.
 */
function SuggestionList({
  id,
  groups,
  query,
  activeIndex,
  optionId,
  onHover,
  onSelect,
  labels,
}: SuggestionListProps) {
  const sections: { key: keyof SuggestionGroups; label: string }[] = [
    { key: "stores", label: labels.stores },
    { key: "categories", label: labels.categories },
    { key: "items", label: labels.items },
  ];

  let index = -1;

  return (
    <div
      id={id}
      role="listbox"
      aria-label={labels.list}
      className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[var(--shadow-lg)]"
      style={{ animation: "fyp-fade 160ms var(--ease-out-quart) both" }}
    >
      {sections.map(({ key, label }) => {
        const entries = groups[key];
        if (entries.length === 0) return null;
        return (
          <div key={key} role="group" aria-label={label}>
            <p
              aria-hidden="true"
              className="px-4 pt-2.5 pb-1 text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase"
            >
              {label}
            </p>
            {entries.map((suggestion) => {
              index += 1;
              const current = index;
              const isActive = current === activeIndex;
              return (
                <div
                  key={`${suggestion.kind}-${suggestion.name}`}
                  id={optionId(current)}
                  role="option"
                  aria-selected={isActive}
                  // mousedown y no click: el click llegaría después del blur
                  // de la caja, cuando la lista ya se cerró.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(suggestion);
                  }}
                  onMouseEnter={() => onHover(current)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-[0.9375rem] text-[var(--text)] ${
                    isActive ? "bg-[var(--bg-subtle)]" : ""
                  }`}
                >
                  <SuggestionIcon kind={suggestion.kind} />
                  <Highlighted text={suggestion.name} query={query} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Lo escrito en peso normal, el resto en negrita: es lo que todavía no se
 * tecleó, o sea, lo que la sugerencia aporta.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <span className="truncate font-medium">{text}</span>;
  return (
    <span className="truncate">
      <span className="font-medium">{text.slice(0, at)}</span>
      {text.slice(at, at + needle.length)}
      <span className="font-medium">{text.slice(at + needle.length)}</span>
    </span>
  );
}

function SuggestionIcon({ kind }: { kind: Suggestion["kind"] }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4 shrink-0 text-[var(--text-tertiary)]",
  };
  if (kind === "store") {
    return (
      <svg {...common}>
        <path d="M4 9.5 5.2 4.5h13.6L20 9.5M4 9.5v10h16v-10M4 9.5h16M9.5 19.5v-6h5v6" />
      </svg>
    );
  }
  if (kind === "category") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="11" cy="11" r="6.4" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}
