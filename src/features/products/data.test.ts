// TAREA 1 — Fixture de productos tipada.
//
// Contrato esperado (implementer debe crear estos archivos):
//   - src/types/index.ts: extender la interface `Product` existente con los
//     campos obligatorios/opcionales descritos abajo. NO tocar `PricePoint`.
//   - src/features/products/data.ts: exportar `export const products: Product[]`
//     con un fixture estático que cumpla las reglas de este test.
//
// Forma final esperada de `Product` (según lo confirmado por el usuario):
//   interface Product {
//     id: string;              // obligatorio
//     name: string;            // obligatorio
//     price: number;           // obligatorio
//     currency: string;        // obligatorio (usar DEFAULT_CURRENCY)
//     store: string;           // obligatorio
//     category: string;        // obligatorio
//     imageUrl?: string;       // opcional
//     availability?: string;   // opcional, string libre (NO enum)
//     description?: string;    // opcional
//   }
//
// Este test NO importa el tipo `Product` para no acoplarse a un tipo que
// todavía no existe/está extendido; solo verifica la forma en runtime del
// fixture exportado por `data.ts`.

import { describe, expect, it } from "vitest";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { products } from "@/features/products/data";

describe("products fixture (src/features/products/data.ts)", () => {
  it("exports an array with at least 8 products", () => {
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThanOrEqual(8);
  });

  it("every product has all required fields with the correct primitive type", () => {
    for (const product of products) {
      expect(typeof product.id).toBe("string");
      expect(product.id.length).toBeGreaterThan(0);

      expect(typeof product.name).toBe("string");
      expect(product.name.length).toBeGreaterThan(0);

      expect(typeof product.price).toBe("number");
      expect(Number.isFinite(product.price)).toBe(true);

      expect(typeof product.currency).toBe("string");
      expect(product.currency.length).toBeGreaterThan(0);

      expect(typeof product.store).toBe("string");
      expect(product.store.length).toBeGreaterThan(0);

      expect(typeof product.category).toBe("string");
      expect(product.category.length).toBeGreaterThan(0);
    }
  });

  it("uses DEFAULT_CURRENCY from src/lib/constants for every product's currency", () => {
    for (const product of products) {
      expect(product.currency).toBe(DEFAULT_CURRENCY);
    }
  });

  it("has every id unique (products are used as list keys downstream)", () => {
    const ids = products.map((product: { id: string }) => product.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("contains at least 3 distinct stores", () => {
    const stores = new Set(products.map((product: { store: string }) => product.store));
    expect(stores.size).toBeGreaterThanOrEqual(3);
  });

  it("contains at least 3 distinct categories", () => {
    const categories = new Set(
      products.map((product: { category: string }) => product.category)
    );
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it("has at least one product without a description", () => {
    const withoutDescription = products.filter(
      (product: { description?: string }) => product.description === undefined
    );
    expect(withoutDescription.length).toBeGreaterThanOrEqual(1);
  });

  it("has at least one product without an availability value", () => {
    const withoutAvailability = products.filter(
      (product: { availability?: string }) => product.availability === undefined
    );
    expect(withoutAvailability.length).toBeGreaterThanOrEqual(1);
  });

  it("has at least one product without an imageUrl", () => {
    const withoutImageUrl = products.filter(
      (product: { imageUrl?: string }) => product.imageUrl === undefined
    );
    expect(withoutImageUrl.length).toBeGreaterThanOrEqual(1);
  });

  it("only sets optional fields (description, availability, imageUrl) as strings when present", () => {
    for (const product of products) {
      if (product.description !== undefined) {
        expect(typeof product.description).toBe("string");
      }
      if (product.availability !== undefined) {
        expect(typeof product.availability).toBe("string");
      }
      if (product.imageUrl !== undefined) {
        expect(typeof product.imageUrl).toBe("string");
      }
    }
  });
});
