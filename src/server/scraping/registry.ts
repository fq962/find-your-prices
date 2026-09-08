import type { ScrapeStrategy } from './types';
import { diunsaStrategy } from './strategies/diunsa';

/**
 * Registro de estrategias.
 *
 * Agregar un comercio nuevo son dos pasos:
 *   1. Crear `strategies/<tienda>.ts` implementando `ScrapeStrategy`.
 *   2. Sumarla al array de abajo.
 *
 * Despues basta con dar de alta la tienda y sus targets desde el panel usando
 * la misma `key`. Ni la base de datos ni el runner cambian.
 */
const STRATEGIES: ScrapeStrategy[] = [
  diunsaStrategy,
  // Proximas: ladylee, radioshack, lacuracao, jetstereo, supermercados...
];

const byKey = new Map(STRATEGIES.map((strategy) => [strategy.key, strategy]));

export function getStrategy(key: string): ScrapeStrategy {
  const strategy = byKey.get(key);
  if (!strategy) {
    throw new Error(
      `No existe una estrategia registrada con la clave "${key}". ` +
        `Disponibles: ${[...byKey.keys()].join(', ') || '(ninguna)'}`,
    );
  }
  return strategy;
}

export function hasStrategy(key: string): boolean {
  return byKey.has(key);
}

/** Catalogo de estrategias para poblar los selectores del panel. */
export function listStrategies() {
  return STRATEGIES.map(({ key, label, supports, configSchema }) => ({
    key,
    label,
    supports,
    configSchema: configSchema ?? [],
  }));
}
