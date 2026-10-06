import { NextResponse } from "next/server";
import type { QuoteResponse } from "@/features/cart/types";
import { getQuoteOffers, MAX_QUOTE_IDS } from "@/server/services/quote";

/**
 * POST /api/quote   body: { ids: ["<uuid>", ...] }
 *
 * Precios vigentes y alternativas por tienda para lo que hay en el carrito.
 * Es POST y no GET porque cien uuids no caben con holgura en una URL, y
 * porque la respuesta no se cachea: una cotización vieja no sirve.
 *
 * Sin base configurada (un clon recién bajado) responde 503 y la vista se
 * queda con los precios guardados en el navegador, avisando que no son
 * vigentes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  let ids: string[] = [];
  try {
    const payload = (await request.json()) as { ids?: unknown };
    if (Array.isArray(payload?.ids)) {
      ids = payload.ids
        .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
        .slice(0, MAX_QUOTE_IDS);
    }
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (ids.length === 0) {
    const empty: QuoteResponse = { lines: [], checkedAt: new Date().toISOString() };
    return NextResponse.json(empty);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "no database" }, { status: 503 });
  }

  try {
    const body: QuoteResponse = {
      lines: await getQuoteOffers(ids),
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[quote]", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
