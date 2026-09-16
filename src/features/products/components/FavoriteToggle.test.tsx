import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Product } from "@/types";
import { readFavorites, writeFavorites } from "@/features/products/favorites";
import { FavoriteToggle } from "./FavoriteToggle";

const product: Product = {
  id: "p1",
  name: "Wireless Mouse",
  price: 24.99,
  currency: "HNL",
  store: "Diunsa",
  category: "Electrónica",
};

const labels = { add: "Agregar a favoritos", remove: "Quitar de favoritos" };

beforeEach(() => {
  window.localStorage.clear();
  writeFavorites([]);
});

describe("FavoriteToggle", () => {
  it("empieza sin marcar y con la etiqueta de agregar", () => {
    render(<FavoriteToggle product={product} labels={labels} />);
    const button = screen.getByRole("button", { name: "Agregar a favoritos: Wireless Mouse" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("un clic guarda el favorito y cambia a la etiqueta de quitar; otro lo quita", () => {
    render(<FavoriteToggle product={product} labels={labels} />);
    const button = screen.getByTestId("favorite-toggle");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-label", "Quitar de favoritos: Wireless Mouse");
    expect(readFavorites().map((p) => p.id)).toEqual(["p1"]);

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(readFavorites()).toEqual([]);
  });

  it("no deja que el clic navegue cuando vive dentro de un enlace", () => {
    render(
      <a href="/ficha">
        <FavoriteToggle product={product} labels={labels} />
      </a>,
    );
    const event = fireEvent.click(screen.getByTestId("favorite-toggle"));
    // fireEvent devuelve false cuando algún handler llamó a preventDefault.
    expect(event).toBe(false);
  });

  it("refleja lo que ya estaba guardado al montar", () => {
    writeFavorites([product]);
    render(<FavoriteToggle product={product} labels={labels} />);
    expect(screen.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "true");
  });
});
