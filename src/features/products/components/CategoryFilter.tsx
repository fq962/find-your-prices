"use client";

import { useMemo } from "react";
import { Select } from "@/components/ui/Select";
import { useLocale } from "@/features/i18n/LocaleContext";

export interface CategoryFilterProps {
  categories: string[];
  /**
   * Cuántos artículos hay detrás de cada opción. Cuando se pasa, el conteo se
   * muestra junto al nombre: saber que una categoría tiene 858 artículos y otra
   * 3 cambia cuál se elige, y evita la sensación de llegar a un callejón sin
   * salida al filtrar. El valor de la opción no cambia, solo su etiqueta.
   */
  counts?: Record<string, number>;
  selectedCategory?: string;
  onChange: (category: string | undefined) => void;
  /** Ver `SelectProps.collapsed`: comprime la píldora a un icono circular. */
  collapsed?: boolean;
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

export function CategoryFilter({
  categories,
  selectedCategory,
  onChange,
  counts,
  collapsed,
}: CategoryFilterProps) {
  const { t } = useLocale();

  // Las facetas llegan de la base y pueden traer el mismo nombre dos veces
  // (dos tiendas nombran igual su categoría, o la vista cuenta variantes por
  // separado). Duplicar el `value` de una opción rompe la clave de React y deja
  // el <select> mostrando la misma entrada repetida, así que se colapsan acá.
  const options = useMemo(
    () => [...new Set(categories.filter((value) => value.trim() !== ""))],
    [categories],
  );

  return (
    <Select
      aria-label={t("categoryFilterLabel")}
      icon={CategoryIcon}
      collapsed={collapsed}
      value={selectedCategory ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
    >
      <option value="">{t("filterAllOption")}</option>
      {options.map((category) => (
        <option key={category} value={category}>
          {category}
          {counts?.[category] !== undefined ? ` (${counts[category]})` : ""}
        </option>
      ))}
    </Select>
  );
}
