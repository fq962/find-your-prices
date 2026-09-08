import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "./LocaleContext";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/i18n/LocaleSwitcher.tsx
 * "use client";
 * export function LocaleSwitcher(): JSX.Element;
 *
 * // Must be rendered inside a <LocaleProvider> (it reads the active locale
 * // from useLocale() — no CSS classes or data-testid are used to expose
 * // state).
 * //
 * // CAMBIO DE CONTRATO (idioma en la URL)
 * // -------------------------------------
 * // El contrato original de la Tarea 13/14 describía dos <button> que
 * // llamaban a setLocale() y cambiaban el idioma en memoria. El producto
 * // pasó a servir cada idioma en su propia ruta ("/" en español, "/en" en
 * // inglés), así que el switcher dejó de ser un toggle de estado y pasó a
 * // ser navegación real: dos enlaces a las rutas canónicas de cada idioma.
 * //
 * // Por eso ahora:
 * //   - Renderiza exactamente dos controles con role "link" y nombre
 * //     accesible "EN" y "ES".
 * //   - Cada enlace apunta a la ruta canónica de su idioma: "/" (es, el
 * //     default sin prefijo) y "/en".
 * //   - El enlace del idioma activo expone aria-current="page"; el otro no
 * //     expone el atributo. Es el único atributo de estado accesible que
 * //     estos tests miran — ni clases ni data-attributes.
 * //
 * // `setLocale` sigue existiendo en LocaleContext (ver LocaleContext.test),
 * // pero ya no es lo que este componente usa.
 */

describe("Tarea 13 — LocaleSwitcher marca el idioma activo con un atributo accesible", () => {
  test("con el locale 'en' (default del provider), EN es el enlace actual y ES no", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "ES" })).not.toHaveAttribute("aria-current");
  });

  test("con initialLocale='es', ES es el enlace actual y EN no", () => {
    render(
      <LocaleProvider initialLocale="es">
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "EN" })).not.toHaveAttribute("aria-current");
  });

  test("ambos controles son alcanzables sólo por rol y nombre accesible", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ES" })).toBeInTheDocument();
  });
});

describe("Tarea 14 — cada idioma apunta a su ruta canónica", () => {
  test("EN apunta a /en y ES a / (el español es el default sin prefijo)", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("href", "/");
  });

  test("los destinos no dependen del idioma activo: son rutas fijas, no un toggle", () => {
    render(
      <LocaleProvider initialLocale="es">
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("href", "/");
  });

  test("cada enlace declara el idioma de su destino con hrefLang", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("hreflang", "en");
    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("hreflang", "es");
  });
});
