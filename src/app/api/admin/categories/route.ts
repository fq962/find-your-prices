import { assertAdminAuthorized } from '@/server/scraping/api-guard';
import {
  categoryErrorResponse,
  createCategory,
  loadCategoryAdminData,
} from '@/server/services/categories';

/**
 * Árbol canónico de categorías, para el panel.
 *
 *   GET  /api/admin/categories   -> árbol, categorías de tienda y uso
 *   POST /api/admin/categories   -> alta de un nodo
 *
 * Misma puerta que el panel de scraping: abierta mientras ADMIN_API_SECRET no
 * esté definido.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const data = await loadCategoryAdminData();
    return Response.json({ ok: true, ...data });
  } catch (error) {
    return categoryErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const body = (await request.json()) as Record<string, unknown>;
    const category = await createCategory({
      name: typeof body.name === 'string' ? body.name : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      parent_id: typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : null,
      description: typeof body.description === 'string' ? body.description : undefined,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      position: typeof body.position === 'number' ? body.position : undefined,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
    });
    return Response.json({ ok: true, category }, { status: 201 });
  } catch (error) {
    return categoryErrorResponse(error);
  }
}
