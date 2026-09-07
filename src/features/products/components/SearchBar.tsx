"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import { useDebounce } from "@/hooks/useDebounce";

export interface SearchBarProps {
  onQueryChange: (query: string) => void;
}

export function SearchBar({ onQueryChange }: SearchBarProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    onQueryChange(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  return (
    <input
      type="search"
      aria-label={t("searchPlaceholder")}
      placeholder={t("searchPlaceholder")}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-900"
    />
  );
}
