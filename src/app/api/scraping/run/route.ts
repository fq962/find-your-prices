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
 *   timeBudgetMs    presupuesto de tiempo total (default 240000)
 *
 * Ejemplo de cron-job.org / Vercel Cron, cada 30 minutos:
 *   https://tu-dominio.com/api/scraping/run?secret=EL_SECRETO
 */

// El scraping toca la red y la base: nunca se cachea.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Techo de ejecucion en Vercel; el runner corta antes por su cuenta.
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  try {
    assertCronAuthorized(request);

    const url = new URL(request.url);
    const targetId = url.searchParams.get('targetId');
    // Ojo con `Number(x) || default`: convertiria un limit=0 explicito en 5.
    const limit = numericParam(url.searchParams.get('limit'), 5);
    const timeBudgetMs = numericParam(url.searchParams.get('timeBudgetMs'), 240_000);

    if (targetId) {
      const result = await runTargetById(targetId, 'cron');
      return Response.json({ ok: result.status !== 'failed', processed: [result], remaining: 0 });
    }

    const { processed, remaining } = await runDueTargets({ limit, timeBudgetMs, trigger: 'cron' });

    return Response.json({
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
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Lee un parametro numerico respetando el 0 y descartando basura. */
function numericParam(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const GET = handle;
export const POST = handle;
