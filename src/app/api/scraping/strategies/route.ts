import { toErrorResponse } from '@/server/scraping/api-guard';
import { listStrategies } from '@/server/scraping/registry';

/**
 * GET /api/scraping/strategies
 * Estrategias disponibles y los parametros de config que espera cada una.
 * El panel lo usa para armar el formulario de alta de un target.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    return Response.json({ ok: true, strategies: listStrategies() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
