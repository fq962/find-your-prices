import { describe, expect, test, vi } from "vitest";
import { setPrefersColorScheme } from "../../test/matchMedia";
import { getSystemColorScheme, subscribeToSystemColorScheme } from "./colorScheme";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/theme/colorScheme.ts (new, pure module — reads the OS
 * // preference through `window.matchMedia("(prefers-color-scheme: dark)")`
 * // only; no localStorage, no ThemeProvider/React dependency)
 *
 * export type SystemColorScheme = "light" | "dark";
 *
 * // Reads the OS preference AT THE MOMENT OF THE CALL. Must re-query
 * // `window.matchMedia(...)` (or otherwise re-read the live value) every
 * // time it is invoked — it must NOT return a value captured from a
 * // `MediaQueryList` reference obtained on a previous call, because in
 * // production a stale reference is a stale VALUE the instant the OS
 * // preference changes without a page reload in between calls.
 * export function getSystemColorScheme(): SystemColorScheme;
 *
 * // Subscribes to live OS preference changes with no polling involved:
 * // notification must happen synchronously, inside the same call stack
 * // that fires the underlying `change` event, not on a later tick/timer.
 * // Returns an unsubscribe function; calling it stops further
 * // notifications to that specific callback and must not throw, including
 * // if called more than once.
 * export function subscribeToSystemColorScheme(
 *   callback: (scheme: SystemColorScheme) => void,
 * ): () => void;
 */

describe("Tarea 3 — getSystemColorScheme reports the current OS preference", () => {
  test("reports 'dark' when the OS mock reports a dark preference", () => {
    setPrefersColorScheme(true);

    expect(getSystemColorScheme()).toBe("dark");
  });

  test("reports 'light' when the OS mock reports a light preference", () => {
    setPrefersColorScheme(false);

    expect(getSystemColorScheme()).toBe("light");
  });
});

// Critical regression test inherited from Task 1's open item: the mock's
// `createMediaQueryList` returns a snapshot object, not a live getter. If
// the implementation caches a `mql` reference and reads `.matches` off of
// it later instead of re-querying `window.matchMedia(...)` (or relying on
// the "change" event) on every call, this test catches it — without this
// test the defect would stay latent until Task 7.
describe("Tarea 3 — getSystemColorScheme must not read a stale cached value", () => {
  test("a value change on the OS between two calls is reflected on the second call, not the first call's snapshot", () => {
    setPrefersColorScheme(false);
    const first = getSystemColorScheme();

    setPrefersColorScheme(true);
    const second = getSystemColorScheme();

    expect(first).toBe("light");
    expect(second).toBe("dark");
  });

  test("multiple flips in a row are each reflected on the next call, not stuck on the first observed value", () => {
    setPrefersColorScheme(true);
    expect(getSystemColorScheme()).toBe("dark");

    setPrefersColorScheme(false);
    expect(getSystemColorScheme()).toBe("light");

    setPrefersColorScheme(true);
    expect(getSystemColorScheme()).toBe("dark");
  });
});

describe("Tarea 3 — subscribeToSystemColorScheme notifies on live OS changes", () => {
  test("returns a function (the unsubscribe handle)", () => {
    const unsubscribe = subscribeToSystemColorScheme(vi.fn());

    expect(typeof unsubscribe).toBe("function");
  });

  test("subscribing does not itself invoke the callback synchronously (only an actual change does)", () => {
    setPrefersColorScheme(false);
    const callback = vi.fn();

    subscribeToSystemColorScheme(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  test("simulating an OS change to dark synchronously invokes the callback with 'dark'", () => {
    setPrefersColorScheme(false);
    const callback = vi.fn();
    subscribeToSystemColorScheme(callback);

    setPrefersColorScheme(true);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("dark");
  });

  test("simulating an OS change to light synchronously invokes the callback with 'light'", () => {
    setPrefersColorScheme(true);
    const callback = vi.fn();
    subscribeToSystemColorScheme(callback);

    setPrefersColorScheme(false);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("light");
  });

  test("consecutive changes each invoke the callback with their own new value, in order", () => {
    setPrefersColorScheme(false);
    const callback = vi.fn();
    subscribeToSystemColorScheme(callback);

    setPrefersColorScheme(true);
    setPrefersColorScheme(false);
    setPrefersColorScheme(true);

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, "dark");
    expect(callback).toHaveBeenNthCalledWith(2, "light");
    expect(callback).toHaveBeenNthCalledWith(3, "dark");
  });

  test("notification happens without polling: the callback fires before any timers would have elapsed", () => {
    vi.useFakeTimers();
    try {
      setPrefersColorScheme(false);
      const callback = vi.fn();
      subscribeToSystemColorScheme(callback);

      setPrefersColorScheme(true);

      // No `vi.advanceTimersByTime(...)` call anywhere in this test: if the
      // implementation relied on `setInterval`/`setTimeout` polling instead
      // of the event-driven "change" listener, fake timers would keep the
      // callback from ever firing here.
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("dark");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Tarea 3 — unsubscribe stops further callbacks", () => {
  test("calling the returned unsubscribe function stops that callback from being invoked by later changes", () => {
    setPrefersColorScheme(false);
    const callback = vi.fn();
    const unsubscribe = subscribeToSystemColorScheme(callback);

    unsubscribe();
    setPrefersColorScheme(true);

    expect(callback).not.toHaveBeenCalled();
  });

  test("unsubscribing after already having received one notification stops any further ones", () => {
    setPrefersColorScheme(false);
    const callback = vi.fn();
    const unsubscribe = subscribeToSystemColorScheme(callback);

    setPrefersColorScheme(true);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPrefersColorScheme(false);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("unsubscribing one callback does not affect a different, still-subscribed callback", () => {
    setPrefersColorScheme(false);
    const unsubscribedCallback = vi.fn();
    const keptCallback = vi.fn();
    const unsubscribe = subscribeToSystemColorScheme(unsubscribedCallback);
    subscribeToSystemColorScheme(keptCallback);

    unsubscribe();
    setPrefersColorScheme(true);

    expect(unsubscribedCallback).not.toHaveBeenCalled();
    expect(keptCallback).toHaveBeenCalledTimes(1);
    expect(keptCallback).toHaveBeenCalledWith("dark");
  });

  test("calling the unsubscribe function more than once does not throw", () => {
    const unsubscribe = subscribeToSystemColorScheme(vi.fn());

    unsubscribe();

    expect(() => unsubscribe()).not.toThrow();
  });
});
