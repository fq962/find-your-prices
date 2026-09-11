import { assertAdminAuthorized } from '@/server/scraping/api-guard';
import {
  categoryErrorResponse,
  deleteCategory,
  updateCategory,
} from '@/server/services/categories';

/**
 * Un nodo del árbol canónico.
 *
 *   PATCH  /api/admin/categories/:id  -> renombrar, mover, activar, reordenar
 *   DELETE /api/admin/categories/:id  -> borrar (solo si nada cuelga de él)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const category = await updateCategory(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      // `null` explícito mueve el nodo a la raíz; ausente no toca el padre.
      parent_id:
        body.parent_id === null
          ? null
          : typeof body.parent_id === 'string'
            ? body.parent_id
            : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      icon: typeof body.icon === 'string' ? body.icon : undefined,
      position: typeof body.position === 'number' ? body.position : undefined,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
    });
    return Response.json({ ok: true, category });
  } catch (error) {
    return categoryErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    assertAdminAuthorized(request);
    const { id } = await context.params;
    await deleteCategory(id);
    return Response.json({ ok: true });
  } catch (error) {
    return categoryErrorResponse(error);
  }
}
