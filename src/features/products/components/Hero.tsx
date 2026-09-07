"use client";

import { useLocale } from "@/features/i18n/LocaleContext";

export function Hero() {
  const { t } = useLocale();

  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
        {t("siteTitle")}
      </h1>
      <p className="text-base text-neutral-500">{t("heroTagline")}</p>
    </header>
  );
}
