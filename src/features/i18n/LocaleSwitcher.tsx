"use client";

import { useLocale } from "./LocaleContext";

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="inline-flex gap-1">
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white"
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={locale === "es"}
        onClick={() => setLocale("es")}
        className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white"
      >
        ES
      </button>
    </div>
  );
}
