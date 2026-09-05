"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale, type DictionaryKey } from "./translate";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: DictionaryKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider(props: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: DictionaryKey) => translate(locale, key),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{props.children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (context === undefined) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }

  return context;
}
