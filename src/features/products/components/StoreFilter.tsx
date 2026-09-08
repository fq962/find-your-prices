"use client";

import { Select } from "@/components/ui/Select";
import { useLocale } from "@/features/i18n/LocaleContext";

export interface StoreFilterProps {
  stores: string[];
  /**
   * Cuántos artículos hay detrás de cada opción. Cuando se pasa, el conteo se
   * muestra junto al nombre: saber que una categoría tiene 858 artículos y otra
   * 3 cambia cuál se elige, y evita la sensación de llegar a un callejón sin
   * salida al filtrar. El valor de la opción no cambia, solo su etiqueta.
   */
  counts?: Record<string, number>;
  selectedStore?: string;
  onChange: (store: string | undefined) => void;
}

/** Toldo de tienda: el glifo que identifica este filtro sin escribir "Tienda". */
const StoreIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px]"
  >
    <path d="M4 9.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5" />
    <path d="M3.2 9.5 4.6 4.8A1 1 0 0 1 5.6 4h12.8a1 1 0 0 1 1 .8l1.4 4.7a2.6 2.6 0 0 1-5.2 0 2.6 2.6 0 0 1-5.2 0 2.6 2.6 0 0 1-5.2 0Z" />
  </svg>
);

export function StoreFilter({ stores, selectedStore, onChange, counts }: StoreFilterProps) {
  const { t } = useLocale();

  return (
    <Select
      aria-label={t("storeFilterLabel")}
      icon={StoreIcon}
      value={selectedStore ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
    >
      <option value="">{t("filterAllOption")}</option>
      {stores.map((store) => (
        <option key={store} value={store}>
          {store}
          {counts?.[store] !== undefined ? ` (${counts[store]})` : ""}
        </option>
      ))}
    </Select>
  );
}
