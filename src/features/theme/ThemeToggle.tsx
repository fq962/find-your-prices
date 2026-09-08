"use client";

import { useTheme } from "./ThemeProvider";

export interface ThemeToggleProps {
  /** Nombre accesible del control (lo aporta quien conoce el idioma activo). */
  label?: string;
}

/**
 * Interruptor claro/oscuro. Los dos iconos viven siempre en el DOM y se
 * cruzan con rotación + escala, así el cambio se lee como un giro del mismo
 * objeto y no como dos elementos apareciendo.
 */
export function ThemeToggle({ label = "Toggle theme" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      className="group relative grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)] transition-[color,background-color,border-color,transform] duration-[var(--dur-base)] ease-[var(--ease-out-expo)] hover:scale-105 hover:border-[var(--border-strong)] hover:text-[var(--text)] active:scale-95"
    >
      <span className="relative block h-[18px] w-[18px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className={`absolute inset-0 h-full w-full transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] ${
            isDark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
          }`}
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7 5.4 5.4" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 h-full w-full transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] ${
            isDark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"
          }`}
        >
          <path d="M20.4 13.4A8.4 8.4 0 0 1 10.6 3.6a8.4 8.4 0 1 0 9.8 9.8Z" />
        </svg>
      </span>
    </button>
  );
}
