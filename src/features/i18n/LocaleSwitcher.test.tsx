import { describe, expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleProvider, useLocale } from "./LocaleContext";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/i18n/LocaleSwitcher.tsx
 * "use client";
 * export function LocaleSwitcher(): JSX.Element;
 *
 * // Must be rendered inside a <LocaleProvider> (it consumes useLocale()
 * // from ./LocaleContext — no CSS classes or data-testid are used to
 * // expose state).
 * //
 * // Renders exactly two controls with role "button" and accessible names
 * // "EN" and "ES" (getByRole("button", { name: "EN" | "ES" })).
 * //
 * // The control matching the currently active locale exposes
 * // aria-pressed="true"; the other control exposes aria-pressed="false".
 * // This is the single accessible-state attribute chosen for this
 * // component — tests below assert ONLY aria-pressed, no data attributes,
 * // no class names.
 * //
 * // Clicking the "ES" button calls setLocale("es"); clicking the "EN"
 * // button calls setLocale("en").
 */

function TranslatedText() {
  const { t } = useLocale();
  return <p>{t("heroTagline")}</p>;
}

describe("Tarea 13 — LocaleSwitcher marks the active language via an accessible state attribute", () => {
  test("by default (locale 'en'), the EN button is pressed and the ES button is not", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    const enButton = screen.getByRole("button", { name: "EN" });
    const esButton = screen.getByRole("button", { name: "ES" });

    expect(enButton).toHaveAttribute("aria-pressed", "true");
    expect(esButton).toHaveAttribute("aria-pressed", "false");
  });

  test("both controls are reachable purely by role and accessible name", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ES" })).toBeInTheDocument();
  });
});

describe("Tarea 14 — clicking the other language updates visible text and the pressed state", () => {
  test("clicking ES changes visible translated text from the en value to the es value", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
        <TranslatedText />
      </LocaleProvider>,
    );

    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ES" }));

    expect(screen.queryByText(en.heroTagline)).not.toBeInTheDocument();
    expect(screen.getByText(es.heroTagline)).toBeInTheDocument();
  });

  test("clicking ES flips aria-pressed on both buttons", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ES" }));

    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking the already-active EN button is a no-op: locale stays 'en' and aria-pressed is unchanged", () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
        <TranslatedText />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "false");
  });
});
