export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme-preference";

const VALID_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

function isThemePreference(value: string): value is ThemePreference {
  return (VALID_PREFERENCES as readonly string[]).includes(value);
}

export function readStoredThemePreference(): ThemePreference | null {
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (raw !== null && isThemePreference(raw)) {
    return raw;
  }

  return null;
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
}

export function clearStoredThemePreference(): void {
  window.localStorage.removeItem(THEME_STORAGE_KEY);
}
