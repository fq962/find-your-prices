import { describe, expect, it } from "vitest";
import type { CategoryNode, CategoryPageData } from "@/server/services/categoryPages";
import {
  categoryBreadcrumbs,
  categoryDescription,
  categoryKeywords,
  categoryPaths,
  categoryTitle,
} from "./categorySeo";

function node(overrides: Partial<CategoryNode> = {}): CategoryNode {
  return {
    id: "c1",
    slug: "herramientas",
    name: "Herramientas",
    parentId: null,
    level: 0,
    position: 0,
    imageUrl: null,
    imageAlt: null,
    featuredPosition: null,
    productCount: 2352,
    content: { title: null, metaDescription: null, intro: null, body: null, keywords: [] },
    ...overrides,
  };
}

const facets: CategoryPageData["facets"] = {
  total: 2352,
  discounted: 100,
  minPrice: 10,
  maxPrice: 5000,
  stores: [
    { value: "Diunsa", count: 1200 },
    { value: "Larach", count: 1152 },
  ],
  brands: [],
};

describe("categorySeo", () => {
  it("las rutas comparten slug en los dos idiomas", () => {
    expect(categoryPaths("herramientas")).toEqual({
      es: "/categorias/herramientas",
      en: "/en/categories/herramientas",
    });
  });

  it("sin texto editorial, título y descripción salen de las cifras reales", () => {
    const category = node();
    const children = [node({ slug: "taladros", name: "Taladros" })];
    expect(categoryTitle(category, "es")).toBe("Herramientas: precios en Honduras");
    const description = categoryDescription({ category, facets, children }, "es");
    // Intl en es-HN separa miles con coma: "2,352".
    expect(description).toMatch(/2[,.\s ]?352/);
    expect(description).toContain("2 tiendas");
    expect(description).toContain("Taladros");
  });

  it("el texto editorial manda sobre la fórmula", () => {
    const category = node({
      content: {
        title: "Herramientas baratas en Honduras",
        metaDescription: "Mi descripción.",
        intro: null,
        body: null,
        keywords: ["taladro percutor"],
      },
    });
    expect(categoryTitle(category, "es")).toBe("Herramientas baratas en Honduras");
    expect(categoryDescription({ category, facets, children: [] }, "es")).toBe("Mi descripción.");
    const keywords = categoryKeywords(category, "es");
    expect(keywords[0]).toBe("taladro percutor");
    expect(keywords).toContain("precio de herramientas");
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it("las migas incluyen a la madre cuando es una hija", () => {
    const parent = node();
    const child = node({ id: "c2", slug: "taladros", name: "Taladros", parentId: "c1", level: 1 });
    expect(categoryBreadcrumbs(child, parent, "en").map((item) => item.path)).toEqual([
      "/en",
      "/en/categories",
      "/en/categories/herramientas",
      "/en/categories/taladros",
    ]);
  });
});
