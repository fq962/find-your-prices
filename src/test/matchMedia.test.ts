import { describe, expect, test, vi } from "vitest";
import { setPrefersColorScheme } from "./matchMedia";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // vitest.setup.ts (existing file, to be extended)
 * // Must install a `window.matchMedia` mock, active for every test file,
 * // BEFORE any test body runs. Calling
 * //   window.matchMedia(query: string)
 * // for any query string (not only "(prefers-color-scheme: dark)") must
 * // return, synchronously and without throwing, an object exposing at
 * // least:
 * //   { matches: boolean;
 * //     media: string;
 * //     addEventListener(type: "change", cb: (ev: { matches: boolean; media: string }) => void): void;
 * //     removeEventListener(type: "change", cb: (ev: { matches: boolean; media: string }) => void): void; }
 * // Calling `window.matchMedia(query)` twice with the SAME query string
 * // must return objects that share state: registering a listener through
 * // one of them and flipping the value through the test helper below must
 * // notify that listener.
 *
 * // src/test/matchMedia.ts (new test-only helper, not shipped to
 * // production code, imported directly by test files — never by app code)
 * export function setPrefersColorScheme(matches: boolean): void;
 * // Sets the simulated OS preference for the "(prefers-color-scheme: dark)"
 * // query:
 * //   - If called BEFORE anything has queried matchMedia for that string,
 * //     the first `window.matchMedia("(prefers-color-scheme: dark)").matches`
 * //     read afterwards reflects the configured value.
 * //   - If called AFTER a listener was registered via
 * //     `.addEventListener("change", cb)` on that query's mql, it
 * //     synchronously invokes every still-registered `cb` with an event-like
 * //     object whose `.matches` equals the new value and whose `.media`
 * //     equals "(prefers-color-scheme: dark)".
 * //   - A callback removed via `.removeEventListener("change", cb)` must
 * //     NOT be invoked by subsequent calls to this helper.
 * //
 * // NOTE (flag, not an assumption baked into behavior): the plan does not
 * // specify what `matches` should read as by DEFAULT, before this helper
 * // is ever called in a given test. Every test below therefore calls
 * // `setPrefersColorScheme(...)` explicitly before asserting on `.matches`,
 * // instead of depending on an unstated default. Tasks 3/7 will need this
 * // default clarified before they can assert on a freshly-mounted
 * // component's initial rendered theme without first calling the helper.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)";

describe("Tarea 1 — window.matchMedia mock exposes the required shape", () => {
  test("calling window.matchMedia with the dark-scheme query does not throw", () => {
    expect(() => window.matchMedia(DARK_QUERY)).not.toThrow();
  });

  test("the returned object exposes a boolean `matches` property", () => {
    const mql = window.matchMedia(DARK_QUERY);

    expect(typeof mql.matches).toBe("boolean");
  });

  test("the returned object exposes addEventListener and removeEventListener as callable functions, without throwing when used", () => {
    const mql = window.matchMedia(DARK_QUERY);
    const cb = vi.fn();

    expect(typeof mql.addEventListener).toBe("function");
    expect(typeof mql.removeEventListener).toBe("function");
    expect(() => mql.addEventListener("change", cb)).not.toThrow();
    expect(() => mql.removeEventListener("change", cb)).not.toThrow();
  });

  test("an arbitrary, unrelated media query string also resolves without throwing (mock is not hard-coded to only the dark query)", () => {
    expect(() => window.matchMedia("(prefers-color-scheme: light)")).not.toThrow();
    expect(() => window.matchMedia("(min-width: 640px)")).not.toThrow();
  });
});

describe("Tarea 1 — test helper controls the simulated matches value", () => {
  test("setting the preference BEFORE anything has queried matchMedia is reflected on the first query afterwards", () => {
    setPrefersColorScheme(true);

    expect(window.matchMedia(DARK_QUERY).matches).toBe(true);
  });

  test("flipping the preference AFTER a listener subscribed invokes that listener synchronously", () => {
    setPrefersColorScheme(false);
    const mql = window.matchMedia(DARK_QUERY);
    const cb = vi.fn();
    mql.addEventListener("change", cb);

    setPrefersColorScheme(true);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("the event object passed to the listener exposes the new matches value and the media string", () => {
    setPrefersColorScheme(false);
    const mql = window.matchMedia(DARK_QUERY);
    const cb = vi.fn();
    mql.addEventListener("change", cb);

    setPrefersColorScheme(true);

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ matches: true, media: DARK_QUERY }),
    );
  });

  test("querying matchMedia again after a flip reflects the new value, not just the event payload", () => {
    setPrefersColorScheme(false);
    setPrefersColorScheme(true);

    expect(window.matchMedia(DARK_QUERY).matches).toBe(true);
  });

  test("a callback removed via removeEventListener is not invoked by a later flip", () => {
    setPrefersColorScheme(false);
    const mql = window.matchMedia(DARK_QUERY);
    const cb = vi.fn();
    mql.addEventListener("change", cb);
    mql.removeEventListener("change", cb);

    setPrefersColorScheme(true);

    expect(cb).not.toHaveBeenCalled();
  });

  test("removing one callback does not affect a different, still-registered callback", () => {
    setPrefersColorScheme(false);
    const mql = window.matchMedia(DARK_QUERY);
    const removedCb = vi.fn();
    const keptCb = vi.fn();
    mql.addEventListener("change", removedCb);
    mql.addEventListener("change", keptCb);
    mql.removeEventListener("change", removedCb);

    setPrefersColorScheme(true);

    expect(removedCb).not.toHaveBeenCalled();
    expect(keptCb).toHaveBeenCalledTimes(1);
  });
});

// Inferred edge case, not spelled out verbatim in the acceptance criteria,
// but implied by the sibling requirement that shared test state (storage)
// must not leak between tests regardless of execution order. A matchMedia
// mock that keeps stale listeners from a previous test around would cause
// exactly the kind of order-dependent flakiness Task 1 exists to prevent,
// and Task 7 explicitly depends on subscribe/unsubscribe being trustworthy.
describe("Tarea 1 — matchMedia listeners do not leak between tests", () => {
  let leakedCallCount = 0;

  test("registers a listener that increments a counter on change (setup step for the next test)", () => {
    setPrefersColorScheme(false);
    window.matchMedia(DARK_QUERY).addEventListener("change", () => {
      leakedCallCount += 1;
    });

    // sanity check within this same test: the listener does work here
    setPrefersColorScheme(true);
    expect(leakedCallCount).toBe(1);
  });

  test("a listener registered in the previous test must not still be attached in this one", () => {
    setPrefersColorScheme(false);
    setPrefersColorScheme(true);

    expect(leakedCallCount).toBe(1); // unchanged since the previous test
  });
});
