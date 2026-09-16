import { recordProductClick } from "@/server/services/categoryPages";

/**
 * POST /api/products/click   body: { id: "<uuid>" }
 *
 * Suma un clic a un producto. Lo llama `ProductClickTracker` con
 * `sendBeacon`, así que la respuesta no la lee nadie: siempre 204, incluso
 * ante basura, para no gastar en explicarle nada a un bot.
 *
 * Es público y sin secreto a propósito: el único efecto posible es sumar uno
 * a un contador de popularidad, y un abuso deja como mucho un producto mal
 * ordenado en una sección. No vale una llave.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as { id?: unknown };
    const id = typeof payload?.id === "string" ? payload.id : "";
    if (UUID_PATTERN.test(id)) await recordProductClick(id);
  } catch {
    // Cuerpo inválido o base caída: se ignora, ver arriba.
  }
  return new Response(null, { status: 204 });
}
