import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { nextRunFromAnchor } from '@/lib/schedule';

/**
 *   PATCH  /api/scraping/targets/:id   -> edita un target
 *   DELETE /api/scraping/targets/:id   -> lo elimina
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Campos que el panel puede tocar. El resto lo administra el runner. */
const EDITABLE_FIELDS = new Set([
  'name',
  'kind',
  'url',
  'strategy_key',
  'config',
  'frequency_minutes',
  'cron_expression',
  'schedule_anchor_at',
  'priority',
  'max_pages',
  'is_active',
  'next_run_at',
  'notes',
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const { id } = await params;

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (EDITABLE_FIELDS.has(key)) patch[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: false, error: 'No hay campos editables en la peticion' }, { status: 400 });
    }

    // Reactivar un target pausado tambien limpia el motivo y el contador de
    // fallos: si no, el circuit breaker lo volveria a pausar al primer error.
    if (patch.is_active === true) {
      patch.paused_reason = null;
      patch.consecutive_failures = 0;
    }

    /**
     * Cambiar el horario tiene que surtir efecto ya, no despues de la proxima
     * corrida. Si se toco el ancla o el intervalo y el que llama no fijo un
     * `next_run_at` explicito, se recalcula el primer punto de la rejilla.
     *
     * Hace falta leer la fila para el caso de que solo venga uno de los dos
     * campos: el otro sigue siendo el que ya estaba guardado.
     */
    const touchedSchedule = 'schedule_anchor_at' in patch || 'frequency_minutes' in patch;
    if (touchedSchedule && !('next_run_at' in patch)) {
      const { data: current, error: readError } = await getSupabaseAdmin()
        .from('scrape_targets')
        .select('schedule_anchor_at, frequency_minutes')
        .eq('id', id)
        .single();
      if (readError) throw new Error(readError.message);

      const anchor = ('schedule_anchor_at' in patch ? patch.schedule_anchor_at : current?.schedule_anchor_at) as
        | string
        | null
        | undefined;
      const frequency = Number(
        'frequency_minutes' in patch ? patch.frequency_minutes : current?.frequency_minutes,
      );

      if (anchor && Number.isFinite(frequency) && frequency > 0) {
        patch.next_run_at = nextRunFromAnchor(anchor, frequency).toISOString();
      }
    }

    const { data, error } = await getSupabaseAdmin()
      .from('scrape_targets')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return Response.json({ ok: true, target: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const { id } = await params;

    const { error } = await getSupabaseAdmin().from('scrape_targets').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
