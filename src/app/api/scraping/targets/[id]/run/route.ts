import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { runTargetById } from '@/server/scraping/runner';

/**
 * POST /api/scraping/targets/:id/run
 * Corre un target de inmediato. Es el boton "Ejecutar ahora" del panel.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const { id } = await params;

    const result = await runTargetById(id, 'manual');
    return Response.json({ ok: result.status !== 'failed', result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
