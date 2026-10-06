import { describe, expect, it } from "vitest";
import { decodeCart, encodeCart } from "./share";

const A = "0b6f4a52-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
const B = "ffffffff-0000-4000-8000-123456789abc";

describe("share", () => {
  it("round-trips ids and quantities compactly", () => {
    const encoded = encodeCart([
      { id: A, quantity: 3 },
      { id: B, quantity: 999 },
    ]);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).toHaveLength(48);
    expect(decodeCart(encoded)).toEqual([
      { id: A, quantity: 3 },
      { id: B, quantity: 999 },
    ]);
  });

  it("skips invalid ids when encoding", () => {
    const encoded = encodeCart([
      { id: "nope", quantity: 1 },
      { id: A, quantity: 1 },
    ]);
    expect(decodeCart(encoded)).toEqual([{ id: A, quantity: 1 }]);
  });

  it("tolerates garbage and truncated links", () => {
    expect(decodeCart(null)).toEqual([]);
    expect(decodeCart("!!!")).toEqual([]);
    const encoded = encodeCart([
      { id: A, quantity: 2 },
      { id: B, quantity: 1 },
    ]);
    expect(decodeCart(encoded.slice(0, 30))).toEqual([{ id: A, quantity: 2 }]);
  });
});
