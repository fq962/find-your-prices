import { describe, expect, test, vi } from 'vitest';

/**
 * Cuándo una tanda de corridas obliga a refrescar la materializada (0030).
 * La regla: solo si algo de lo que el catálogo muestra cambió. Confirmar que
 * todo sigue igual, o fallar antes de ingerir, no cuesta un refresco.
 */

vi.mock('server-only', () => import('@/test/server-only-stub'));
vi.mock('./repository', () => ({}));
vi.mock('./registry', () => ({}));
vi.mock('./http', () => ({}));

import { runsChangedCatalog, type RunResult } from './runner';

function run(overrides: Partial<RunResult>): RunResult {
  return {
    targetId: 't',
    targetName: 'Target',
    storeSlug: 'tienda',
    runId: 'r',
    status: 'success',
    durationMs: 0,
    itemsFound: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsDelisted: 0,
    priceChanges: 0,
    pagesFetched: 0,
    warnings: [],
    ...overrides,
  };
}

describe('runsChangedCatalog', () => {
  test('una tanda vacía o sin cambios no refresca', () => {
    expect(runsChangedCatalog([])).toBe(false);
    expect(runsChangedCatalog([run({ itemsFound: 500, itemsUnchanged: 500 })])).toBe(false);
    expect(runsChangedCatalog([run({ status: 'failed' })])).toBe(false);
  });

  test('cualquier alta, cambio, baja o precio nuevo en cualquier corrida refresca', () => {
    expect(runsChangedCatalog([run({}), run({ itemsNew: 1 })])).toBe(true);
    expect(runsChangedCatalog([run({ itemsUpdated: 1 })])).toBe(true);
    expect(runsChangedCatalog([run({ itemsDelisted: 1 })])).toBe(true);
    expect(runsChangedCatalog([run({ priceChanges: 1 })])).toBe(true);
    // Una corrida parcial que alcanzó a ingerir algo también cuenta.
    expect(runsChangedCatalog([run({ status: 'partial', itemsUpdated: 3 })])).toBe(true);
  });
});
