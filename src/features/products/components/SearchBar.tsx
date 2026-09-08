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
    <div className="group relative">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-[var(--text-tertiary)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-focus-within:text-[var(--accent)]"
      >
        <circle cx="11" cy="11" r="6.4" />
        <path d="m20 20-3.6-3.6" />
      </svg>
      <input
        type="search"
        aria-label={t("searchPlaceholder")}
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] pr-4 pl-11 text-[0.95rem] tracking-[-0.01em] text-[var(--text)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,background-color] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] outline-none placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-soft)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
}
