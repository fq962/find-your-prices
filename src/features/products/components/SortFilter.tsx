"use client";

import { Select } from "@/components/ui/Select";
import { useLocale } from "@/features/i18n/LocaleContext";
import type { DictionaryKey } from "@/features/i18n/translate";
import { isSortOption, SORT_OPTIONS, type SortOption } from "../sortProducts";

export interface SortFilterProps {
  selectedSort: SortOption;
  onChange: (sort: SortOption) => void;
}

/** Cada criterio de orden y la clave de diccionario que lo nombra. */
const SORT_LABEL_KEYS: Record<SortOption, DictionaryKey> = {
  newest: "sortNewest",
  relevance: "sortRelevance",
  "price-asc": "sortPriceAsc",
  "price-desc": "sortPriceDesc",
  "name-asc": "sortNameAsc",
  discount: "sortDiscount",
  rating: "sortRating",
};

/** Flechas arriba/abajo: reordenar, el glifo de este control. */
const SortIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px]"
  >
    <path d="M7 20V5m0 0L4 8.2M7 5l3 3.2" />
    <path d="M17 4v15m0 0 3-3.2M17 19l-3-3.2" />
  </svg>
);

export function SortFilter({ selectedSort, onChange }: SortFilterProps) {
  const { t } = useLocale();

  return (
    <Select
      aria-label={t("sortLabel")}
      icon={SortIcon}
      value={selectedSort}
      onChange={(event) => {
        // El valor viene de un <select> nativo: se valida antes de propagarlo
        // para no dejar entrar un criterio que `sortProducts` no conoce.
        if (isSortOption(event.target.value)) {
          onChange(event.target.value);
        }
      }}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {t(SORT_LABEL_KEYS[option])}
        </option>
      ))}
    </Select>
  );
}
