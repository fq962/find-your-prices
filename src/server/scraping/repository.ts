import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { nextRunFromAnchor } from '@/lib/schedule';
import type {
  NormalizedCategory,
  NormalizedProduct,
  ScrapeRunStatus,
  ScrapeTargetRow,
  ScrapeTrigger,
  StoreRow,
} from './types';

/**
 * Acceso a datos del scraping. Aisla al runner de PostgREST: si mañana se
 * cambia de proveedor, solo cambia este archivo.
 */

/**
 * Cuantos productos van por llamada a `ingest_store_products`.
 * Un catalogo completo de Diunsa son ~8000 articulos con su payload original;
 * mandarlos juntos serian decenas de MB en un solo request. En lotes de 250 el
 * json ronda 1 MB y la corrida sigue siendo de pocos segundos.
 */
const INGEST_CHUNK_SIZE = 250;

export interface IngestCounters {
  items_found: number;
  items_new: number;
  items_updated: number;
  items_unchanged: number;
  price_changes: number;
}

// -----------------------------------------------------------------------------
// Tiendas y targets
// -----------------------------------------------------------------------------

export async function getStoreById(storeId: string): Promise<StoreRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single();

  if (error) throw new Error(`No se pudo leer la tienda ${storeId}: ${error.message}`);
  return data as StoreRow;
}

export async function getTargetById(targetId: string): Promise<ScrapeTargetRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('scrape_targets')
    .select('*')
    .eq('id', targetId)
    .single();

  if (error) throw new Error(`No se pudo leer el target ${targetId}: ${error.message}`);
  return data as ScrapeTargetRow;
}

/**
 * Targets que ya tocaba correr, mas urgente primero. Es lo que consulta el
 * endpoint de cron en cada disparo.
 */
export async function getDueTargets(limit: number): Promise<ScrapeTargetRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('scrape_targets')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('next_run_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`No se pudieron listar los targets pendientes: ${error.message}`);
  return (data ?? []) as ScrapeTargetRow[];
}

// -----------------------------------------------------------------------------
// Ciclo de vida de una corrida
// -----------------------------------------------------------------------------

export async function createRun(params: {
  targetId: string;
  storeId: string;
  strategyKey: string;
  trigger: ScrapeTrigger;
}): Promise<{ runId: string } | { skipped: true; reason: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from('scrape_runs')
    .insert({
      target_id: params.targetId,
      store_id: params.storeId,
      strategy_key: params.strategyKey,
      trigger_source: params.trigger,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) {
    // El indice unico parcial scrape_runs_one_active_per_target impide dos
    // corridas simultaneas del mismo target: no es un fallo, es el lock haciendo
    // su trabajo (por ejemplo si el cron se solapa con una corrida lenta).
    if (error.code === '23505') {
      return { skipped: true, reason: 'Ya hay una corrida en curso para este target' };
    }
    throw new Error(`No se pudo abrir la corrida: ${error.message}`);
  }

  return { runId: data.id as string };
}

export async function finishRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('scrape_runs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', runId);

  if (error) throw new Error(`No se pudo cerrar la corrida ${runId}: ${error.message}`);
}

/**
 * Actualiza la planificacion del target segun como salio la corrida.
 * Tras `failure_threshold` fallos seguidos el target se pausa solo, para no
 * seguir golpeando un sitio que cambio de estructura o nos esta bloqueando.
 */
export async function updateTargetAfterRun(params: {
  target: ScrapeTargetRow;
  status: ScrapeRunStatus;
  errorMessage?: string | null;
}): Promise<void> {
  const { target, status } = params;
  const succeeded = status === 'success' || status === 'partial';
  const failures = succeeded ? 0 : target.consecutive_failures + 1;
  const shouldPause = !succeeded && failures >= target.failure_threshold;

  const frequency = target.frequency_minutes ?? 24 * 60;

  /**
   * Reprogramacion.
   *
   * Con exito se salta al siguiente punto de la rejilla `ancla + k*intervalo`,
   * NO a `ahora + intervalo`. La diferencia importa para toda agenda de
   * calendario: sumar desde el final de la corrida empuja el horario unos
   * segundos cada vez, y en un mes "los lunes a las 08:00" ya cae en cualquier
   * lado (ver src/db/migrations/0023_schedule_anchor.sql).
   *
   * Tras un fallo se sale de la rejilla a proposito: se reintenta antes, con
   * backoff creciente para no insistir cada minuto sobre un sitio caido. En
   * cuanto una corrida vuelve a salir bien, la formula de arriba lo devuelve
   * solo a su horario.
   */
  const anchor = target.schedule_anchor_at;
  const nextRunAt = succeeded
    ? // Sin ancla (targets anteriores a la migracion 0023) se conserva el
      // comportamiento viejo en vez de inventar una rejilla.
      anchor
      ? nextRunFromAnchor(anchor, frequency)
      : new Date(Date.now() + frequency * 60_000)
    : new Date(Date.now() + Math.min(frequency, 5 * 2 ** Math.min(failures, 5)) * 60_000);

  const patch: Record<string, unknown> = {
    last_run_at: new Date().toISOString(),
    last_status: status,
    consecutive_failures: failures,
    next_run_at: nextRunAt.toISOString(),
  };

  if (succeeded) patch.last_success_at = new Date().toISOString();
  if (shouldPause) {
    patch.is_active = false;
    patch.paused_reason = `Pausado automaticamente tras ${failures} fallos seguidos. Ultimo error: ${
      params.errorMessage ?? 'sin detalle'
    }`;
  }

  const { error } = await getSupabaseAdmin()
    .from('scrape_targets')
    .update(patch)
    .eq('id', target.id);

  if (error) throw new Error(`No se pudo reprogramar el target ${target.id}: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------

/**
 * Guarda el arbol crudo de la tienda y devuelve el mapa
 * `codigo externo -> id interno`, que el runner usa para enlazar cada producto
 * con su categoria.
 */
export async function upsertStoreCategories(
  storeId: string,
  categories: NormalizedCategory[],
): Promise<Map<string, string>> {
  const db = getSupabaseAdmin();

  if (categories.length > 0) {
    const rows = categories.map((c) => ({
      store_id: storeId,
      external_id: c.external_id,
      external_parent_id: c.external_parent_id ?? null,
      name: c.name,
      slug: c.slug ?? null,
      url: c.url ?? null,
      level: c.level ?? 0,
      position: c.position ?? null,
      product_count: c.product_count ?? null,
      raw: c.raw ?? {},
      is_active: true,
      last_seen_at: new Date().toISOString(),
    }));

    const { error } = await db
      .from('store_categories')
      .upsert(rows, { onConflict: 'store_id,external_id' });

    if (error) throw new Error(`No se pudieron guardar las categorias: ${error.message}`);

    // Segunda pasada: ahora que todas existen, se enlaza cada una con su padre.
    await linkCategoryParents(storeId);
  }

  const { data, error } = await db
    .from('store_categories')
    .select('id, external_id')
    .eq('store_id', storeId);

  if (error) throw new Error(`No se pudo leer el mapa de categorias: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.external_id as string, row.id as string]));
}

/** Resuelve external_parent_id -> parent_id dentro de una misma tienda. */
async function linkCategoryParents(storeId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('store_categories')
    .select('id, external_id, external_parent_id, parent_id')
    .eq('store_id', storeId);

  if (error) throw new Error(`No se pudo leer el arbol de categorias: ${error.message}`);

  const byExternal = new Map((data ?? []).map((row) => [row.external_id as string, row]));
  const updates = (data ?? [])
    .filter((row) => row.external_parent_id)
    .map((row) => ({ row, parent: byExternal.get(row.external_parent_id as string) }))
    .filter(({ row, parent }) => parent && parent.id !== row.id && row.parent_id !== parent.id)
    .map(({ row, parent }) => ({ id: row.id, parent_id: parent!.id }));

  for (const update of updates) {
    await db.from('store_categories').update({ parent_id: update.parent_id }).eq('id', update.id);
  }
}

// -----------------------------------------------------------------------------
// Ingesta de productos
// -----------------------------------------------------------------------------

/**
 * Envia los productos a `find_your_prices.ingest_store_products`, que resuelve
 * alta/actualizacion, historico de precios, imagenes y variantes del lado de
 * Postgres. Se manda por lotes para no armar un request gigante.
 */
export async function ingestProducts(
  storeId: string,
  runId: string,
  products: NormalizedProduct[],
): Promise<IngestCounters> {
  const db = getSupabaseAdmin();
  const totals: IngestCounters = {
    items_found: 0,
    items_new: 0,
    items_updated: 0,
    items_unchanged: 0,
    price_changes: 0,
  };

  for (let offset = 0; offset < products.length; offset += INGEST_CHUNK_SIZE) {
    const chunk = products.slice(offset, offset + INGEST_CHUNK_SIZE);
    const { data, error } = await db.rpc('ingest_store_products', {
      p_store_id: storeId,
      p_run_id: runId,
      p_items: chunk,
    });

    if (error) {
      throw new Error(
        `Fallo la ingesta del lote ${offset}-${offset + chunk.length}: ${error.message}`,
      );
    }

    const counters = (data ?? {}) as Partial<IngestCounters>;
    totals.items_found += counters.items_found ?? 0;
    totals.items_new += counters.items_new ?? 0;
    totals.items_updated += counters.items_updated ?? 0;
    totals.items_unchanged += counters.items_unchanged ?? 0;
    totals.price_changes += counters.price_changes ?? 0;
  }

  return totals;
}

/**
 * Desactiva lo que dejo de aparecer. Solo tiene sentido despues de un barrido
 * de catalogo completo: llamarlo tras scrapear una categoria daria de baja el
 * resto de la tienda.
 */
export async function markDelistedProducts(storeId: string, runId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc('mark_delisted_products', {
    p_store_id: storeId,
    p_run_id: runId,
    p_scope_store_category_id: null,
  });

  if (error) throw new Error(`No se pudieron marcar los productos retirados: ${error.message}`);
  return (data as number) ?? 0;
}
