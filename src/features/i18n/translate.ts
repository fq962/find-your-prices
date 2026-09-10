import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

export type Locale = "en" | "es";

export const LOCALES: readonly Locale[] = ["en", "es"];

/** Locale que se sirve en la raíz del sitio, sin prefijo de ruta. */
export const DEFAULT_LOCALE: Locale = "es";

/** Ruta canónica de cada idioma: "/" para el default, "/en" para el resto. */
export function localePath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}`;
}

export type DictionaryKey =
  | "siteTitle"
  | "heroNativeTitle"
  | "heroTagline"
  | "searchPlaceholder"
  | "storeFilterLabel"
  | "categoryFilterLabel"
  | "filterAllOption"
  | "sortLabel"
  | "sortRelevance"
  | "sortPriceAsc"
  | "sortPriceDesc"
  | "sortNameAsc"
  | "resultsCountOne"
  | "resultsCountMany"
  | "clearFiltersLabel"
  | "statsProductsLabel"
  | "statsStoresLabel"
  | "statsCategoriesLabel"
  | "noResultsMessage"
  | "viewLargerImageLabel"
  | "closeImageLabel"
  | "sortDiscount"
  | "sortRating"
  | "viewModeLabel"
  | "viewList"
  | "viewGrid"
  | "viewGallery"
  | "densityLabel"
  | "densityCompact"
  | "densityCosy"
  | "densityRoomy"
  | "moreFiltersLabel"
  | "priceRangeLabel"
  | "minPriceLabel"
  | "maxPriceLabel"
  | "onlyDiscountedLabel"
  | "includeUnavailableLabel"
  | "brandFilterLabel"
  | "loadMoreLabel"
  | "allResultsShownLabel"
  | "ofLabel"
  | "viewDetailLabel"
  | "productsLabel"
  | "activeFiltersLabel"
  | "filterByLabel"
  | "filtersLabel"
  | "seeResultsLabel"
  | "filterSearchLabel"
  | "filterNoMatchesLabel"
  | "anyPriceLabel"
  | "andUpLabel"
  | "sortNewest"
  | "viewCompare"
  | "compareColumnsLabel"
  | "compareStoreLabel"
  | "compareChooseStoreLabel"
  | "compareEmptyStateTitle"
  | "compareEmptyStateBody"
  | "compareNoResultsInStore"
  | "compareBestPriceLabel"
  | "compareCheapestColumnLabel"
  | "compareFromLabel"
  | "compareAddLabel"
  | "compareRemoveLabel"
  | "compareFullLabel"
  | "compareTrayTitle"
  | "compareTrayHint"
  | "compareOpenLabel"
  | "compareClearLabel"
  | "compareTableTitle"
  | "compareTableEmpty"
  | "compareAttrPrice"
  | "compareAttrListPrice"
  | "compareAttrDiscount"
  | "compareAttrStore"
  | "compareAttrBrand"
  | "compareAttrCategory"
  | "compareAttrAvailability"
  | "compareAttrRating"
  | "resultsListLabel"
  | "loadingMoreLabel"
  | "feedErrorLabel"
  | "searchErrorLabel"
  | "retryLabel"
  | "backToTopLabel";

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
