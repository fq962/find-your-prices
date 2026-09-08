"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getSystemColorScheme, subscribeToSystemColorScheme } from "./colorScheme";
import { resolveInitialTheme } from "./resolveInitialTheme";
import {
  readStoredThemePreference,
  writeStoredThemePreference,
  type ThemePreference,
} from "./themeStorage";

type Theme = "light" | "dark";

type ThemeContextValue = {
  /** Tema efectivamente pintado. */
  theme: Theme;
  /** Lo que el usuario eligió; "system" también cuando no hay nada guardado. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/* --------------------------------------------------------------------------
 * Store de la preferencia guardada
 * --------------------------------------------------------------------------
 * `localStorage` es un sistema externo a React, así que se lee con
 * `useSyncExternalStore` en vez de copiarlo a estado dentro de un effect: eso
 * mantiene el render del servidor (sin storage) y la hidratación coherentes.
 * ----------------------------------------------------------------------- */

const storedListeners = new Set<() => void>();

function safeRead(): ThemePreference | null {
  try {
    return readStoredThemePreference();
  } catch {
    return null;
  }
}

function subscribeStored(onStoreChange: () => void): () => void {
  storedListeners.add(onStoreChange);
  // Otra pestaña puede cambiar la preferencia: `storage` sólo dispara ahí.
  window.addEventListener("storage", onStoreChange);

  return () => {
    storedListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function writePreference(preference: ThemePreference): void {
  try {
    writeStoredThemePreference(preference);
  } catch {
    // Storage bloqueado (modo privado, políticas de empresa): se ignora; el
    // usuario simplemente no conserva la elección entre visitas.
  }
  for (const listener of storedListeners) listener();
}

function subscribeSystem(onStoreChange: () => void): () => void {
  return subscribeToSystemColorScheme(() => onStoreChange());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribeStored, safeRead, () => null);
  const systemScheme = useSyncExternalStore(
    subscribeSystem,
    getSystemColorScheme,
    () => "light" as const,
  );

  const theme = resolveInitialTheme(stored, systemScheme);

  // El script anti-FOUC de `layout.tsx` ya dejó este mismo valor puesto antes
  // del primer paint, así que normalmente esto no repinta nada.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    writePreference(next);
  }, []);

  const toggleTheme = useCallback(() => {
    writePreference(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference: stored ?? "system", setPreference, toggleTheme }),
    [theme, stored, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
