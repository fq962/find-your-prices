import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleProvider, useLocale } from "./LocaleContext";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/i18n/LocaleContext.tsx
 * "use client";
 * import type { ReactNode } from "react";
 * import type { Locale, DictionaryKey } from "./translate";
 *
 * export function LocaleProvider(props: { children: ReactNode }): JSX.Element;
 *
 * export function useLocale(): {
 *   locale: Locale;           // defaults to "en" when no ancestor called setLocale
 *   setLocale: (locale: Locale) => void;
 *   t: (key: DictionaryKey) => string; // delegates to translate(locale, key) from ./translate
 * };
 *
 * // Calling useLocale() with no ancestor <LocaleProvider> MUST throw a
 * // descriptive Error synchronously during render (not return `undefined`
 * // or a context shaped with undefined fields that explodes elsewhere).
 */

function Consumer() {
  const { locale, t } = useLocale();
  return (
    <div>
      <p data-role="locale-readout">locale:{locale}</p>
      <p>{t("siteTitle")}</p>
      <p>{t("heroTagline")}</p>
    </div>
  );
}

function ConsumerWithSwitch() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <p data-role="locale-readout">locale:{locale}</p>
      <p>{t("heroTagline")}</p>
      <button type="button" onClick={() => setLocale("es")}>
        switch to es
      </button>
    </div>
  );
}

describe("Tarea 11 — LocaleProvider default locale is 'en'", () => {
  test("a consumer rendered inside LocaleProvider, with no extra config, sees locale === 'en'", () => {
    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>,
    );

    expect(screen.getByText("locale:en")).toBeInTheDocument();
  });

  test("t() delegates to translate(), returning the real en dictionary's values for the active locale", () => {
    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>,
    );

    expect(screen.getByText(en.siteTitle)).toBeInTheDocument();
    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();
  });
});

describe("Tarea 11 — useLocale() called outside of LocaleProvider", () => {
  test("throws a descriptive error instead of silently returning undefined", () => {
    // React logs the thrown-during-render error to console.error; this is
    // expected noise for this specific test and is suppressed intentionally.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow();

    consoleError.mockRestore();
  });
});

describe("Tarea 12 — setLocale('es') updates consumers", () => {
  test("clicking a control that calls setLocale('es') switches t('heroTagline') to the es dictionary value", () => {
    render(
      <LocaleProvider>
        <ConsumerWithSwitch />
      </LocaleProvider>,
    );

    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "switch to es" }));

    expect(screen.queryByText(en.heroTagline)).not.toBeInTheDocument();
    expect(screen.getByText(es.heroTagline)).toBeInTheDocument();
  });

  test("the `locale` value read from the hook itself updates to 'es', not just derived text", () => {
    render(
      <LocaleProvider>
        <ConsumerWithSwitch />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "switch to es" }));

    expect(screen.getByText("locale:es")).toBeInTheDocument();
    expect(screen.queryByText("locale:en")).not.toBeInTheDocument();
  });

  test("a sanity guard: en.heroTagline and es.heroTagline must differ, otherwise the previous two assertions would be meaningless", () => {
    expect(en.heroTagline).not.toBe(es.heroTagline);
  });
});
