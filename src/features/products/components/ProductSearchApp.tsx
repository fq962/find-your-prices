"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/types";
import { useLocale } from "@/features/i18n/LocaleContext";
import { filterProducts, getFacets } from "@/features/products/filterProducts";
import { SearchBar } from "./SearchBar";
import { StoreFilter } from "./StoreFilter";
import { CategoryFilter } from "./CategoryFilter";
import { ProductGrid } from "./ProductGrid";

export interface ProductSearchAppProps {
  initialProducts: Product[];
}

export function ProductSearchApp({ initialProducts }: ProductSearchAppProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [store, setStore] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);

  const { stores, categories } = useMemo(() => getFacets(initialProducts), [initialProducts]);

  const filtered = useMemo(
    () => filterProducts(initialProducts, { query, store, category }),
    [initialProducts, query, store, category],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <SearchBar onQueryChange={setQuery} />
        </div>
        <StoreFilter stores={stores} selectedStore={store} onChange={setStore} />
        <CategoryFilter categories={categories} selectedCategory={category} onChange={setCategory} />
      </div>
      <ProductGrid
        products={filtered}
        emptyMessage={t("noResultsMessage")}
        viewLargerImageLabel={t("viewLargerImageLabel")}
        closeImageLabel={t("closeImageLabel")}
      />
    </div>
  );
}
