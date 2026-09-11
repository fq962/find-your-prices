import { assertAdminAuthorized } from '@/server/scraping/api-guard';
import { assignStoreCategories, categoryErrorResponse } from '@/server/services/categories';

/**
 * Mapeo de categorías de tienda hacia el árbol canónico.
 *
 *   PATCH /api/admin/categories/mappings
 *   body: { store_category_ids: string[], category_id: string | null }
 *
 * `category_id: null` quita la relación: esas categorías vuelven a "sin
 * categorizar aún" en el catálogo.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const body = (await request.json()) as Record<string, unknown>;

    const ids = Array.isArray(body.store_category_ids)
      ? body.store_category_ids.filter((id): id is string => typeof id === 'string')
      : [];
    const categoryId = typeof body.category_id === 'string' && body.category_id ? body.category_id : null;

    const updated = await assignStoreCategories(ids, categoryId);
    return Response.json({ ok: true, updated });
  } catch (error) {
    return categoryErrorResponse(error);
  }
}
