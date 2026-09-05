"use client";

import { useLocale } from "@/features/i18n/LocaleContext";

export interface StoreFilterProps {
  stores: string[];
  selectedStore?: string;
  onChange: (store: string | undefined) => void;
}

export function StoreFilter({ stores, selectedStore, onChange }: StoreFilterProps) {
  const { t } = useLocale();

  return (
    <select
      aria-label={t("storeFilterLabel")}
      value={selectedStore ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
      className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 text-base text-neutral-900 outline-none transition-colors focus:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
    >
      <option value="">{t("filterAllOption")}</option>
      {stores.map((store) => (
        <option key={store} value={store}>
          {store}
        </option>
      ))}
    </select>
  );
}
