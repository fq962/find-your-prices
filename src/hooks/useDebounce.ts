import { useEffect, useState } from "react";

/**
 * Devuelve `value` retrasado `delayMs`. Útil para inputs de búsqueda que
 * disparan una petición de red en cada tecleo (p. ej. buscar productos).
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
