import { describe, expect, test } from "vitest";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { translate, type Dictionaries } from "./translate";

/**
 * Contract under test — this is the interface the Implementer must build.
 * Nothing below is implementation, only the shape these tests assume.
 *
 * // src/features/i18n/translate.ts
 * export type Locale = "en" | "es";
 * export type DictionaryKey =
 *   | "siteTitle"
 *   | "heroTagline"
 *   | "searchPlaceholder"
 *   | "storeFilterLabel"
 *   | "categoryFilterLabel"
 *   | "filterAllOption"
 *   | "noResultsMessage";
 * export type Dictionary = Record<DictionaryKey, string>;
 * // `en` must be a complete dictionary; `es` (or any secondary locale) may
 * // be partial so translate() has something to fall back FROM.
 * export type Dictionaries = { en: Dictionary; es: Partial<Dictionary> };
 * export function translate(
 *   locale: Locale,
 *   key: DictionaryKey,
 *   dictionaries?: Dictionaries, // defaults to the real { en, es } dictionaries
 * ): string;
 *
 * // src/features/i18n/dictionaries/en.ts
 * export const en: Dictionary;
 *
 * // src/features/i18n/dictionaries/es.ts
 * export const es: Dictionary; // complete in production, but the TYPE
 *                               // allows partial so it is structurally
 *                               // assignable to Dictionaries["es"].
 */

const REQUIRED_KEYS = [
  "siteTitle",
  "heroTagline",
  "searchPlaceholder",
  "storeFilterLabel",
  "categoryFilterLabel",
  "filterAllOption",
  "noResultsMessage",
] as const;

describe("Tarea 9 — EN dictionary content", () => {
  test.each(REQUIRED_KEYS)("has a non-empty string for key '%s'", (key) => {
    expect(typeof en[key]).toBe("string");
    expect(en[key].length).toBeGreaterThan(0);
  });

  test("site title is exactly 'Find Your Prices' (literal user requirement)", () => {
    expect(en.siteTitle).toBe("Find Your Prices");
  });
});

describe("Tarea 9 — ES dictionary content", () => {
  test.each(REQUIRED_KEYS)("has a non-empty string for key '%s'", (key) => {
    expect(typeof es[key]).toBe("string");
    expect(es[key].length).toBeGreaterThan(0);
  });

  // Intentionally NOT asserting a specific value for es.siteTitle: the plan
  // explicitly says it may stay "Find Your Prices" or be translated. Only
  // existence + non-empty string is a requirement.
});

describe("Tarea 9 — translate() happy path", () => {
  test("returns the English string for locale 'en'", () => {
    expect(translate("en", "siteTitle")).toBe("Find Your Prices");
    expect(translate("en", "noResultsMessage")).toBe(en.noResultsMessage);
  });

  test("returns the Spanish string for locale 'es'", () => {
    expect(translate("es", "searchPlaceholder")).toBe(es.searchPlaceholder);
    expect(translate("es", "noResultsMessage")).toBe(es.noResultsMessage);
  });

  test.each(REQUIRED_KEYS)(
    "translate('es', '%s') matches the real es dictionary (no unwanted fallback for keys that exist)",
    (key) => {
      expect(translate("es", key)).toBe(es[key]);
    },
  );
});

describe("Tarea 10 — translate() falls back to English when a Spanish key is missing", () => {
  // A dictionary object is injected explicitly instead of mutating the real
  // `es` dictionary, per the plan's instruction not to tamper with
  // production data to exercise this behavior.
  // El lado inglés se arma sobre el diccionario real en vez de copiarlo clave
  // por clave: `Dictionary` exige TODAS las claves, así que un literal a mano
  // rompía esta prueba cada vez que se añadía una etiqueta nueva al producto,
  // sin que el comportamiento bajo prueba —el fallback— hubiese cambiado.
  // Partir del real no es "tocar datos de producción": se copia, no se muta, y
  // lo que se afirma abajo se compara contra este mismo objeto.
  const mockDictionaries: Dictionaries = {
    en: { ...en, heroNativeTitle: "", heroTagline: "English tagline" },
    es: {
      siteTitle: "Encuentra Tus Precios",
      // heroTagline is intentionally absent to exercise the fallback path.
    },
  };

  test("returns the English value instead of undefined", () => {
    const result = translate("es", "heroTagline", mockDictionaries);
    expect(result).not.toBeUndefined();
    expect(result).toBe(mockDictionaries.en.heroTagline);
  });

  test("does not fall back to the raw key name", () => {
    const result = translate("es", "heroTagline", mockDictionaries);
    expect(result).not.toBe("heroTagline");
  });

  test("does not throw when the Spanish key is missing", () => {
    expect(() => translate("es", "heroTagline", mockDictionaries)).not.toThrow();
  });

  test("still returns the Spanish value when the key IS present in Spanish (fallback must not shadow existing translations)", () => {
    expect(translate("es", "siteTitle", mockDictionaries)).toBe("Encuentra Tus Precios");
  });
});
