import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  addToCart,
  MAX_CART_LINES,
  MAX_QUANTITY,
  normalizeCart,
  removeFromCart,
  replaceInCart,
  setQuantity,
} from "./cart";

const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  name: `Producto ${id}`,
  price: 10,
  currency: "HNL",
  store: "Walmart",
  category: "Varios",
  ...overrides,
});

const NOW = new Date("2026-10-06T12:00:00Z");

describe("cart", () => {
  it("adds at the end and sums quantity instead of duplicating", () => {
    let lines = addToCart([], product("a"), 1, NOW);
    lines = addToCart(lines, product("b"), 2, NOW);
    lines = addToCart(lines, product("a"), 3, NOW);
    expect(lines.map((line) => [line.product.id, line.quantity])).toEqual([
      ["a", 4],
      ["b", 2],
    ]);
  });

  it("clamps quantities", () => {
    const lines = addToCart([], product("a"), 1, NOW);
    expect(setQuantity(lines, "a", 0)[0].quantity).toBe(1);
    expect(setQuantity(lines, "a", 5000)[0].quantity).toBe(MAX_QUANTITY);
  });

  it("removes a line", () => {
    const lines = addToCart(addToCart([], product("a")), product("b"));
    expect(removeFromCart(lines, "a").map((line) => line.product.id)).toEqual(["b"]);
  });

  it("replaces keeping quantity and position", () => {
    let lines = addToCart([], product("a"), 3, NOW);
    lines = addToCart(lines, product("b"), 1, NOW);
    const swapped = replaceInCart(lines, "a", product("c", { store: "Paiz" }), NOW);
    expect(swapped.map((line) => [line.product.id, line.quantity])).toEqual([
      ["c", 3],
      ["b", 1],
    ]);
  });

  it("merges when the replacement is already in the cart", () => {
    let lines = addToCart([], product("a"), 3, NOW);
    lines = addToCart(lines, product("b"), 1, NOW);
    const merged = replaceInCart(lines, "a", product("b"), NOW);
    expect(merged.map((line) => [line.product.id, line.quantity])).toEqual([["b", 4]]);
  });

  it("normalizes garbage from storage", () => {
    const raw = [
      { product: product("a"), quantity: 2, addedAt: "2026-01-01T00:00:00Z" },
      { product: { id: "x" }, quantity: 1 },
      { product: product("a"), quantity: 1 },
      { product: product("b"), quantity: "nope", addedAt: "bad" },
      null,
    ];
    const lines = normalizeCart(raw);
    expect(lines.map((line) => [line.product.id, line.quantity])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(lines[1].addedAt).toBe(new Date(0).toISOString());
    expect(normalizeCart("nope")).toEqual([]);
  });

  it("caps the number of lines", () => {
    const raw = Array.from({ length: MAX_CART_LINES + 5 }, (_, index) => ({
      product: product(String(index)),
      quantity: 1,
      addedAt: NOW.toISOString(),
    }));
    expect(normalizeCart(raw)).toHaveLength(MAX_CART_LINES);
  });
});
