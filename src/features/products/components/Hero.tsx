"use client";

import { useLocale } from "@/features/i18n/LocaleContext";

export function Hero() {
  const { t } = useLocale();

  return (
    <header className="flex flex-col gap-2 px-4 py-10 text-center sm:gap-3 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
        {t("siteTitle")}
      </h1>
      <p className="text-base text-neutral-500 sm:text-lg">{t("heroTagline")}</p>
    </header>
  );
}
