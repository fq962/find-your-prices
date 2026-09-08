"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale, type DictionaryKey } from "./translate";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: DictionaryKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export interface LocaleProviderProps {
  children: ReactNode;
  /**
   * Idioma con el que arranca el árbol. Lo fija la ruta que renderiza la
   * página ("/" → es, "/en" → en). Sin prop, el default sigue siendo "en".
   */
  initialLocale?: Locale;
}

export function LocaleProvider({ children, initialLocale = "en" }: LocaleProviderProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: DictionaryKey) => translate(locale, key),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (context === undefined) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }

  return context;
}
