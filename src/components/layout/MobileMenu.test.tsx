import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import { MobileMenu } from "./MobileMenu";

function mount(locale: "es" | "en" = "es") {
  return render(
    <LocaleProvider initialLocale={locale}>
      <MobileMenu />
    </LocaleProvider>,
  );
}

describe("MobileMenu", () => {
  it("cerrado no muestra los destinos; abierto enlaza categorías y tiendas del idioma", () => {
    mount("es");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByTestId("mobile-menu-button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Categorías" })).toHaveAttribute("href", "/categorias");
    expect(screen.getByRole("menuitem", { name: "Tiendas" })).toHaveAttribute("href", "/tiendas");
  });

  it("en inglés usa las rutas en inglés", () => {
    mount("en");
    fireEvent.click(screen.getByTestId("mobile-menu-button"));
    expect(screen.getByRole("menuitem", { name: "Stores" })).toHaveAttribute("href", "/en/stores");
  });

  it("se cierra con Escape y al elegir un destino", () => {
    mount("es");
    const button = screen.getByTestId("mobile-menu-button");
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Tiendas" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
