import { describe, expect, test } from "vitest";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // vitest.setup.ts (existing file, to be extended)
 * // The shared `afterEach` hook already registered there (currently only
 * // calling `cleanup()` from @testing-library/react) must ALSO clear
 * // `window.localStorage` after every test, so that no test can observe
 * // a key written by a previous test, regardless of which test ran first.
 */

describe("Tarea 1 — window.localStorage is isolated between tests", () => {
  test("starts empty at the beginning of this test (no pollution from a prior file/test)", () => {
    expect(window.localStorage.length).toBe(0);
  });

  test("writing a theme-related key here must not be visible in a later test", () => {
    window.localStorage.setItem("theme", "dark");

    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  test("the key written by the previous test has been cleared automatically", () => {
    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  test("isolation also holds for a second, differently-named key, proving this is a general clear() and not a one-off removal of 'theme'", () => {
    window.localStorage.setItem("color-scheme-override", "light");
    expect(window.localStorage.getItem("color-scheme-override")).toBe("light");
  });

  test("the general clear also removed the second key from the previous test", () => {
    expect(window.localStorage.getItem("color-scheme-override")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});
