"use client";

import { Select } from "@/components/ui/Select";
import { useLocale } from "@/features/i18n/LocaleContext";

export interface CategoryFilterProps {
  categories: string[];
  selectedCategory?: string;
  onChange: (category: string | undefined) => void;
}

/** Cuadrícula: agrupación, el glifo de este filtro sin escribir "Categoría". */
const CategoryIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px]"
  >
    <rect x="4" y="4" width="7" height="7" rx="1.6" />
    <rect x="13" y="4" width="7" height="7" rx="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.6" />
  </svg>
);

export function CategoryFilter({ categories, selectedCategory, onChange }: CategoryFilterProps) {
  const { t } = useLocale();

  return (
    <Select
      aria-label={t("categoryFilterLabel")}
      icon={CategoryIcon}
      value={selectedCategory ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
    >
      <option value="">{t("filterAllOption")}</option>
      {categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </Select>
  );
}
