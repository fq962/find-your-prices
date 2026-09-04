import { describe, expect, test } from "vitest";
import { discountPercent, formatPrice } from "./format";

describe("formatPrice", () => {
  test("formats a USD amount", () => {
    expect(formatPrice(1999.9, "USD")).toBe("$1,999.90");
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
