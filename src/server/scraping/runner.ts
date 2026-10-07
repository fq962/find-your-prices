import 'server-only';
import { createHash } from 'node:crypto';
import { createHttpClient } from './http';
import { getStrategy } from './registry';
import {
  createRun,
  finishRun,
  getDueTargets,
  getStoreById,
  getTargetById,
  ingestProducts,
  markDelistedProducts,
  reapStaleRuns,
  recordHeartbeat,
  refreshCatalog,
  updateTargetAfterRun,
  upsertStoreCategories,
} from './repository';
import type { RunProgress } from './repository';
import type {
  NormalizedProduct,
  ScrapeRunStatus,
  ScrapeTargetRow,
  ScrapeTrigger,
  StoreRow,
} from './types';

/**
 * Runner: el unico lugar que sabe orquestar una corrida completa.
 *
 * Es agnostico de la tienda. Recibe un target, busca su estrategia, la ejecuta
 * y se encarga de todo lo transversal: bitacora, categorias, hashes, ingesta,
 * bajas, reprogramacion y manejo de errores.
 */

/**
 * Presupuesto de tiempo por corrida. Las funciones serverless tienen limite de
 * ejecucion; se aborta antes para poder cerrar la bitacora en vez de morir a
 * medias y dejar la corrida colgada en estado 'running'.
 */
const DEFAULT_TIME_BUDGET_MS = 240_000;

/** Cada cuanto una corrida viva escribe su latido en `scrape_runs`. */
const HEARTBEAT_MS = 10_000;

/**
 * Silencio tras el cual una corrida en 'running' se da por muerta. Son doce
 * latidos perdidos: el temporizador del latido corre aunque la estrategia este
 * esperando la red, asi que solo se calla si el proceso murio o lo congelaron.
 */
const STALE_RUN_MS = 2 * 60_000;

/**
 * Cierra las corridas huerfanas y reprograma sus targets como fallo (backoff y,
 * tras `failure_threshold` seguidos, pausa automatica: un target que siempre
 * muere por tiempo no debe seguir ahogando la cola). Nunca tumba la tanda.
 */
export async function recoverStaleRuns(): Promise<void> {
  try {
    const targetIds = await reapStaleRuns(STALE_RUN_MS);
    for (const targetId of targetIds) {
      const target = await getTargetById(targetId);
      await updateTargetAfterRun({
        target,
        status: 'failed',
        errorMessage: 'La corrida anterior dejo de responder antes de cerrarse',
      });
    }
  } catch (error) {
    console.error(
      `[scraping] No se pudieron recuperar corridas colgadas: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface RunResult {
  targetId: string;
  targetName: string;
  storeSlug: string;
  runId: string | null;
  status: ScrapeRunStatus;
  durationMs: number;
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  itemsDelisted: number;
  priceChanges: number;
  pagesFetched: number;
  errorMessage?: string;
  warnings: string[];
}

/**
 * Hash estable del contenido de un producto.
 *
 * Se excluyen `raw` y el propio hash: `raw` trae marcas de tiempo de la tienda
 * (updatedAt de cada imagen, por ejemplo) que cambian sin que cambie nada real,
 * y harian que cada corrida marcara los 8000 articulos como modificados.
 * Las claves se ordenan para que el hash no dependa del orden del json.
 */
function computeContentHash(product: NormalizedProduct): string {
  const content: Partial<NormalizedProduct> = { ...product };
  delete content.raw;
  delete content.content_hash;

  const stable = JSON.stringify(content, Object.keys(content).sort());
  return createHash('sha1').update(stable).digest('hex');
}

/** Ejecuta un target concreto de punta a punta. */
export async function runTarget(options: {
  target: ScrapeTargetRow;
  store?: StoreRow;
  trigger?: ScrapeTrigger;
  timeBudgetMs?: number;
}): Promise<RunResult> {
  const startedAt = Date.now();
  const { target, trigger = 'cron', timeBudgetMs = DEFAULT_TIME_BUDGET_MS } = options;
  const store = options.store ?? (await getStoreById(target.store_id));

  const warnings: string[] = [];
  const logEntries: Array<Record<string, unknown>> = [];
  let lastMessage: string | undefined;
  const log = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    logEntries.push({ level, message, at: new Date().toISOString(), ...(meta ? { meta } : {}) });
    lastMessage = message;
    if (level !== 'info') warnings.push(message);
  };

  const base: Omit<RunResult, 'status' | 'runId'> = {
    targetId: target.id,
    targetName: target.name,
    storeSlug: store.slug,
    durationMs: 0,
    itemsFound: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsDelisted: 0,
    priceChanges: 0,
    pagesFetched: 0,
    warnings,
  };

  if (!store.is_active) {
    return { ...base, runId: null, status: 'skipped', errorMessage: 'La tienda esta inactiva' };
  }

  const strategyKey = target.strategy_key ?? store.strategy_key;
  const strategy = getStrategy(strategyKey);

  if (!strategy.supports.includes(target.kind)) {
    throw new Error(
      `La estrategia "${strategyKey}" no soporta targets de tipo "${target.kind}" ` +
        `(soporta: ${strategy.supports.join(', ')})`,
    );
  }

  // Lock a nivel de datos: si ya hay una corrida viva para este target, se sale.
  const created = await createRun({
    targetId: target.id,
    storeId: store.id,
    strategyKey,
    trigger,
  });

  if ('skipped' in created) {
    return { ...base, runId: null, status: 'skipped', errorMessage: created.reason };
  }

  const runId = created.runId;
  const tag = `[scraping] ${target.name} (${runId})`;
  console.info(`${tag}: arranca (${trigger})`);
  const abortController = new AbortController();
  const budgetTimer = setTimeout(() => abortController.abort(), timeBudgetMs);

  const http = createHttpClient({
    userAgent: store.user_agent,
    delayMs: store.request_delay_ms,
    timeoutMs: store.request_timeout_ms,
    retries: store.max_retries,
    signal: abortController.signal,
  });

  let status: ScrapeRunStatus = 'success';
  let errorMessage: string | undefined;
  let pagesFetched = 0;
  let itemsDelisted = 0;
  let counters = {
    items_found: 0,
    items_new: 0,
    items_updated: 0,
    items_unchanged: 0,
    price_changes: 0,
  };
  let strategyStats: Record<string, unknown> = {};

  /**
   * Latido. Si el proceso muere a mitad de camino, lo ultimo que escribio queda
   * en la fila: etapa, requests y log hasta ese momento. Sin esto una corrida
   * muerta es indistinguible de una lenta.
   */
  let stage = 'descarga';
  const progress = (): RunProgress => ({
    at: new Date().toISOString(),
    stage,
    httpRequests: http.stats.requests,
    httpErrors: http.stats.errors,
    bytes: http.stats.bytes,
    ...(lastMessage ? { lastMessage } : {}),
  });
  const beat = () => void recordHeartbeat(runId, progress(), logEntries);
  const setStage = (next: string) => {
    stage = next;
    console.info(`${tag}: ${next} (${http.stats.requests} requests)`);
    beat();
  };
  const heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  beat();

  try {
    // stores.config es la base; scrape_targets.config la especializa.
    const config = { ...(store.config ?? {}), ...(target.config ?? {}) };

    const result = await strategy.run({ store, target, config, http, signal: abortController.signal, log });
    pagesFetched = result.pagesFetched;
    strategyStats = result.stats ?? {};
    setStage(`categorias (${result.products.length} productos descargados en ${pagesFetched} paginas)`);

    for (const error of result.errors ?? []) {
      log('error', error.message, { stage: error.stage, ...(error.meta ?? {}) });
    }

    // 1) Categorias primero: los productos necesitan su id para enlazarse.
    let categoryMap = new Map<string, string>();
    if (result.categories && result.categories.length > 0) {
      categoryMap = await upsertStoreCategories(store.id, result.categories);
    } else if (result.products.some((p) => p.store_category_external_id)) {
      // No vinieron categorias en esta corrida, pero los productos las
      // referencian: se reutiliza el arbol ya guardado.
      categoryMap = await upsertStoreCategories(store.id, []);
    }

    // 2) Completar lo que la estrategia no tiene por que saber.
    const products = result.products.map((product) => {
      const storeCategoryId = product.store_category_external_id
        ? categoryMap.get(product.store_category_external_id) ?? null
        : null;

      const enriched: NormalizedProduct = {
        ...product,
        currency: product.currency ?? store.default_currency,
        store_category_id: storeCategoryId,
      };
      // El campo externo ya cumplio su funcion; no es columna de la tabla.
      delete enriched.store_category_external_id;

      return { ...enriched, content_hash: product.content_hash ?? computeContentHash(enriched) };
    });

    // 3) Ingesta.
    if (products.length > 0) {
      setStage(`ingesta de ${products.length} productos`);
      counters = await ingestProducts(store.id, runId, products);
    }

    // 4) Bajas: solo cuando el barrido cubrio toda la tienda.
    const markDelisted = target.kind === 'full_catalog' && config.markDelisted !== false;
    if (markDelisted && products.length > 0 && (result.errors ?? []).length === 0) {
      setStage('bajas');
      itemsDelisted = await markDelistedProducts(store.id, runId);
    }

    if (abortController.signal.aborted) {
      status = 'partial';
      errorMessage = 'La corrida se corto por limite de tiempo';
      log('warn', errorMessage);
    } else if ((result.errors ?? []).length > 0) {
      status = 'partial';
      errorMessage = result.errors![0].message;
    } else if (products.length === 0) {
      // Cero productos casi siempre significa que el sitio cambio: hay que verlo.
      status = 'failed';
      errorMessage = 'La estrategia no devolvio ningun producto';
      log('error', errorMessage);
    }
  } catch (error) {
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
    log('error', errorMessage);
  } finally {
    clearTimeout(budgetTimer);
    clearInterval(heartbeatTimer);
  }

  const durationMs = Date.now() - startedAt;

  await finishRun(runId, {
    status,
    duration_ms: durationMs,
    pages_fetched: pagesFetched,
    items_found: counters.items_found,
    items_new: counters.items_new,
    items_updated: counters.items_updated,
    items_unchanged: counters.items_unchanged,
    items_delisted: itemsDelisted,
    price_changes: counters.price_changes,
    http_requests: http.stats.requests,
    http_errors: http.stats.errors,
    bytes_downloaded: http.stats.bytes,
    error_message: errorMessage ?? null,
    error_log: logEntries.filter((entry) => entry.level !== 'info'),
    stats: strategyStats,
  });
  console.info(`${tag}: ${status} en ${(durationMs / 1000).toFixed(1)} s${errorMessage ? ` - ${errorMessage}` : ''}`);

  await updateTargetAfterRun({ target, status, errorMessage });

  return {
    ...base,
    runId,
    status,
    durationMs,
    itemsFound: counters.items_found,
    itemsNew: counters.items_new,
    itemsUpdated: counters.items_updated,
    itemsUnchanged: counters.items_unchanged,
    itemsDelisted,
    priceChanges: counters.price_changes,
    pagesFetched,
    errorMessage,
  };
}

/**
 * Si lo que devolvieron estas corridas cambia algo de lo que el catalogo
 * publico muestra. Una corrida que solo confirmo que todo sigue igual (o que
 * fallo antes de ingerir nada) no justifica recomputar la materializada.
 */
export function runsChangedCatalog(results: RunResult[]): boolean {
  return results.some(
    (run) => run.itemsNew + run.itemsUpdated + run.itemsDelisted + run.priceChanges > 0,
  );
}

/**
 * Hace visible lo ingerido: refresca `mv_catalog` (0030) si hubo cambios.
 * Va al final de la tanda y no de cada target: cinco targets seguidos son un
 * refresco, no cinco.
 */
async function publishCatalog(results: RunResult[], trigger: ScrapeTrigger): Promise<void> {
  if (!runsChangedCatalog(results)) return;
  await refreshCatalog(`runner:${trigger}`);
}

/** Corre un target por id. Lo usa el boton "Ejecutar ahora" del panel. */
export async function runTargetById(
  targetId: string,
  trigger: ScrapeTrigger = 'manual',
): Promise<RunResult> {
  await recoverStaleRuns();
  const target = await getTargetById(targetId);
  const result = await runTarget({ target, trigger });
  await publishCatalog([result], trigger);
  return result;
}

/**
 * Corre todos los targets vencidos. Es el punto de entrada del cron job.
 *
 * Los targets se procesan en serie a proposito: cada uno ya trae su propia
 * politica de concurrencia y cortesia, y encadenarlos mantiene acotado el uso
 * de memoria y de conexiones.
 */
export async function runDueTargets(options?: {
  limit?: number;
  timeBudgetMs?: number;
  trigger?: ScrapeTrigger;
}): Promise<{ processed: RunResult[]; remaining: number }> {
  const limit = options?.limit ?? 5;
  const totalBudget = options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const deadline = Date.now() + totalBudget;

  // Antes de mirar la cola: un huerfano la encabezaria para siempre.
  await recoverStaleRuns();

  const targets = await getDueTargets(limit + 1);
  const toRun = targets.slice(0, limit);
  const processed: RunResult[] = [];

  // Cache de tiendas: varios targets suelen compartir la misma.
  const storeCache = new Map<string, StoreRow>();

  for (const target of toRun) {
    const remainingBudget = deadline - Date.now();
    // Menos de 15s no alcanza ni para abrir y cerrar la bitacora: mejor dejarlo
    // para el proximo disparo del cron.
    if (remainingBudget < 15_000) break;

    let store = storeCache.get(target.store_id);
    if (!store) {
      store = await getStoreById(target.store_id);
      storeCache.set(target.store_id, store);
    }

    try {
      processed.push(
        await runTarget({
          target,
          store,
          trigger: options?.trigger ?? 'cron',
          timeBudgetMs: remainingBudget,
        }),
      );
    } catch (error) {
      // Un target roto no debe tumbar al resto de la tanda.
      processed.push({
        targetId: target.id,
        targetName: target.name,
        storeSlug: store.slug,
        runId: null,
        status: 'failed',
        durationMs: 0,
        itemsFound: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        itemsUnchanged: 0,
        itemsDelisted: 0,
        priceChanges: 0,
        pagesFetched: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
        warnings: [],
      });
    }
  }

  await publishCatalog(processed, options?.trigger ?? 'cron');

  return { processed, remaining: Math.max(0, targets.length - toRun.length) };
}
