import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { getSupabaseAdmin } from '@/server/db/supabase';

/**
 * GET /api/scraping/runs?targetId=<uuid>&limit=50
 * Bitacora de corridas, mas reciente primero.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);

    const url = new URL(request.url);
    const targetId = url.searchParams.get('targetId');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    let query = getSupabaseAdmin()
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (targetId) query = query.eq('target_id', targetId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return Response.json({ ok: true, runs: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
