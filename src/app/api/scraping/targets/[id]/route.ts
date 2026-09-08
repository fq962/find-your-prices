import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { getSupabaseAdmin } from '@/server/db/supabase';

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
