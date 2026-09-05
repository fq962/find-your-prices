// TAREAS 21+22 — `SearchBar`.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/components/SearchBar.tsx
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra):
//
//   "use client";
//
//   export interface SearchBarProps {
//     onQueryChange: (query: string) => void;
//   }
//
//   export function SearchBar({ onQueryChange }: SearchBarProps): JSX.Element
//
// Decisiones de diseño explícitas (contrato para el implementer):
//
//   1. El componente consume `useLocale()` de
//      "@/features/i18n/LocaleContext" internamente para obtener `t`. NO
//      recibe `locale` ni `t` por props — por eso debe renderizarse
//      siempre dentro de un `<LocaleProvider>`, y por eso es
//      obligatoriamente "use client" (Context no es válido en un Server
//      Component).
//
//   2. El input es `<input type="search">` (rol accesible "searchbox").
//      Se eligió `type="search"` (en vez de `type="text"`) porque es
//      semánticamente correcto para este caso de uso (aporta el botón de
//      limpiar nativo en algunos navegadores, `enterkeyhint="search"`
//      implícito en móvil, etc).
//
//   3. El nombre accesible del input viene de `aria-label={t("searchPlaceholder")}`,
//      NO solo de un `placeholder` visual. Un `placeholder` por sí solo no
//      es una fuente confiable de nombre accesible (no todos los
//      navegadores/AT lo exponen como accessible name), así que el
//      `aria-label` es la fuente de verdad que estos tests verifican vía
//      `getByRole("searchbox", { name })`. El implementer puede además
//      poner el mismo texto como `placeholder` visual si quiere, pero eso
//      no es lo que se testea aquí.
//
//   4. El componente mantiene el texto tecleado en estado interno (no es
//      un input controlado desde afuera: no hay prop `value`). Internamente
//      debe pasar ese estado por `useDebounce` de "@/hooks/useDebounce"
//      usando el delay POR DEFECTO del hook (300ms, ver
//      src/hooks/useDebounce.ts) — no se expone ningún prop de
//      `debounceMs` en este contrato, así que estos tests avanzan los
//      fake timers exactamente 300ms.
//
//   5. `onQueryChange` se invoca SOLO cuando el valor debounced cambia
//      como consecuencia de que el usuario tecleó algo — NUNCA en el
//      montaje inicial (con el string vacío por defecto). Esto es lo que
//      hace que el test de "TAREA 22" pueda afirmar "se invoca UNA sola
//      vez con 'shoe'": si además se disparara una llamada en el montaje
//      con "", el conteo total sería 2, no 1.
//
// Nota sobre timers falsos: `@testing-library/user-event` NO está entre
// las devDependencies de este proyecto (ver package.json), así que estos
// tests usan `fireEvent.change`, que es síncrono y determinista, en vez de
// `userEvent.type`. Los fake timers se activan/restauran SOLO dentro del
// describe de debounce para no contaminar otros archivos de test.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/features/i18n/LocaleContext";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";
import { SearchBar } from "./SearchBar";

function LocaleSwitchHarness() {
  const { setLocale } = useLocale();
  return (
    <>
      <SearchBar onQueryChange={() => {}} />
      <button type="button" onClick={() => setLocale("es")}>
        switch to es
      </button>
    </>
  );
}

describe("TAREA 21 — SearchBar's accessible name tracks the active locale", () => {
  it("sanity guard: en.searchPlaceholder and es.searchPlaceholder must differ, otherwise locale-switch assertions below would be meaningless", () => {
    expect(en.searchPlaceholder).not.toBe(es.searchPlaceholder);
  });

  it("renders a searchbox whose accessible name equals t('searchPlaceholder') for the default locale ('en')", () => {
    render(
      <LocaleProvider>
        <SearchBar onQueryChange={() => {}} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("searchbox", { name: en.searchPlaceholder })).toBeInTheDocument();
  });

  it("after switching to 'es', the searchbox's accessible name updates to the es dictionary value", () => {
    render(
      <LocaleProvider>
        <LocaleSwitchHarness />
      </LocaleProvider>,
    );

    expect(screen.getByRole("searchbox", { name: en.searchPlaceholder })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "switch to es" }));

    expect(screen.queryByRole("searchbox", { name: en.searchPlaceholder })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: es.searchPlaceholder })).toBeInTheDocument();
  });
});

describe("TAREA 22 — SearchBar debounces onQueryChange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call onQueryChange on mount, even after the debounce delay elapses with no input", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();

    render(
      <LocaleProvider>
        <SearchBar onQueryChange={onQueryChange} />
      </LocaleProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("typing 'shoe' one character at a time calls onQueryChange exactly once, with the final value 'shoe' — not once per keystroke", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();

    render(
      <LocaleProvider>
        <SearchBar onQueryChange={onQueryChange} />
      </LocaleProvider>,
    );

    const input = screen.getByRole("searchbox", { name: en.searchPlaceholder });

    fireEvent.change(input, { target: { value: "s" } });
    fireEvent.change(input, { target: { value: "sh" } });
    fireEvent.change(input, { target: { value: "sho" } });
    fireEvent.change(input, { target: { value: "shoe" } });

    // Nothing fires yet: the debounce delay has not elapsed.
    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith("shoe");
  });

  it("edge case: the debounce timer resets on every keystroke — advancing time by less than the delay after the last keystroke never fires the callback", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();

    render(
      <LocaleProvider>
        <SearchBar onQueryChange={onQueryChange} />
      </LocaleProvider>,
    );

    const input = screen.getByRole("searchbox", { name: en.searchPlaceholder });

    fireEvent.change(input, { target: { value: "s" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // A second keystroke arrives before the 300ms delay from the first
    // one elapsed — this must restart the delay, not add to it.
    fireEvent.change(input, { target: { value: "sh" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith("sh");
  });

  it("edge case: clearing the input back to an empty string eventually calls onQueryChange with ''", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();

    render(
      <LocaleProvider>
        <SearchBar onQueryChange={onQueryChange} />
      </LocaleProvider>,
    );

    const input = screen.getByRole("searchbox", { name: en.searchPlaceholder });

    fireEvent.change(input, { target: { value: "shoe" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onQueryChange).toHaveBeenNthCalledWith(1, "shoe");

    fireEvent.change(input, { target: { value: "" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onQueryChange).toHaveBeenCalledTimes(2);
    expect(onQueryChange).toHaveBeenNthCalledWith(2, "");
  });
});
