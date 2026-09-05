// TAREA 19 — `ProductGrid`.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/components/ProductGrid.tsx
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra):
//
//   export interface ProductGridProps {
//     products: Product[];
//     locale?: string; // se propaga tal cual a cada `ProductCard`.
//     emptyMessage?: string; // TAREA 20, ver bloque de diseño más abajo.
//   }
//
//   export function ProductGrid({ products, locale, emptyMessage }: ProductGridProps): JSX.Element
//
// Reglas:
//   - Renderiza una lista semántica: un contenedor con role "list" (p.ej.
//     <ul>) y un elemento con role "listitem" (p.ej. <li>) por cada
//     producto del array `products`.
//   - Dentro de cada "listitem" se renderiza la `ProductCard` del producto
//     correspondiente (mismo comportamiento verificado en
//     ProductCard.test.tsx: heading con el nombre, precio formateado con
//     formatPrice).
//   - El orden de los "listitem" en el DOM es EXACTAMENTE el orden del
//     array `products` recibido (no se reordena por ningún criterio).
//   - Con `products = []`: se sigue renderizando el contenedor con role
//     "list", pero con CERO elementos "listitem". El contenedor "list"
//     NUNCA desaparece, ni con productos ni sin ellos (ver TAREA 20 más
//     abajo sobre cómo convive con el mensaje de estado vacío).
//
// Los productos se construyen a mano dentro de este archivo (no dependen
// del fixture real de data.ts) para no acoplarse a cambios futuros del
// fixture.
//
// ---------------------------------------------------------------------
// TAREA 20 — Empty state localizado.
// ---------------------------------------------------------------------
//
// DECISIÓN DE DISEÑO (contrato para el implementer, justificada aquí):
//
//   `ProductGrid` NO consume `useLocale()` ni importa nada de
//   "@/features/i18n/*". Sigue siendo un componente presentacional puro,
//   renderizable como Server Component (sin "use client"), tal como hoy.
//
//   El mensaje de "sin resultados" llega por la prop opcional
//   `emptyMessage?: string`, ya traducido por quien orquesta (un
//   componente cliente que sí tiene acceso a `useLocale()`/`t()`, p.ej. la
//   futura página que compone SearchBar + StoreFilter + CategoryFilter +
//   ProductGrid). `ProductGrid` solo renderiza el string que recibe, tal
//   cual, sin saber en qué idioma está.
//
//   Se prefirió esto sobre llamar a `useLocale()` dentro de `ProductGrid`
//   porque:
//     1. Mantiene a `ProductGrid` como Server Component candidato (no
//        fuerza "use client" solo por un mensaje de texto).
//     2. Evita una dependencia dura de `ProductGrid` hacia el Context de
//        i18n: sigue siendo reusable con cualquier fuente de texto
//        (i18n, testing, storybook, etc.) sin necesitar un
//        `<LocaleProvider>` envolvente.
//     3. Es consistente con el prop `locale?: string` que YA existe hoy:
//        `ProductGrid` ya recibe datos derivados del locale activo por
//        props, en vez de leerlo él mismo del Context.
//
//   Comportamiento exacto:
//     - El contenedor "list" SIEMPRE se renderiza, tenga productos o no
//       (no se reemplaza por el mensaje: conviven). Esto preserva el test
//       ya verde de "array vacío -> role 'list' con cero 'listitem'" tal
//       cual, sin debilitarlo.
//     - Si `products.length === 0` Y se pasó un `emptyMessage` truthy, ese
//       texto se renderiza en el DOM (visible vía `getByText`), ADEMÁS del
//       contenedor "list" vacío.
//     - Si `products.length === 0` y `emptyMessage` es `undefined` (no se
//       pasó), no se renderiza ningún mensaje de estado vacío — el
//       comportamiento por defecto es idéntico al que ya tenía el
//       componente antes de esta tarea.
//     - Si `products.length > 0`, `emptyMessage` (aunque se haya pasado)
//       NUNCA se renderiza, ni siquiera de forma oculta con texto
//       accesible: no debe aparecer en el DOM.

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";
import { ProductGrid } from "./ProductGrid";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Default Product",
    price: 10,
    currency: "USD",
    store: "Store A",
    category: "Category A",
    ...overrides,
  };
}

/**
 * Wraps a `formatPrice(...)` output for use as a `getByText` matcher.
 *
 * `Intl.NumberFormat` can emit a non-breaking space (U+00A0) between the
 * amount and the currency symbol for some locales (e.g. `es-ES` ->
 * "24,99 US$"). `@testing-library/dom`'s default text normalizer
 * collapses whatever whitespace it reads FROM THE DOM (including NBSP --
 * it's part of JS's `\s` regex class) into a single regular space before
 * comparing, but it does NOT run that same normalization over a plain
 * string matcher passed to `getByText`. That asymmetry makes a *correct*
 * NBSP-containing `formatPrice` output fail to match its own rendered
 * text. A matcher function receives the already-normalized DOM text as
 * its first argument, so we only need to normalize our expected string
 * the same way before comparing. This does not weaken the assertion: it
 * still requires an exact match of the full formatted string (amount +
 * separator + currency symbol), just tolerant to NBSP vs regular space.
 */
function priceMatcher(expected: string) {
  const normalizeSpace = (text: string) => text.replace(/\s+/g, " ").trim();
  const normalizedExpected = normalizeSpace(expected);
  return (content: string) => normalizeSpace(content) === normalizedExpected;
}

describe("ProductGrid", () => {
  it("TAREA 19: renders exactly one card per product, in the same order as the input array", () => {
    const products = [
      makeProduct({ id: "1", name: "Alpha" }),
      makeProduct({ id: "2", name: "Beta" }),
      makeProduct({ id: "3", name: "Gamma" }),
    ];

    render(<ProductGrid products={products} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    const namesInOrder = items.map(
      (item) => within(item).getByRole("heading", { level: 3 }).textContent
    );
    expect(namesInOrder).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("TAREA 19: the wrapping container exposes an accessible \"list\" role", () => {
    const products = [makeProduct({ id: "1", name: "Alpha" })];

    render(<ProductGrid products={products} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("TAREA 19: each list item actually renders the corresponding product's card content", () => {
    const products = [
      makeProduct({
        id: "1",
        name: "Wireless Mouse",
        price: 24.99,
        currency: "USD",
        store: "Amazon",
      }),
      makeProduct({
        id: "2",
        name: "Mechanical Keyboard",
        price: 89.99,
        currency: "USD",
        store: "Best Buy",
      }),
    ];

    render(<ProductGrid products={products} locale="en-US" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(
      within(items[0]).getByRole("heading", { level: 3, name: "Wireless Mouse" })
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByText(priceMatcher(formatPrice(24.99, "USD", "en-US")))
    ).toBeInTheDocument();
    expect(within(items[0]).getByText("Amazon")).toBeInTheDocument();

    expect(
      within(items[1]).getByRole("heading", { level: 3, name: "Mechanical Keyboard" })
    ).toBeInTheDocument();
    expect(
      within(items[1]).getByText(priceMatcher(formatPrice(89.99, "USD", "en-US")))
    ).toBeInTheDocument();
    expect(within(items[1]).getByText("Best Buy")).toBeInTheDocument();
  });

  it("TAREA 19: propagates the `locale` prop down to each card's price formatting", () => {
    const products = [
      makeProduct({ id: "1", name: "Wireless Mouse", price: 24.99, currency: "USD" }),
    ];

    render(<ProductGrid products={products} locale="es-ES" />);

    const expectedPrice = formatPrice(24.99, "USD", "es-ES");
    expect(screen.getByText(priceMatcher(expectedPrice))).toBeInTheDocument();
  });

  it("edge case: with an empty products array, renders the list container with zero list items and does not crash", () => {
    render(<ProductGrid products={[]} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("TAREA 20 — localized empty state via the `emptyMessage` prop", () => {
  it("sanity guard: en.noResultsMessage and es.noResultsMessage must differ, otherwise the locale-agnostic assertion below would be meaningless", () => {
    expect(en.noResultsMessage).not.toBe(es.noResultsMessage);
  });

  it("renders the given emptyMessage text when products is empty", () => {
    render(<ProductGrid products={[]} emptyMessage={en.noResultsMessage} />);

    expect(screen.getByText(en.noResultsMessage)).toBeInTheDocument();
  });

  it("the 'list' container is still present, with zero list items, even while the empty message is shown", () => {
    render(<ProductGrid products={[]} emptyMessage={en.noResultsMessage} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(en.noResultsMessage)).toBeInTheDocument();
  });

  it("does NOT render any empty-state text when products is empty and emptyMessage is omitted (default, backward-compatible behavior)", () => {
    render(<ProductGrid products={[]} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByText(en.noResultsMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(es.noResultsMessage)).not.toBeInTheDocument();
  });

  it("does NOT render emptyMessage when products is non-empty, even if the prop is provided", () => {
    const products = [makeProduct({ id: "1", name: "Alpha" })];

    render(<ProductGrid products={products} emptyMessage={en.noResultsMessage} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(en.noResultsMessage)).not.toBeInTheDocument();
  });

  it("renders whatever string is passed via emptyMessage verbatim, proving the component does not hardcode a locale itself", () => {
    const { rerender } = render(<ProductGrid products={[]} emptyMessage={en.noResultsMessage} />);
    expect(screen.getByText(en.noResultsMessage)).toBeInTheDocument();

    rerender(<ProductGrid products={[]} emptyMessage={es.noResultsMessage} />);
    expect(screen.queryByText(en.noResultsMessage)).not.toBeInTheDocument();
    expect(screen.getByText(es.noResultsMessage)).toBeInTheDocument();
  });
});
