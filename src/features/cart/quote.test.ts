import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import { buildQuote, offerToProduct, quoteNumber } from "./quote";
import type { CartLine, QuoteLineResult, QuoteOffer } from "./types";

const line = (id: string, overrides: Partial<Product> = {}, quantity = 1): CartLine => ({
  product: {
    id,
    name: `Producto ${id}`,
    price: 10,
    currency: "HNL",
    store: "Walmart Honduras",
    storeSlug: "walmarthn",
    category: "Abarrotes",
    storeCategory: "Granos",
    ...overrides,
  },
  quantity,
  addedAt: "2026-10-01T00:00:00Z",
});

const offer = (id: string, overrides: Partial<QuoteOffer> = {}): QuoteOffer => ({
  id,
  name: `Producto ${id}`,
  store: "Walmart Honduras",
  storeSlug: "walmarthn",
  storeCategory: "Granos",
  price: 10,
  currency: "HNL",
  availability: "in_stock",
  priceSeenAt: "2026-10-05T00:00:00Z",
  ...overrides,
});

const results = (...entries: QuoteLineResult[]) =>
  new Map(entries.map((entry) => [entry.id, entry]));

describe("buildQuote", () => {
  it("groups by store, then by store category, biggest stop first", () => {
    const lines = [
      line("a", { store: "La Mundial", storeSlug: "mundial", storeCategory: "Herramientas" }),
      line("b", { storeCategory: "Granos" }, 2),
      line("c", { storeCategory: "Lácteos" }),
      line("d", { storeCategory: "Granos" }),
    ];
    const quote = buildQuote(lines, null);

    expect(quote.groups.map((group) => group.storeSlug)).toEqual(["walmarthn", "mundial"]);
    const walmart = quote.groups[0];
    expect(walmart.sections.map((section) => [section.category, section.items.length])).toEqual([
      ["Granos", 2],
      ["Lácteos", 1],
    ]);
    expect(walmart.subtotal).toEqual({ HNL: 40 });
    expect(walmart.units).toBe(4);
    expect(quote.total).toEqual({ HNL: 50 });
    expect(quote.storeCount).toBe(2);
  });

  it("puts uncategorized items last within a stop", () => {
    const quote = buildQuote([line("a", { storeCategory: undefined, category: "" }), line("b")], null);
    expect(quote.groups[0].sections.map((section) => section.category)).toEqual(["Granos", null]);
  });

  it("uses fresh prices and reports changes", () => {
    const quote = buildQuote(
      [line("a", {}, 3)],
      results({ id: "a", offer: offer("a", { price: 12.5 }), alternatives: [] }),
    );
    const item = quote.groups[0].items[0];
    expect(item.fresh).toBe(true);
    expect(item.priceDelta).toBe(2.5);
    expect(item.subtotal).toBe(37.5);
    expect(quote.changedCount).toBe(1);
  });

  it("moves a line to the store of the fresh offer", () => {
    const quote = buildQuote(
      [line("a")],
      results({ id: "a", offer: offer("a", { store: "Paiz", storeSlug: "paiz" }), alternatives: [] }),
    );
    expect(quote.groups[0].storeSlug).toBe("paiz");
  });

  it("excludes unavailable lines from totals", () => {
    const quote = buildQuote(
      [line("a"), line("b")],
      results({ id: "a", offer: null, alternatives: [] }),
    );
    expect(quote.unavailableCount).toBe(1);
    expect(quote.total).toEqual({ HNL: 10 });
  });

  it("treats a missing entry as unknown, not unavailable", () => {
    const quote = buildQuote(
      [line("a"), line("b")],
      results({ id: "a", offer: offer("a"), alternatives: [] }),
    );
    expect(quote.unavailableCount).toBe(0);
    expect(quote.groups[0].items[1].fresh).toBe(false);
  });

  it("suggests a cheaper store and sums savings", () => {
    const cheaper = offer("p", { store: "Paiz", storeSlug: "paiz", price: 8 });
    const quote = buildQuote(
      [line("a", {}, 2)],
      results({ id: "a", offer: offer("a"), alternatives: [cheaper] }),
    );
    expect(quote.groups[0].items[0].better?.id).toBe("p");
    expect(quote.savings).toEqual({ HNL: 4 });
    expect(quote.swaps).toEqual([{ fromId: "a", offer: cheaper }]);
  });

  it("does not suggest a pricier store for an available item", () => {
    const quote = buildQuote(
      [line("a")],
      results({
        id: "a",
        offer: offer("a"),
        alternatives: [offer("p", { storeSlug: "paiz", price: 11 })],
      }),
    );
    expect(quote.groups[0].items[0].better).toBeUndefined();
  });
});

describe("offerToProduct", () => {
  it("keeps what the quote needs", () => {
    const product = offerToProduct(offer("a", { storeCategory: "Granos", category: "Abarrotes" }));
    expect(product).toMatchObject({
      id: "a",
      storeCategory: "Granos",
      category: "Abarrotes",
      storeSlug: "walmarthn",
    });
  });
});

describe("quoteNumber", () => {
  it("is stable for the same cart and day", () => {
    const date = new Date("2026-10-06T15:00:00Z");
    expect(quoteNumber([line("a")], date)).toBe(quoteNumber([line("a")], date));
    expect(quoteNumber([line("a")], date)).toMatch(/^FYP-261006-[0-9A-Z]{4}$/);
    expect(quoteNumber([line("a")], date)).not.toBe(quoteNumber([line("a", {}, 2)], date));
  });
});
