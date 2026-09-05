// TAREAS 23+24 — `StoreFilter`.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/components/StoreFilter.tsx
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra):
//
//   "use client";
//
//   export interface StoreFilterProps {
//     stores: string[];          // normalmente getFacets(products).stores
//                                 // (ya único + ordenado), pero el
//                                 // componente NO debe asumir eso: solo
//                                 // renderiza lo que recibe.
//     selectedStore?: string;    // valor actualmente activo. `undefined`
//                                 // significa "todas las tiendas" (así
//                                 // encaja directo con
//                                 // `ProductFilterCriteria.store`, donde
//                                 // ausente = sin filtro).
//     onChange: (store: string | undefined) => void;
//   }
//
//   export function StoreFilter({ stores, selectedStore, onChange }: StoreFilterProps): JSX.Element
//
// Decisión de diseño explícita (contrato para el implementer):
//
//   Control elegido: `<select>` nativo, NO un grupo de botones/radios.
//   Motivo: en mobile un `<select>` nativo dispara el picker del sistema
//   operativo (más usable con una lista de tiendas que puede crecer), y
//   por defecto ya expone rol accesible "combobox" y soporta navegación
//   por teclado sin trabajo adicional. Un grupo de botones escala peor
//   quando la cantidad de tiendas crece y requeriría más código de
//   accesibilidad manual (roving tabindex, aria-pressed, etc).
//
//   Estructura exacta de las `<option>` (parte del contrato, no un detalle
//   interno arbitrario: sin esto no es posible interactuar de forma
//   determinista con `fireEvent.change`, ya que este proyecto no tiene
//   `@testing-library/user-event` instalado):
//     - Una opción con `value=""` y texto accesible `t("filterAllOption")`
//       para "todas las tiendas".
//     - Una opción por cada string de `stores`, con `value={store}` y
//       texto igual a `store`.
//   El componente traduce en el handler de `onChange`: si el nuevo
//   `event.target.value` es `""`, se llama `onChange(undefined)`; en caso
//   contrario se llama `onChange(store)` con el string tal cual.
//
//   El nombre accesible del `<select>` (rol "combobox") viene de
//   `t("storeFilterLabel")` — vía `<label>` asociado o `aria-label`, a
//   elección del implementer (los tests solo verifican el nombre accesible
//   resultante, no el mecanismo).
//
//   El `<select>` es un componente controlado: su `value` refleja
//   `selectedStore ?? ""`.

import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/features/i18n/LocaleContext";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";
import { StoreFilter } from "./StoreFilter";

const STORES = ["Amazon", "Best Buy", "Target"];

function LocaleSwitchHarness() {
  const { setLocale } = useLocale();
  return (
    <>
      <StoreFilter stores={STORES} onChange={() => {}} />
      <button type="button" onClick={() => setLocale("es")}>
        switch to es
      </button>
    </>
  );
}

describe("TAREA 23 — StoreFilter renders one option per store plus an 'all' option", () => {
  it("sanity guard: en.storeFilterLabel/filterAllOption differ from their es counterparts, otherwise locale assertions below would be meaningless", () => {
    expect(en.storeFilterLabel).not.toBe(es.storeFilterLabel);
    expect(en.filterAllOption).not.toBe(es.filterAllOption);
  });

  it("exposes an accessible combobox named after t('storeFilterLabel')", () => {
    render(
      <LocaleProvider>
        <StoreFilter stores={STORES} onChange={() => {}} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("combobox", { name: en.storeFilterLabel })).toBeInTheDocument();
  });

  it("renders exactly one <option> per store, plus one 'all' option labeled t('filterAllOption')", () => {
    render(
      <LocaleProvider>
        <StoreFilter stores={STORES} onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.storeFilterLabel });
    const options = within(select).getAllByRole("option");

    expect(options).toHaveLength(STORES.length + 1);
    expect(within(select).getByRole("option", { name: en.filterAllOption })).toBeInTheDocument();
    for (const store of STORES) {
      expect(within(select).getByRole("option", { name: store })).toBeInTheDocument();
    }
  });

  it("edge case: with an empty stores list, renders only the 'all' option and never crashes", () => {
    render(
      <LocaleProvider>
        <StoreFilter stores={[]} onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.storeFilterLabel });
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

    const select = screen.getByRole("combobox", { name: es.storeFilterLabel });
    expect(select).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: es.filterAllOption })).toBeInTheDocument();
  });
});

describe("TAREA 24 — selecting a store calls onChange with the exact value; selecting 'all' calls onChange with undefined", () => {
  it("selecting a specific store option calls onChange with that store's exact string", () => {
    const onChange = vi.fn();

    render(
      <LocaleProvider>
        <StoreFilter stores={STORES} onChange={onChange} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.storeFilterLabel });
    fireEvent.change(select, { target: { value: "Best Buy" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Best Buy");
  });

  it("selecting the 'all' option calls onChange with undefined, not an empty string", () => {
    const onChange = vi.fn();

    render(
      <LocaleProvider>
        <StoreFilter stores={STORES} selectedStore="Amazon" onChange={onChange} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.storeFilterLabel });
    fireEvent.change(select, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
    // Guards against a common bug: emitting "" (string) instead of the
    // `undefined` sentinel this contract requires.
    expect(onChange).not.toHaveBeenCalledWith("");
  });

  it("with no `selectedStore` prop, the select's current value defaults to the 'all' option (empty string)", () => {
    render(
      <LocaleProvider>
        <StoreFilter stores={STORES} onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.storeFilterLabel });
    expect(select).toHaveValue("");
  });

  it("with `selectedStore` set, the select's current value reflects it", () => {
    render(
      <LocaleProvider>
        <StoreFilter stores={STORES} selectedStore="Target" onChange={() => {}} />
      </LocaleProvider>,
    );

    const select = screen.getByRole("combobox", { name: en.storeFilterLabel });
    expect(select).toHaveValue("Target");
  });
});
