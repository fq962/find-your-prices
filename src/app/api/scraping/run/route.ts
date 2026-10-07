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
 *
 * La respuesta llega cuando la tanda termina, nunca antes. El sitio corre en
 * Cloudflare Workers: el trabajo vive mientras el cliente siga conectado, y
 * despues de responder (o de que el cliente corte) solo quedan 30 s de
 * `waitUntil` antes de que se cancele sin aviso. Entre el 05-oct y el 07-oct
 * el endpoint respondia 202 a los 20 s y seguia con `after()`: toda tanda de
 * mas de ~50 s moria a medias y dejaba la corrida en 'running'.
 *
 * Por eso quien llame tiene que esperar varios minutos. cron-job.org corta a
 * los 30 s y no sirve; el disparo horario lo hace
 * .github/workflows/scrape-cron.yml con un timeout de 15 min.
 */

// El scraping toca la red y la base: nunca se cachea.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Sin efecto en Cloudflare; queda por si el sitio vuelve a un host que lo use.
export const maxDuration = 300;

/**
 * Tope del presupuesto de scraping. El presupuesto solo corta la descarga: la
 * ingesta, las bajas, el cierre de la bitacora y el refresco del catalogo van
 * despues, y necesitan su propio margen.
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

    return Response.json(targetId ? await runOne(targetId) : await runBatch(limit, timeBudgetMs));
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function runOne(targetId: string) {
  const result = await runTargetById(targetId, 'cron');
  return { ok: result.status !== 'failed', processed: [result], remaining: 0 };
}

async function runBatch(limit: number, timeBudgetMs: number) {
  const { processed, remaining } = await runDueTargets({ limit, timeBudgetMs, trigger: 'cron' });

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
