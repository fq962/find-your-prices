import { assertAdminAuthorized, toErrorResponse } from '@/server/scraping/api-guard';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { hasStrategy } from '@/server/scraping/registry';

/**
 *   GET  /api/scraping/stores  -> tiendas registradas
 *   POST /api/scraping/stores  -> alta de una tienda nueva
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);

    const { data, error } = await getSupabaseAdmin()
      .from('stores')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return Response.json({ ok: true, stores: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const body = (await request.json()) as Record<string, unknown>;

    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const baseUrl = typeof body.base_url === 'string' ? body.base_url.trim() : '';
    const strategyKey = typeof body.strategy_key === 'string' ? body.strategy_key : '';

    if (!slug || !name || !baseUrl || !strategyKey) {
      return Response.json(
        { ok: false, error: 'slug, name, base_url y strategy_key son obligatorios' },
        { status: 400 },
      );
    }

    // Sin estrategia implementada la tienda no podria correr nunca: se rechaza
    // aqui en vez de dejar que falle en la primera corrida.
    if (!hasStrategy(strategyKey)) {
      return Response.json(
        { ok: false, error: `No existe una estrategia registrada con la clave "${strategyKey}"` },
        { status: 400 },
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('stores')
      .insert({
        slug,
        name,
        base_url: baseUrl,
        strategy_key: strategyKey,
        logo_url: typeof body.logo_url === 'string' ? body.logo_url : null,
        country_code: typeof body.country_code === 'string' ? body.country_code : 'HN',
        default_currency: typeof body.default_currency === 'string' ? body.default_currency : 'HNL',
        config: typeof body.config === 'object' && body.config !== null ? body.config : {},
        request_delay_ms: Number(body.request_delay_ms) >= 0 ? Number(body.request_delay_ms) : 500,
        is_active: body.is_active !== false,
        notes: typeof body.notes === 'string' ? body.notes : null,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return Response.json({ ok: false, error: `Ya existe una tienda con el slug "${slug}"` }, { status: 400 });
      }
      throw new Error(error.message);
    }

    return Response.json({ ok: true, store: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
