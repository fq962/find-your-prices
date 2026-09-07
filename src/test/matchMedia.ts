/**
 * Test-only mock for `window.matchMedia`. Imported directly by test files
 * (see `src/test/matchMedia.test.ts` for the full contract) and installed
 * globally by `vitest.setup.ts`. Never imported by production/app code.
 *
 * Behavior notes:
 * - State is keyed by the raw query string, so two calls to
 *   `window.matchMedia(sameQuery)` share the same `matches` value and
 *   listener set.
 * - Default `matches` value, before `setPrefersColorScheme` has ever been
 *   called for a given query: `false`. This was left unspecified by the
 *   test contract; `false` (i.e. "no dark-scheme preference") is chosen as
 *   the safe default so a freshly-mounted component that reads
 *   `window.matchMedia("(prefers-color-scheme: dark)").matches` without a
 *   prior call to the helper sees a light-scheme preference. Tasks 3/7
 *   should treat this as the documented default.
 */

type ChangeListener = (event: { matches: boolean; media: string }) => void;

interface MediaQueryState {
  matches: boolean;
  listeners: Set<ChangeListener>;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_MATCHES = false;

const registry = new Map<string, MediaQueryState>();

function getState(query: string): MediaQueryState {
  let state = registry.get(query);
  if (!state) {
    state = { matches: DEFAULT_MATCHES, listeners: new Set() };
    registry.set(query, state);
  }
  return state;
}

function createMediaQueryList(query: string) {
  const state = getState(query);

  return {
    matches: state.matches,
    media: query,
    addEventListener(type: string, cb: ChangeListener) {
      if (type === "change") {
        state.listeners.add(cb);
      }
    },
    removeEventListener(type: string, cb: ChangeListener) {
      if (type === "change") {
        state.listeners.delete(cb);
      }
    },
  };
}

/** Installs the `window.matchMedia` mock. Idempotent. */
export function installMatchMediaMock(): void {
  window.matchMedia = ((query: string) =>
    createMediaQueryList(query)) as unknown as typeof window.matchMedia;
}

/** Clears all registered queries/listeners. Call between tests. */
export function resetMatchMediaMocks(): void {
  registry.clear();
}

/**
 * Sets the simulated OS preference for the "(prefers-color-scheme: dark)"
 * query and synchronously notifies any listener currently registered for
 * that query.
 */
export function setPrefersColorScheme(matches: boolean): void {
  const state = getState(DARK_QUERY);
  state.matches = matches;

  const event = { matches, media: DARK_QUERY };
  for (const cb of state.listeners) {
    cb(event);
  }
}
