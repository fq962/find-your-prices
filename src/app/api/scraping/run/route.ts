import { after } from 'next/server';
import { assertCronAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { runDueTargets, runTargetById } from '@/server/scraping/runner';

/**
 * Punto de entrada del cron.
 *
 *   GET|POST /api/scraping/run?secret=...
 *     Corre todos los targets vencidos (next_run_at <= ahora).
 *
 *   GET|POST /api/scraping/run?secret=...&targetId=<uuid>
 *     Corre un target concreto sin importar su programacion.
 *
 * Parametros opcionales:
 *   limit           cuantos targets como maximo en esta tanda (default 5)
 *   timeBudgetMs    presupuesto de tiempo total (default 210000, tope 210000)
 *   waitMs          cuanto esperar el resultado antes de soltar la conexion
 *                   (default 20000)
 *
 * Respuesta hibrida: si la tanda termina antes de `waitMs` se responde 200 con
 * el resumen completo. Si no, se responde 202 y la tanda sigue corriendo tras
 * la respuesta (`after`), con el mismo techo de `maxDuration`. Existe porque
 * los servicios de cron externos cortan la peticion a los ~30 s y marcarian
 * como fallida cada tanda larga, aunque en realidad termine bien. El resultado
 * de una tanda que respondio 202 queda en scrape_runs (/admin/scraping).
 *
 * Ejemplo de cron-job.org / Vercel Cron, cada hora:
 *   https://tu-dominio.com/api/scraping/run?secret=EL_SECRETO&limit=2&timeBudgetMs=210000
 */

// El scraping toca la red y la base: nunca se cachea.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Techo de ejecucion en Vercel; el runner corta antes por su cuenta.
export const maxDuration = 300;

/**
 * Tope del presupuesto de scraping. El presupuesto solo corta la descarga: la
 * ingesta, las bajas, el cierre de la bitacora y el refresco del catalogo van
 * despues. Con 270 s de presupuesto sobre un techo de 300 s, un catalogo grande
 * no alcanzaba a cerrar y la plataforma mataba la funcion dejando la corrida
 * en 'running' para siempre. Se reservan ~90 s para todo lo de despues.
 */
const MAX_TIME_BUDGET_MS = 210_000;

async function handle(request: Request): Promise<Response> {
  try {
    assertCronAuthorized(request);

    const url = new URL(request.url);
    const targetId = url.searchParams.get('targetId');
    // Ojo con `Number(x) || default`: convertiria un limit=0 explicito en 5.
    const limit = numericParam(url.searchParams.get('limit'), 5);
    const timeBudgetMs = Math.min(
      numericParam(url.searchParams.get('timeBudgetMs'), MAX_TIME_BUDGET_MS),
      MAX_TIME_BUDGET_MS,
    );
    const waitMs = numericParam(url.searchParams.get('waitMs'), 20_000);

    const startedAt = new Date().toISOString();
    // Que se intento correr, para que la respuesta 202 no salga a ciegas.
    let planned: Array<{ id: string; name: string }> | null = null;
    // Arranca ya: el temporizador de abajo no la frena, solo decide como se
    // responde.
    const work = targetId
      ? runOne(targetId)
      : runBatch(limit, timeBudgetMs, (targets) => {
          planned = targets;
        });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), waitMs);
    });
    const first = await Promise.race([work, timedOut]);
    clearTimeout(timer);

    if (first !== 'timeout') return Response.json(first);

    // Un error a esta altura ya no tiene a quien responderle: se deja en el
    // log. El catch se engancha ya y no dentro del callback de `after`, que
    // corre recien al cerrar la respuesta y dejaria un rechazo sin manejar.
    const background = work.catch((error) => {
      console.error(
        `[scraping] La tanda iniciada a las ${startedAt} fallo tras responder 202: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    // Mantiene viva la funcion hasta que la tanda termine.
    after(() => background);

    return Response.json(
      {
        ok: true,
        accepted: true,
        startedAt,
        targets: targetId ? [{ id: targetId }] : planned,
        message: `La tanda sigue corriendo; tardo mas de ${waitMs} ms. Ver resultado en /admin/scraping.`,
      },
      { status: 202 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function runOne(targetId: string) {
  const result = await runTargetById(targetId, 'cron');
  return { ok: result.status !== 'failed', processed: [result], remaining: 0 };
}

async function runBatch(
  limit: number,
  timeBudgetMs: number,
  onPlanned: (targets: Array<{ id: string; name: string }>) => void,
) {
  const { processed, remaining } = await runDueTargets({
    limit,
    timeBudgetMs,
    trigger: 'cron',
    onPlanned,
  });

  return {
    ok: processed.every((run) => run.status !== 'failed'),
    ranAt: new Date().toISOString(),
    processed,
    // > 0 significa que quedaron targets vencidos para el proximo disparo.
    remaining,
    summary: {
      targets: processed.length,
      itemsFound: processed.reduce((sum, r) => sum + r.itemsFound, 0),
      itemsNew: processed.reduce((sum, r) => sum + r.itemsNew, 0),
      itemsUpdated: processed.reduce((sum, r) => sum + r.itemsUpdated, 0),
      priceChanges: processed.reduce((sum, r) => sum + r.priceChanges, 0),
    },
  };
}

/** Lee un parametro numerico respetando el 0 y descartando basura. */
function numericParam(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const GET = handle;
export const POST = handle;
