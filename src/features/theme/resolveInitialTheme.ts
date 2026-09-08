import type { ThemePreference } from "./themeStorage";

/**
 * Módulo PURO: decide el tema concreto a pintar a partir de la preferencia
 * guardada y del esquema del SO. No lee `localStorage` ni llama a
 * `matchMedia` — ambos entran por argumento, porque el script anti-FOUC del
 * `<head>` (que no puede importar módulos) debe poder copiar esta misma
 * lógica de forma verificable. Ver `resolveInitialTheme.test.ts`.
 *
 * Sin preferencia guardada el default del producto es "dark", incluso si el
 * SO está en claro.
 */
export function resolveInitialTheme(
  storedPreference: ThemePreference | null,
  systemColorScheme: "light" | "dark",
): "light" | "dark" {
  if (storedPreference === "light" || storedPreference === "dark") {
    return storedPreference;
  }

  if (storedPreference === "system") {
    return systemColorScheme;
  }

  return "dark";
}
