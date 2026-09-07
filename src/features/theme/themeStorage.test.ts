import { describe, expect, test } from "vitest";
import {
  THEME_STORAGE_KEY,
  readStoredThemePreference,
  writeStoredThemePreference,
  clearStoredThemePreference,
} from "./themeStorage";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/theme/themeStorage.ts (new, pure module — no React, no DOM
 * // APIs beyond `window.localStorage`)
 *
 * export type ThemePreference = "light" | "dark" | "system";
 *
 * // The single source of truth for the localStorage key name. Task 10's
 * // inline anti-FOUC `<script>` must use this exact same string literal
 * // (it cannot import this module at runtime in the `<head>`, but its
 * // Test Writer/Implementer must copy this value verbatim — divergence is
 * // a bug the Task 10 tests will catch).
 * export const THEME_STORAGE_KEY: string;
 *
 * // Reads the user's explicit stored preference.
 * // - Returns null when nothing has ever been written (or after clearing).
 * // - Returns null (never throws, never returns the raw value) when the
 * //   raw string found under THEME_STORAGE_KEY is anything other than
 * //   exactly "light" | "dark" | "system" — this includes empty string,
 * //   garbage strings, and anything case-mismatched.
 * export function readStoredThemePreference(): ThemePreference | null;
 *
 * // Persists the user's explicit choice under THEME_STORAGE_KEY.
 * export function writeStoredThemePreference(preference: ThemePreference): void;
 *
 * // Removes any stored preference. Calling it when nothing is stored must
 * // not throw.
 * export function clearStoredThemePreference(): void;
 */

describe("Tarea 2 — THEME_STORAGE_KEY", () => {
  test("is exported as a non-empty string", () => {
    expect(typeof THEME_STORAGE_KEY).toBe("string");
    expect(THEME_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

describe("Tarea 2 — readStoredThemePreference before any write", () => {
  test("reports 'no preference' (null) when localStorage has never been touched", () => {
    expect(window.localStorage.length).toBe(0);
    expect(readStoredThemePreference()).toBeNull();
  });
});

describe("Tarea 2 — writeStoredThemePreference + readStoredThemePreference round-trip", () => {
  test("after saving 'light', reading returns 'light'", () => {
    writeStoredThemePreference("light");

    expect(readStoredThemePreference()).toBe("light");
  });

  test("after saving 'dark', reading returns 'dark'", () => {
    writeStoredThemePreference("dark");

    expect(readStoredThemePreference()).toBe("dark");
  });

  test("after saving 'system', reading returns 'system'", () => {
    writeStoredThemePreference("system");

    expect(readStoredThemePreference()).toBe("system");
  });

  test("writing persists under THEME_STORAGE_KEY specifically (contract Task 10 relies on)", () => {
    writeStoredThemePreference("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  test("a second write overwrites the first — reading reflects only the latest choice", () => {
    writeStoredThemePreference("dark");
    writeStoredThemePreference("light");

    expect(readStoredThemePreference()).toBe("light");
  });
});

describe("Tarea 2 — clearStoredThemePreference", () => {
  test("after saving then clearing, reading reports 'no preference' (null) again", () => {
    writeStoredThemePreference("light");
    clearStoredThemePreference();

    expect(readStoredThemePreference()).toBeNull();
  });

  test("removes the underlying key entirely, not just blanks it", () => {
    writeStoredThemePreference("system");
    clearStoredThemePreference();

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  test("calling it when nothing was ever stored does not throw", () => {
    expect(() => clearStoredThemePreference()).not.toThrow();
    expect(readStoredThemePreference()).toBeNull();
  });
});

describe("Tarea 2 — unexpected/invalid storage contents are treated as 'no preference'", () => {
  test("a seeded invalid string ('purple') makes reading report null, not throw and not echo it back", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");

    expect(() => readStoredThemePreference()).not.toThrow();
    expect(readStoredThemePreference()).toBeNull();
  });

  test("a seeded empty string is also treated as 'no preference'", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "");

    expect(readStoredThemePreference()).toBeNull();
  });

  test("a seeded case-mismatched value ('Light') is treated as 'no preference', not normalized", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "Light");

    expect(readStoredThemePreference()).toBeNull();
  });
});
