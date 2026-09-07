/**
 * Pure module for reading and observing the OS color scheme preference via
 * `window.matchMedia("(prefers-color-scheme: dark)")`. No localStorage, no
 * React/ThemeProvider dependency — see `colorScheme.test.ts` for the full
 * behavioral contract.
 */

export type SystemColorScheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function toScheme(matches: boolean): SystemColorScheme {
  return matches ? "dark" : "light";
}

/**
 * Reads the OS preference at the moment of the call. Always re-queries
 * `window.matchMedia(...)` rather than relying on a previously obtained
 * `MediaQueryList` reference, so it reflects live changes on every call.
 */
export function getSystemColorScheme(): SystemColorScheme {
  return toScheme(window.matchMedia(DARK_QUERY).matches);
}

/**
 * Subscribes to live OS preference changes. Notification happens
 * synchronously via the underlying `change` event — no polling. Returns an
 * unsubscribe function that is safe to call more than once.
 */
export function subscribeToSystemColorScheme(
  callback: (scheme: SystemColorScheme) => void,
): () => void {
  const mediaQueryList = window.matchMedia(DARK_QUERY);

  const listener = (event: MediaQueryListEvent) => {
    callback(toScheme(event.matches));
  };

  mediaQueryList.addEventListener("change", listener);

  let unsubscribed = false;
  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    mediaQueryList.removeEventListener("change", listener);
  };
}
