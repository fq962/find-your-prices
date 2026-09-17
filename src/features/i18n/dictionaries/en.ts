import type { Dictionary } from "../translate";

export const en: Dictionary = {
  siteTitle: "Find Your Prices",
  // El nombre del producto ya está en inglés: no hay nada que "traducir de
  // vuelta" bajo el título, así que esta línea queda vacía a propósito y el
  // Hero simplemente no la pinta.
  heroNativeTitle: "",
  heroTagline: "Compare prices across stores, all in one place.",
  searchPlaceholder: "Search for a product",
  storeFilterLabel: "Store",
  categoryFilterLabel: "Category",
  filterAllOption: "All",
  sortLabel: "Sort",
  sortRelevance: "Featured",
  sortPriceAsc: "Lowest price",
  sortPriceDesc: "Highest price",
  sortNameAsc: "Name A–Z",
  resultsCountOne: "result",
  resultsCountMany: "results",
  clearFiltersLabel: "Clear filters",
  statsProductsLabel: "products",
  statsStoresLabel: "stores",
  statsCategoriesLabel: "categories",
  noResultsMessage: "No products match your search.",
  closeImageLabel: "Close",

  // --- Catalog browsing ---
  sortDiscount: "Biggest discount",
  sortRating: "Top rated",
  moreFiltersLabel: "More filters",
  priceRangeLabel: "Price range",
  minPriceLabel: "From",
  maxPriceLabel: "To",
  onlyDiscountedLabel: "Discounted only",
  includeUnavailableLabel: "Include out of stock and unpriced",
  brandFilterLabel: "Brand",
  loadMoreLabel: "Load more products",
  allResultsShownLabel: "You have seen every result",
  ofLabel: "of",
  viewDetailLabel: "View details",
  productsLabel: "products",
  activeFiltersLabel: "active filters",

  // --- Panel de facetas (barra lateral / hoja de teléfono) ---
  filterByLabel: "Filter by",
  filtersLabel: "Filters",
  seeResultsLabel: "See results",
  filterSearchLabel: "Search",
  filterNoMatchesLabel: "No matches",
  filterShowMoreLabel: "Show more",
  filterShowLessLabel: "Show less",
  filterUncategorizedLabel: "Not categorized yet",
  filterExpandLabel: "Show subcategories of",
  filterCollapseLabel: "Hide subcategories of",
  anyPriceLabel: "Any price",
  andUpLabel: "and up",

  // --- Sort ---
  sortNewest: "Recently added",

  // --- Search suggestions ---
  suggestionsLabel: "Suggestions",
  suggestStoresLabel: "Stores",
  suggestCategoriesLabel: "Categories",
  suggestItemsLabel: "Items",
  clearSearchLabel: "Clear search",

  // --- Product comparison tray ---
  compareBestPriceLabel: "Best price",
  compareAddLabel: "Add to comparison",
  compareRemoveLabel: "Remove from comparison",
  compareFullLabel: "You can compare up to 4 products",

  // --- Favorites ---
  favoriteAddLabel: "Add to favorites",
  favoriteRemoveLabel: "Remove from favorites",
  favoritesNavLabel: "Favorites",
  favoritesTitle: "My favorites",
  favoritesLede: "Everything you marked with a heart, ready whenever you come back.",
  favoritesCountOne: "saved product",
  favoritesCountMany: "saved products",
  favoritesEmptyTitle: "No favorites yet",
  favoritesEmptyBody:
    "Tap the heart on any product in the catalog and it will show up here. Saved in this browser, no account needed.",
  favoritesBrowseLabel: "Browse the catalog",
  favoritesClearLabel: "Clear favorites",
  favoritesPriceNote:
    "The price is the one the product had when you saved it; open its page for the current one.",
  compareTrayTitle: "Ready to compare",
  compareTrayHint: "Add up to 4 products",
  compareOpenLabel: "Compare",
  compareClearLabel: "Clear",
  compareTableTitle: "Product comparison",
  compareTableEmpty: "You have not picked any product yet.",
  compareAttrPrice: "Price",
  compareAttrListPrice: "Was",
  compareAttrDiscount: "Discount",
  compareAttrStore: "Store",
  compareAttrBrand: "Brand",
  compareAttrCategory: "Category",
  compareAttrAvailability: "Availability",
  compareAttrRating: "Rating",
  resultsListLabel: "Results",

  // --- Catalogue paging ---
  loadingMoreLabel: "Loading more products…",
  feedErrorLabel: "We could not load more products.",
  searchErrorLabel: "The search could not be completed.",
  retryLabel: "Try again",
  backToTopLabel: "Back to top",
};
