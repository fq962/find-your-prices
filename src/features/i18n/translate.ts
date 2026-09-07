import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

export type Locale = "en" | "es";

export type DictionaryKey =
  | "siteTitle"
  | "heroTagline"
  | "searchPlaceholder"
  | "storeFilterLabel"
  | "categoryFilterLabel"
  | "filterAllOption"
  | "noResultsMessage"
  | "viewLargerImageLabel"
  | "closeImageLabel";

export type Dictionary = Record<DictionaryKey, string>;

export type Dictionaries = {
  en: Dictionary;
  es: Partial<Dictionary>;
};

const defaultDictionaries: Dictionaries = { en, es };

export function translate(
  locale: Locale,
  key: DictionaryKey,
  dictionaries: Dictionaries = defaultDictionaries,
): string {
  if (locale === "en") {
    return dictionaries.en[key];
  }

  return dictionaries[locale][key] ?? dictionaries.en[key];
}
