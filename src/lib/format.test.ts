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
