import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryProse } from "./CategoryProse";

/**
 * El Markdown mínimo del cuerpo SEO: subtítulos reales, párrafos, listas y
 * negrita. Y, sobre todo, que el HTML crudo NO se interprete.
 */
describe("CategoryProse", () => {
  it("convierte ## en h2, párrafos y listas", () => {
    render(
      <CategoryProse
        text={"## Dónde comprar\n\nPrimer párrafo con **énfasis**.\n\n- uno\n- dos\n\n### Detalle"}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Dónde comprar");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Detalle");
    expect(screen.getByText("énfasis").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("no interpreta HTML: un script queda como texto", () => {
    const { container } = render(<CategoryProse text={"<script>alert(1)</script> hola"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
});
