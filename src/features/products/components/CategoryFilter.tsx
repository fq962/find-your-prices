"use client";

import { useLocale } from "@/features/i18n/LocaleContext";

export interface CategoryFilterProps {
  categories: string[];
  selectedCategory?: string;
  onChange: (category: string | undefined) => void;
}

export function CategoryFilter({ categories, selectedCategory, onChange }: CategoryFilterProps) {
  const { t } = useLocale();

  return (
    <select
      aria-label={t("categoryFilterLabel")}
      value={selectedCategory ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
      className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-900 sm:w-auto"
    >
      <option value="">{t("filterAllOption")}</option>
      {categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
}
