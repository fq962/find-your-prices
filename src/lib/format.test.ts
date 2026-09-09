import { describe, expect, test } from "vitest";
import { discountPercent, formatPrice } from "./format";

describe("formatPrice", () => {
  test("formats a USD amount", () => {
    expect(formatPrice(1999.9, "USD")).toBe("$1,999.90");
  });

  // TAREA 15 — Characterization test: fixes the exact es-ES output of
  // Intl.NumberFormat in this runtime (Node v22 / the ICU bundled with it)
  // BEFORE any UI depends on it. The expected string below was obtained by
  // actually running, in this environment:
  //   node -e "console.log(JSON.stringify(new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(1999.9)))"
  // -> "1999,90 US$"
  // ...and confirming, via codePointAt, that the space between "90" and
  // "US$" is U+00A0 (NO-BREAK SPACE) — NOT a regular space (U+0020) and NOT
  // a narrow no-break space (U+202F). It is written below using the
  // explicit \u00a0 escape so the invisible character can never be silently
  // mangled by an editor/formatter.
  test("formats a USD amount for the es-ES locale", () => {
    expect(formatPrice(1999.9, "USD", "es-ES")).toBe("1999,90\u00a0US$");
  });
});

describe("discountPercent", () => {
  test("computes the percentage drop", () => {
    expect(discountPercent(100, 75)).toBe(25);
  });

  test("returns 0 when the original price is not positive", () => {
    expect(discountPercent(0, 50)).toBe(0);
  });
});

// Endurecimiento — la moneda la pone cada tienda vía scraping
// (`item.prices?.currency_code || store.default_currency`), así que llega
// texto libre. `Intl.NumberFormat` no devuelve un error con esos valores:
// lanza un `RangeError`. Y como el precio se pinta dentro de un componente
// cliente, ese throw desmontaba el árbol entero y dejaba el catálogo en
// blanco. Estas pruebas fijan que formatPrice NUNCA lance.
describe("formatPrice — datos que vienen de las tiendas", () => {
  const NOT_ISO = ["L", "L.", "Lempiras", "", "   ", "12", "HNLL"];

  test.each(NOT_ISO)("no lanza con la moneda %j y muestra el importe", (currency) => {
    expect(() => formatPrice(1299, currency, "es-HN")).not.toThrow();
    expect(formatPrice(1299, currency, "es-HN")).toContain("1,299.00");
  });

  test("conserva el código tal como llegó cuando no es ISO", () => {
    expect(formatPrice(1299, "L", "es-HN")).toBe("L 1,299.00");
  });

  test("sin código no inventa ninguno", () => {
    expect(formatPrice(1299, "", "es-HN")).toBe("1,299.00");
  });

  test("no lanza con un locale mal formado", () => {
    expect(() => formatPrice(1299, "HNL", "es_HN")).not.toThrow();
    expect(() => formatPrice(1299, "L", "es_HN")).not.toThrow();
  });

  test("un importe que no es un número se muestra como cero, no como 'NaN'", () => {
    expect(formatPrice(Number.NaN, "HNL", "es-HN")).not.toContain("NaN");
    expect(formatPrice(Number.POSITIVE_INFINITY, "L", "es-HN")).not.toContain("∞");
  });

  test("una moneda ISO en minúsculas sigue funcionando", () => {
    expect(formatPrice(1299, "hnl", "es-HN")).toBe(formatPrice(1299, "HNL", "es-HN"));
  });
});
