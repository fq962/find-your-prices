import { describe, expect, it } from "vitest";
import { BROWSE_PAGE_SIZE, browsePageCount, browsePageLinks, parseBrowsePage } from "./browsePaging";

describe("browsePageCount", () => {
  it("redondea hacia arriba y nunca baja de una página", () => {
    expect(browsePageCount(0)).toBe(1);
    expect(browsePageCount(1)).toBe(1);
    expect(browsePageCount(BROWSE_PAGE_SIZE)).toBe(1);
    expect(browsePageCount(BROWSE_PAGE_SIZE + 1)).toBe(2);
  });
});

describe("parseBrowsePage", () => {
  it("acepta enteros positivos sin adornos", () => {
    expect(parseBrowsePage("1")).toBe(1);
    expect(parseBrowsePage("37")).toBe(37);
  });

  it("rechaza todo lo que daría una segunda URL para la misma página", () => {
    for (const raw of ["0", "02", "1.0", "+3", "-1", "abc", "", "1e3"]) {
      expect(parseBrowsePage(raw)).toBeNull();
    }
  });
});

describe("browsePageLinks", () => {
  it("con pocas páginas las enlaza todas", () => {
    expect(browsePageLinks(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(browsePageLinks(0, 1)).toEqual([1]);
  });

  it("con muchas enlaza extremos, vecinas y postes, con saltos marcados", () => {
    const links = browsePageLinks(150, 300);
    const pages = links.filter((page): page is number => page !== null);

    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(300);
    for (const page of [148, 149, 150, 151, 152, 30, 60, 270]) expect(pages).toContain(page);
    // Ordenadas y sin repetir.
    expect([...pages].sort((a, b) => a - b)).toEqual(pages);
    expect(new Set(pages).size).toBe(pages.length);
    // Un salto entre dos números no consecutivos, y nunca dos saltos seguidos.
    links.forEach((page, index) => {
      if (page === null) {
        expect(links[index - 1]).not.toBeNull();
        expect(links[index + 1]).not.toBeNull();
      }
    });
  });

  it("deja cualquier página a pocos saltos de la primera", () => {
    const total = 300;
    // Recorrido en anchura siguiendo sólo los enlaces que se pintan.
    const depth = new Map<number, number>([[1, 0]]);
    const queue = [1];
    while (queue.length > 0) {
      const page = queue.shift()!;
      for (const next of browsePageLinks(page, total)) {
        if (next !== null && !depth.has(next)) {
          depth.set(next, depth.get(page)! + 1);
          queue.push(next);
        }
      }
    }
    expect(depth.size).toBe(total);
    expect(Math.max(...depth.values())).toBeLessThanOrEqual(10);
  });
});
