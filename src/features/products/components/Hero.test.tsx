// TAREAS 33-34 — `Hero`.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/components/Hero.tsx
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra):
//
//   "use client"; // consume useLocale() del Context, no recibe el idioma
//                  // por props.
//
//   export function Hero(): JSX.Element
//
// Reglas de contenido y estructura:
//   - Renderiza EXACTAMENTE UN elemento con role "heading" y level 1, cuyo
//     nombre accesible es `t("siteTitle")`.
//   - Renderiza el tagline `t("heroTagline")` en un elemento que NO es ese
//     heading de nivel 1 (ni ningún otro heading; el árbol completo debe
//     tener un único role "heading" level 1, y el tagline debe vivir fuera
//     de él).
//   - El Hero debe exponer una landmark region identificable por rol
//     accesible. Contrato elegido acá por el Test Writer: `role="banner"`
//     (equivalente accesible nativo de <header> cuando no está anidado
//     dentro de <article>/<section>/etc. -- ver
//     https://www.w3.org/TR/wai-aria-1.2/#banner). El implementer puede
//     usar un <header> de nivel superior (no anidado en otro landmark) o
//     asignar role="banner" explícitamente a otro contenedor; lo único que
//     los tests verifican es `getByRole("banner")` envolviendo tanto el
//     heading como el tagline.
//   - Debe reaccionar a cambios de locale desde LocaleProvider: al cambiar
//     el locale, título y tagline deben reflejar los valores del
//     diccionario correspondiente (comparados contra los diccionarios
//     importados, nunca contra literales en español/inglés escritos a
//     mano en este archivo).
//
// Fuera de alcance / NO testeado acá (ver docblock del Test Writer más
// abajo para la justificación): espaciado, centrado visual, contraste,
// animaciones, clases de Tailwind o estilos inline. jsdom no calcula
// layout, así que cualquier assertion sobre eso sería un test frágil que
// no prueba nada real. Queda para code review humano.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/features/i18n/LocaleContext";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";
import { Hero } from "./Hero";

function LocaleSwitchProbe() {
  const { setLocale } = useLocale();
  return (
    <button type="button" onClick={() => setLocale("es")}>
      switch-to-es
    </button>
  );
}

describe("Hero", () => {
  it("TAREA 33: renders exactly one h1 (role heading level 1) whose text is t('siteTitle')", () => {
    render(
      <LocaleProvider>
        <Hero />
      </LocaleProvider>,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(en.siteTitle);
  });

  it("TAREA 33: with the default locale, the h1 text is literally 'Find Your Prices'", () => {
    render(
      <LocaleProvider>
        <Hero />
      </LocaleProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Find Your Prices",
    );
  });

  it("TAREA 33: renders the tagline t('heroTagline') in an element that is NOT the level-1 heading", () => {
    render(
      <LocaleProvider>
        <Hero />
      </LocaleProvider>,
    );

    // The whole rendered tree must contain exactly one heading, and it
    // must be the h1 asserted above -- so the tagline text node, wherever
    // it lives, cannot itself be (or be inside) a heading role.
    const headings = screen.getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(en.siteTitle);
    expect(headings[0]).not.toHaveTextContent(en.heroTagline);

    const taglineNode = screen.getByText(en.heroTagline);
    expect(taglineNode).toBeInTheDocument();
    expect(taglineNode.closest('[role="heading"], h1, h2, h3, h4, h5, h6')).toBeNull();
  });

  it("TAREA 34: exposes a banner landmark that contains both the h1 and the tagline", () => {
    render(
      <LocaleProvider>
        <Hero />
      </LocaleProvider>,
    );

    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("heading", { level: 1 })).toHaveTextContent(
      en.siteTitle,
    );
    expect(within(banner).getByText(en.heroTagline)).toBeInTheDocument();
  });

  it("TAREA 34: there is exactly one banner landmark in the rendered tree", () => {
    render(
      <LocaleProvider>
        <Hero />
      </LocaleProvider>,
    );

    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("TAREA 34: switching the locale to 'es' updates the tagline to the es dictionary value, and the h1 stays consistent and unique", () => {
    // Non-emptiness guard: if en.heroTagline and es.heroTagline were equal,
    // this test could pass trivially without the component actually
    // reacting to locale changes.
    expect(en.heroTagline).not.toBe(es.heroTagline);

    render(
      <LocaleProvider>
        <Hero />
        <LocaleSwitchProbe />
      </LocaleProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.siteTitle);
    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();

    // fireEvent.click (unlike a raw DOM `.click()`) wraps the dispatch in
    // `act()`, which flushes the resulting re-render synchronously. With a
    // raw `.click()`, React 19 + jsdom schedules the second render in a
    // microtask that runs *after* the assertions below, so they'd observe
    // the stale, pre-switch DOM and the test would fail for the wrong
    // reason (or pass/fail nondeterministically depending on timing).
    fireEvent.click(screen.getByRole("button", { name: "switch-to-es" }));

    // NOTE on why this test does NOT assert the h1 text changed to
    // `es.siteTitle`: by design (see the comment in
    // `dictionaries/es.ts`), `en.siteTitle === es.siteTitle === "Find Your
    // Prices"` -- the product name is not translated. An assertion like
    // `toHaveTextContent(es.siteTitle)` here would be vacuously true even
    // if the component never reacted to the locale change at all, since
    // the English text already satisfies it. `heroTagline` is the only
    // dictionary key that actually differs between `en` and `es`, so it is
    // the only reliable signal of a real locale switch; the h1 assertions
    // below only pin that it remains present, correct, and unique.
    expect(screen.queryByText(en.heroTagline)).not.toBeInTheDocument();
    expect(screen.getByText(es.heroTagline)).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.siteTitle);

    // Still exactly one h1 and one banner after the locale switch --
    // guards against the implementation mounting a second, stale Hero
    // instance instead of re-rendering in place.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("TAREA 33/34: throws when rendered outside of a LocaleProvider (inherited contract from useLocale())", () => {
    // Hero is "use client" and consumes useLocale() directly -- it does
    // not receive the locale via props. This test pins that contract: it
    // must not silently fall back to a hardcoded locale/dictionary.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Hero />)).toThrow(
      "useLocale must be used within a LocaleProvider",
    );

    consoleError.mockRestore();
  });
});
