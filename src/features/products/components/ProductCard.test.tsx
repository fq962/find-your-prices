// TAREAS 16-18 — `ProductCard`.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/components/ProductCard.tsx
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra):
//
//   export interface ProductCardProps {
//     product: Product;
//     locale?: string; // se pasa tal cual como 3er argumento de
//                       // `formatPrice(product.price, product.currency, locale)`.
//                       // Si se omite, debe comportarse igual que omitir el
//                       // argumento al llamar a `formatPrice` (su propio
//                       // default interno, "en-US").
//   }
//
//   export function ProductCard({ product, locale }: ProductCardProps): JSX.Element
//
// Reglas de contenido:
//   - `product.name` se renderiza como heading de nivel 3 (<h3> o role
//     "heading" con level 3). Elegido por el Test Writer para mantener una
//     jerarquía consistente dentro de una grilla (la página que la contenga
//     definirá su propio h1/h2).
//   - El precio se formatea con `formatPrice` de "@/lib/format" (mismo
//     output observable que llamar a esa función directamente con
//     product.price, product.currency y el locale recibido).
//   - `product.store` se renderiza como texto visible.
//   - Se renderiza una imagen cuyo `alt` es EXACTAMENTE `product.name`,
//     SOLO cuando `product.imageUrl` está presente.
//   - Cuando `product.imageUrl` está AUSENTE: contrato explícito decidido
//     acá -> NO se renderiza ningún elemento <img> (ni placeholder con
//     role "img"). Cero elementos con role "img" en el DOM.
//   - `product.description`, cuando está presente, se muestra como texto
//     visible (verbatim). Cuando está AUSENTE, no debe quedar ningún nodo
//     relacionado a la descripción en el DOM (nada de "N/A", placeholders,
//     contenedores vacíos, etc.).
//   - `product.availability`, cuando está presente, se muestra como texto
//     visible VERBATIM (es un string libre, NO un enum, no se debe
//     traducir/mapear a otro texto). Cuando está AUSENTE, no debe quedar
//     ningún nodo relacionado a disponibilidad en el DOM.
//
// Los productos se construyen a mano dentro de este archivo (no dependen
// del fixture real de data.ts) para no acoplarse a cambios futuros del
// fixture.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { ProductCard } from "./ProductCard";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Wireless Mouse",
    price: 24.99,
    currency: "USD",
    store: "Amazon",
    category: "Electronics",
    ...overrides,
  };
}

/**
 * Removes every occurrence of each known-good visible text piece from the
 * container's full text content, then strips whitespace and common
 * separator/punctuation characters. What remains, if anything, is text the
 * component rendered that this test did NOT account for -- e.g. a
 * description placeholder ("N/A", "-", empty <p></p> tags contribute
 * nothing so they don't trip this check, but any *textual* leftover does).
 */
function leftoverText(container: HTMLElement, knownGoodPieces: string[]): string {
  let remaining = container.textContent ?? "";
  for (const piece of knownGoodPieces) {
    remaining = remaining.split(piece).join("");
  }
  return remaining.replace(/[\s\-|•·,:()[\]]+/g, "");
}

/**
 * Wraps a `formatPrice(...)` output for use as a `getByText` matcher.
 *
 * `Intl.NumberFormat` can emit a non-breaking space (U+00A0) between the
 * amount and the currency symbol for some locales (e.g. `es-ES` ->
 * "24,99\u00A0US$"). `@testing-library/dom`'s default text normalizer
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

describe("ProductCard", () => {
  it("TAREA 16: renders name as a level-3 heading, formatted price via formatPrice, and store", () => {
    const product = makeProduct({
      name: "Wireless Mouse",
      price: 24.99,
      currency: "USD",
      store: "Amazon",
    });

    render(<ProductCard product={product} locale="en-US" />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Wireless Mouse" })
    ).toBeInTheDocument();

    const expectedPrice = formatPrice(24.99, "USD", "en-US");
    expect(screen.getByText(priceMatcher(expectedPrice))).toBeInTheDocument();

    expect(screen.getByText("Amazon")).toBeInTheDocument();
  });

  it("TAREA 16: formats the price using the given locale (not hardcoded to en-US)", () => {
    const product = makeProduct({ price: 24.99, currency: "USD" });

    render(<ProductCard product={product} locale="es-ES" />);

    const expectedPrice = formatPrice(24.99, "USD", "es-ES");
    expect(screen.getByText(priceMatcher(expectedPrice))).toBeInTheDocument();
    // Sanity check: the es-ES output must differ from the en-US output for
    // this amount, otherwise this test would pass even if `locale` were
    // ignored by the implementation.
    expect(expectedPrice).not.toBe(formatPrice(24.99, "USD", "en-US"));
  });

  it("TAREA 16: falls back to formatPrice's own default locale when `locale` is omitted", () => {
    const product = makeProduct({ price: 89.99, currency: "USD" });

    render(<ProductCard product={product} />);

    const expectedPrice = formatPrice(89.99, "USD");
    expect(screen.getByText(priceMatcher(expectedPrice))).toBeInTheDocument();
  });

  it("TAREA 16: renders an image with alt text equal to the product name when imageUrl is present", () => {
    const product = makeProduct({
      name: "Mechanical Keyboard",
      imageUrl: "/images/mechanical-keyboard.jpg",
    });

    render(<ProductCard product={product} />);

    const img = screen.getByRole("img", { name: "Mechanical Keyboard" });
    const src = img.getAttribute("src");
    expect(src).toBeTruthy();
    expect(src).not.toBe("");
    expect(src).not.toBe("undefined");
    expect(src).not.toBe("null");
  });

  it("TAREA 16 edge case: the image src reflects the product's own imageUrl (not a fixed/shared value)", () => {
    const productA = makeProduct({
      id: "a",
      name: "Product A",
      imageUrl: "/images/product-a.jpg",
    });
    const productB = makeProduct({
      id: "b",
      name: "Product B",
      imageUrl: "/images/product-b.jpg",
    });

    const { unmount } = render(<ProductCard product={productA} />);
    const srcA = screen.getByRole("img", { name: "Product A" }).getAttribute("src");
    unmount();

    render(<ProductCard product={productB} />);
    const srcB = screen.getByRole("img", { name: "Product B" }).getAttribute("src");

    expect(srcA).not.toBe(srcB);
  });

  it("TAREA 16 edge case: renders no <img> element at all when imageUrl is absent", () => {
    const product = makeProduct({ imageUrl: undefined });

    const { container } = render(<ProductCard product={product} />);

    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(container.querySelector("img")).toBeNull();
  });

  it("TAREA 17: shows the description text verbatim when present", () => {
    const product = makeProduct({
      description: "Ergonomic wireless mouse with adjustable DPI settings.",
    });

    render(<ProductCard product={product} />);

    expect(
      screen.getByText("Ergonomic wireless mouse with adjustable DPI settings.")
    ).toBeInTheDocument();
  });

  it("TAREA 17: renders no description-related node when description is absent", () => {
    const product = makeProduct({
      name: "Yoga Mat",
      price: 19.99,
      currency: "USD",
      store: "Target",
      availability: "In stock",
      description: undefined,
    });

    const { container } = render(<ProductCard product={product} locale="en-US" />);

    const expectedPrice = formatPrice(19.99, "USD", "en-US");
    const leftover = leftoverText(container, [
      "Yoga Mat",
      expectedPrice,
      "Target",
      "In stock",
    ]);

    expect(leftover).toBe("");
  });

  it("TAREA 18: shows the availability text verbatim when present (free string, not an enum)", () => {
    const product = makeProduct({ availability: "Ships in 3-5 business days" });

    render(<ProductCard product={product} />);

    expect(screen.getByText("Ships in 3-5 business days")).toBeInTheDocument();
  });

  it("TAREA 18: renders no availability-related node when availability is absent", () => {
    const product = makeProduct({
      name: "Air Fryer",
      price: 79.0,
      currency: "USD",
      store: "Walmart",
      description: "Compact air fryer with digital temperature control.",
      availability: undefined,
    });

    const { container } = render(<ProductCard product={product} locale="en-US" />);

    const expectedPrice = formatPrice(79.0, "USD", "en-US");
    const leftover = leftoverText(container, [
      "Air Fryer",
      expectedPrice,
      "Walmart",
      "Compact air fryer with digital temperature control.",
    ]);

    expect(leftover).toBe("");
  });
});
