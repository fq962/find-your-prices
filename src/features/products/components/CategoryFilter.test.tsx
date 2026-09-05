// TAREAS 25+26 — `CategoryFilter`.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/components/CategoryFilter.tsx
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra): análogo a `StoreFilter` (ver StoreFilter.test.tsx para el
// razonamiento completo de cada decisión), sustituyendo tiendas por
// categorías:
//
//   "use client";
//
//   export interface CategoryFilterProps {
//     categories: string[];          // normalmente getFacets(products).categories
//     selectedCategory?: string;     // `undefined` = "todas las categorías"
//     onChange: (category: string | undefined) => void;
//   }
//
//   export function CategoryFilter({ categories, selectedCategory, onChange }: CategoryFilterProps): JSX.Element
//
// Decisiones de diseño explícitas (mismas que StoreFilter, repetidas aquí
// por trazabilidad 1 a 1 tarea → test, sin que este archivo dependa de
// StoreFilter.tsx):
//
//   - Control: `<select>` nativo (rol accesible "combobox"), mismo
//     razonamiento de accesibilidad/mobile que StoreFilter.
//   - Opciones: una con `value=""` y texto `t("filterAllOption")` para
//     "todas las categorías", más una por cada string de `categories` con
//     `value={category}` y texto igual a `category`.
//   - El handler de `onChange` traduce `""` a `undefined` antes de invocar
//     la prop `onChange`.
//   - Nombre accesible del `<select>` viene de `t("categoryFilterLabel")`
//     (vía `<label>` o `aria-label`, a elección del implementer).
//   - Componente controlado: `value` del `<select>` refleja
//     `selectedCategory ?? ""`.

import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/features/i18n/LocaleContext";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";
import { CategoryFilter } from "./CategoryFilter";

const CATEGORIES = ["Electronics", "Home", "Apparel"];

function LocaleSwitchHarness() {
  const { setLocale } = useLocale();
  return (
    <>
      <CategoryFilter categories={CATEGORIES} onChange={() => {}} />
      <button type="button" onClick={() => setLocale("es")}>
        switch to es
      </button>
    </>
  );
}

describe("TAREA 25 — CategoryFilter renders one option per category plus an 'all' option", () => {
  it("sanity guard: en.categoryFilterLabel/filterAllOption differ from their es counterparts, otherwise locale assertions below would be meaningless", () => {
    expect(en.categoryFilterLabel).not.toBe(es.categoryFilterLabel);
    expect(en.filterAllOption).not.toBe(es.filterAllOption);
  });

  it("exposes an accessible combobox named after t('categoryFilterLabel')", () => {
    render(
      <LocaleProvider>
        <CategoryFilter categories={CATEGORIES} onChange={() => {}} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("combobox", { name: en.categoryFilterLabel })).toBeInTheDocument();
  });

  it("renders exactly one <option> per category, plus one 'all' option labeled t('filterAllOption')", () => {
    render(
      <LocaleProvider>
        <CategoryFilter categories={CATEGORIES} onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.categoryFilterLabel });
    const options = within(select).getAllByRole("option");

    expect(options).toHaveLength(CATEGORIES.length + 1);
    expect(within(select).getByRole("option", { name: en.filterAllOption })).toBeInTheDocument();
    for (const category of CATEGORIES) {
      expect(within(select).getByRole("option", { name: category })).toBeInTheDocument();
    }
  });

  it("edge case: with an empty categories list, renders only the 'all' option and never crashes", () => {
    render(
      <LocaleProvider>
        <CategoryFilter categories={[]} onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.categoryFilterLabel });
    const options = within(select).getAllByRole("option");

    expect(options).toHaveLength(1);
    expect(within(select).getByRole("option", { name: en.filterAllOption })).toBeInTheDocument();
  });

  it("after switching to 'es', the combobox's accessible name and the 'all' option's text update to the es dictionary values", () => {
    render(
      <LocaleProvider>
        <LocaleSwitchHarness />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "switch to es" }));

    const select = screen.getByRole("combobox", { name: es.categoryFilterLabel });
    expect(select).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: es.filterAllOption })).toBeInTheDocument();
  });
});

describe("TAREA 26 — selecting a category calls onChange with the exact value; selecting 'all' calls onChange with undefined", () => {
  it("selecting a specific category option calls onChange with that category's exact string", () => {
    const onChange = vi.fn();

    render(
      <LocaleProvider>
        <CategoryFilter categories={CATEGORIES} onChange={onChange} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.categoryFilterLabel });
    fireEvent.change(select, { target: { value: "Home" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Home");
  });

  it("selecting the 'all' option calls onChange with undefined, not an empty string", () => {
    const onChange = vi.fn();

    render(
      <LocaleProvider>
        <CategoryFilter categories={CATEGORIES} selectedCategory="Electronics" onChange={onChange} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.categoryFilterLabel });
    fireEvent.change(select, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
    // Guards against a common bug: emitting "" (string) instead of the
    // `undefined` sentinel this contract requires.
    expect(onChange).not.toHaveBeenCalledWith("");
  });

  it("with no `selectedCategory` prop, the select's current value defaults to the 'all' option (empty string)", () => {
    render(
      <LocaleProvider>
        <CategoryFilter categories={CATEGORIES} onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.categoryFilterLabel });
    expect(select).toHaveValue("");
  });

  it("with `selectedCategory` set, the select's current value reflects it", () => {
    render(
      <LocaleProvider>
        <CategoryFilter categories={CATEGORIES} selectedCategory="Apparel" onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.categoryFilterLabel });
    expect(select).toHaveValue("Apparel");
  });
});
