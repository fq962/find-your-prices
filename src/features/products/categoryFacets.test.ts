import { describe, expect, test } from "vitest";
import {
  buildCategoryTree,
  categoryLabel,
  UNCATEGORIZED_VALUE,
  type CanonicalCategoryFacetRow,
} from "./categoryFacets";

const row = (
  slug: string | null,
  name: string | null,
  count: number,
  parent?: { slug: string; name: string },
): CanonicalCategoryFacetRow => ({
  slug,
  name,
  count,
  parentSlug: parent?.slug ?? null,
  parentName: parent?.name ?? null,
});

const toys = { slug: "jugueteria-y-juegos", name: "Juguetería y Juegos" };
const grocery = { slug: "abarrotes", name: "Abarrotes" };

describe("buildCategoryTree", () => {
  test("agrupa hijas bajo su raíz y suma el conteo de la raíz", () => {
    const tree = buildCategoryTree([
      row("munecas", "Muñecas", 10, toys),
      row("juegos-de-mesa", "Juegos de mesa", 5, toys),
      row(toys.slug, toys.name, 2),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ value: toys.slug, label: toys.name, count: 17 });
    expect(tree[0].children?.map((child) => child.value)).toEqual(["munecas", "juegos-de-mesa"]);
  });

  test("crea la raíz aunque solo tenga hijas con artículos", () => {
    const tree = buildCategoryTree([row("munecas", "Muñecas", 3, toys)]);
    expect(tree[0]).toMatchObject({ value: toys.slug, label: toys.name, count: 3 });
  });

  test("ordena raíces e hijas por conteo, de mayor a menor", () => {
    const tree = buildCategoryTree([
      row("arroz", "Arroz", 1, grocery),
      row("pastas", "Pastas", 9, grocery),
      row("munecas", "Muñecas", 30, toys),
    ]);

    expect(tree.map((option) => option.value)).toEqual([toys.slug, grocery.slug]);
    expect(tree[1].children?.map((child) => child.value)).toEqual(["pastas", "arroz"]);
  });

  test("lo sin mapear va al final como UNCATEGORIZED_VALUE, sumando todas sus filas", () => {
    const tree = buildCategoryTree([
      row(null, null, 40),
      row("munecas", "Muñecas", 1, toys),
      row(null, null, 2),
    ]);

    expect(tree.at(-1)).toEqual({ value: UNCATEGORIZED_VALUE, count: 42 });
    // Va al final aunque tenga más artículos que cualquier raíz.
    expect(tree[0].value).toBe(toys.slug);
  });

  test("sin artículos sin mapear no hay opción de sin categorizar", () => {
    const tree = buildCategoryTree([row("munecas", "Muñecas", 1, toys)]);
    expect(tree.some((option) => option.value === UNCATEGORIZED_VALUE)).toBe(false);
  });

  test("una raíz sin hijas no lleva children", () => {
    const tree = buildCategoryTree([row(grocery.slug, grocery.name, 4)]);
    expect(tree[0]).toEqual({ value: grocery.slug, label: grocery.name, count: 4 });
  });

  test("ignora filas con conteo cero", () => {
    expect(buildCategoryTree([row("munecas", "Muñecas", 0, toys), row(null, null, 0)])).toEqual([]);
  });
});

describe("categoryLabel", () => {
  const tree = buildCategoryTree([row("munecas", "Muñecas", 1, toys)]);

  test("resuelve raíces e hijas", () => {
    expect(categoryLabel(tree, toys.slug)).toBe(toys.name);
    expect(categoryLabel(tree, "munecas")).toBe("Muñecas");
  });

  test("devuelve el valor cuando no está en el árbol", () => {
    expect(categoryLabel(tree, "otra")).toBe("otra");
  });
});
