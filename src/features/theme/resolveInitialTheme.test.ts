import { describe, expect, test, vi } from "vitest";
import type { ThemePreference } from "./themeStorage";
import { resolveInitialTheme } from "./resolveInitialTheme";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/theme/resolveInitialTheme.ts (new, PURE module — no
 * // localStorage access, no `window.matchMedia` call. Task 10's inline
 * // anti-FOUC `<script>` cannot import modules at runtime in `<head>`, so
 * // it must copy this exact decision logic verbatim; keeping this function
 * // pure/argument-driven is what makes that copy trustworthy.)
 *
 * // Note: the second parameter's type is intentionally the inline literal
 * // union below, NOT an import of Task 3's `SystemColorScheme` type from
 * // `./colorScheme` — Task 4 only declares a dependency on Task 2 (the
 * // `ThemePreference` type/validity contract), not on Task 3, and Task 3 is
 * // being built in parallel by another agent in this same directory.
 * // Task 3's `SystemColorScheme` is structurally `"light" | "dark"` too, so
 * // the Implementer may freely substitute it later — that is not a breaking
 * // change against this contract.
 *
 * // Resolves the concrete theme ("dark" | "light") that the page must
 * // render, from:
 * // - `storedPreference`: the user's explicitly saved choice, or `null` if
 * //   nothing valid is stored (reuses Task 2's `ThemePreference | null`
 * //   contract verbatim — see themeStorage.ts).
 * // - `systemColorScheme`: the OS's current preference, already resolved to
 * //   a concrete `"light" | "dark"` value by the caller (never `"system"`).
 * //
 * // Decision table (all six required cases):
 * //   storedPreference | systemColorScheme | result
 * //   null             | "light"           | "dark"
 * //   null             | "dark"            | "dark"
 * //   "light"          | "dark"            | "light"
 * //   "dark"           | "light"           | "dark"
 * //   "system"         | "dark"            | "dark"
 * //   "system"         | "light"           | "light"
 * //
 * // Must NOT read `window.localStorage` or call `window.matchMedia` itself
 * // — both inputs are only ever supplied as arguments. Return value is
 * // always a concrete theme, never `"system"`.
 * export function resolveInitialTheme(
 *   storedPreference: ThemePreference | null,
 *   systemColorScheme: "light" | "dark",
 * ): "light" | "dark";
 */

describe("Tarea 4 — resolveInitialTheme: sin preferencia guardada, default siempre dark", () => {
  test("(sin valor guardado, SO light) => 'dark' — default dark gana incluso con SO en claro", () => {
    expect(resolveInitialTheme(null, "light")).toBe("dark");
  });

  test("(sin valor guardado, SO dark) => 'dark'", () => {
    expect(resolveInitialTheme(null, "dark")).toBe("dark");
  });
});

describe("Tarea 4 — resolveInitialTheme: preferencia explícita 'light'/'dark' guardada gana sobre el SO", () => {
  test("('light' guardado, SO dark) => 'light' — la preferencia explícita ignora el SO", () => {
    expect(resolveInitialTheme("light", "dark")).toBe("light");
  });

  test("('dark' guardado, SO light) => 'dark' — la preferencia explícita ignora el SO", () => {
    expect(resolveInitialTheme("dark", "light")).toBe("dark");
  });
});

describe("Tarea 4 — resolveInitialTheme: preferencia 'system' guardada delega en el SO", () => {
  test("('system' guardado, SO dark) => 'dark'", () => {
    expect(resolveInitialTheme("system", "dark")).toBe("dark");
  });

  test("('system' guardado, SO light) => 'light'", () => {
    expect(resolveInitialTheme("system", "light")).toBe("light");
  });
});

describe("Tarea 4 — resolveInitialTheme es una función pura (contrato explícito del plan)", () => {
  test("no lee window.localStorage para decidir el resultado", () => {
    const getItemSpy = vi.spyOn(window.localStorage, "getItem");

    // Nada sembrado en localStorage a propósito: si la función necesitara
    // leer storage por su cuenta para acertar, este test fallaría por
    // devolver un resultado incorrecto o por invocar getItem.
    expect(resolveInitialTheme("light", "dark")).toBe("light");

    expect(getItemSpy).not.toHaveBeenCalled();
  });

  test("no llama a window.matchMedia para decidir el resultado", () => {
    const matchMediaSpy = vi.spyOn(window, "matchMedia");

    // El mock global de matchMedia no se toca (no se llama a
    // setPrefersColorScheme) a propósito: el valor de SO llega únicamente
    // por argumento.
    expect(resolveInitialTheme(null, "light")).toBe("dark");

    expect(matchMediaSpy).not.toHaveBeenCalled();
  });

  test("llamadas repetidas con los mismos argumentos devuelven siempre el mismo resultado (determinista, sin estado oculto)", () => {
    const inputs: [ThemePreference | null, "light" | "dark"] = ["system", "dark"];

    const first = resolveInitialTheme(...inputs);
    const second = resolveInitialTheme(...inputs);

    expect(first).toBe("dark");
    expect(second).toBe("dark");
  });
});

describe("Tarea 4 — el resultado nunca es 'system' (siempre un tema concreto)", () => {
  test.each<[ThemePreference | null, "light" | "dark"]>([
    [null, "light"],
    [null, "dark"],
    ["light", "dark"],
    ["dark", "light"],
    ["system", "dark"],
    ["system", "light"],
  ])("storedPreference=%s, systemColorScheme=%s => nunca 'system'", (stored, system) => {
    const result = resolveInitialTheme(stored, system);

    expect(result === "light" || result === "dark").toBe(true);
  });
});
