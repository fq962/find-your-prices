import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { withRetry } from '@/server/services/catalog';
import type {
  QuoteAvailability,
  QuoteLineResult,
  QuoteOffer,
} from '@/features/cart/types';

/**
 * Cotización: precios vigentes de lo que alguien juntó en el carrito, y dónde
 * más se vende lo mismo.
 *
 * El carrito vive en el navegador con una foto de cada producto del día en que
 * se agregó. Eso alcanza para pintar, no para decidir: una cotización con
 * precios de hace dos semanas es una lista de deseos. Este servicio vuelve a
 * leer cada artículo de `mv_catalog` y, por el código de barras, busca el
 * mismo artículo en las otras tiendas.
 *
 * Por qué el GTIN y no `product_id`: el emparejamiento canónico existe en el
 * esquema (0007) pero todavía no se llena; el código de barras sí, en un
 * tercio del catálogo, y medido el 2026-10-06 hay ~5 200 códigos que aparecen
 * en más de una tienda (casi todos Paiz ↔ Walmart). Es un emparejamiento
 * exacto: si el código coincide, es el mismo artículo. Donde no hay código, la
 * cotización simplemente no sugiere alternativas.
 */

/** Tope de renglones por consulta. Coincide con `MAX_CART_LINES`. */
export const MAX_QUOTE_IDS = 100;

/** Cuántas tiendas alternativas se devuelven por renglón. */
const MAX_ALTERNATIVES = 3;

const COLUMNS =
  'id, public_slug, name, brand, store_name, store_slug, store_category_name, category_raw, ' +
  'category_name, price, list_price, currency, url, primary_image_url, availability, ' +
  'last_seen_at, last_price_change_at, gtin';

/** Mismo piso que el catálogo: lo que no se puede comprar no es alternativa. */
const UNAVAILABLE_STATES = ['out_of_stock', 'discontinued'];

interface OfferRow {
  id: string;
  public_slug: string | null;
  name: string;
  brand: string | null;
  store_name: string;
  store_slug: string;
  store_category_name: string | null;
  category_raw: string | null;
  category_name: string | null;
  price: number | string | null;
  list_price: number | string | null;
  currency: string | null;
  url: string | null;
  primary_image_url: string | null;
  availability: QuoteAvailability | null;
  last_seen_at: string;
  last_price_change_at: string | null;
  gtin: string | null;
}

function toOffer(row: OfferRow): QuoteOffer {
  const listPrice = row.list_price === null ? undefined : Number(row.list_price);
  return {
    id: row.id,
    slug: row.public_slug ?? undefined,
    name: row.name,
    brand: row.brand ?? undefined,
    store: row.store_name,
    storeSlug: row.store_slug,
    storeCategory: row.store_category_name ?? row.category_raw ?? undefined,
    category: row.category_name ?? undefined,
    price: Number(row.price ?? 0),
    listPrice,
    currency: row.currency ?? 'HNL',
    url: row.url ?? undefined,
    imageUrl: row.primary_image_url ?? undefined,
    availability: row.availability ?? 'unknown',
    priceSeenAt: row.last_seen_at,
    priceSince: row.last_price_change_at ?? undefined,
    gtin: row.gtin ?? undefined,
  };
}

/**
 * Ofertas vigentes para cada id, en el mismo orden en que llegaron.
 *
 * Dos consultas, no una por renglón: los artículos por id y, de una vez,
 * todas las alternativas por código de barras. Con cien renglones son dos
 * viajes a la base en vez de doscientos.
 */
export async function getQuoteOffers(ids: string[]): Promise<QuoteLineResult[]> {
  const unique = [...new Set(ids)].slice(0, MAX_QUOTE_IDS);
  if (unique.length === 0) return [];

  return withRetry('cotización', async () => {
    const db = getSupabaseAdmin();

    const { data, error } = await db.from('mv_catalog').select(COLUMNS).in('id', unique);
    if (error) throw new Error(error.message);

    const byId = new Map<string, QuoteOffer>();
    for (const row of (data ?? []) as unknown as OfferRow[]) byId.set(row.id, toOffer(row));

    const gtins = [...new Set([...byId.values()].map((offer) => offer.gtin).filter(Boolean))] as string[];
    const byGtin = new Map<string, QuoteOffer[]>();

    if (gtins.length > 0) {
      const { data: matches, error: matchError } = await db
        .from('mv_catalog')
        .select(COLUMNS)
        .in('gtin', gtins)
        .gt('price', 0)
        .not('availability', 'in', `("${UNAVAILABLE_STATES.join('","')}")`)
        .order('price', { ascending: true })
        .limit(gtins.length * 12);
      if (matchError) throw new Error(matchError.message);

      for (const row of (matches ?? []) as unknown as OfferRow[]) {
        if (!row.gtin) continue;
        const list = byGtin.get(row.gtin) ?? [];
        list.push(toOffer(row));
        byGtin.set(row.gtin, list);
      }
    }

    return unique.map((id) => {
      const offer = byId.get(id) ?? null;
      return { id, offer, alternatives: offer ? alternativesFor(offer, byGtin) : [] };
    });
  });
}

/**
 * Las otras tiendas que venden lo mismo, la más barata primero y una sola
 * oferta por tienda: si una tienda publica el mismo código dos veces (pasa con
 * presentaciones), interesa la más barata, no las dos.
 */
function alternativesFor(offer: QuoteOffer, byGtin: Map<string, QuoteOffer[]>): QuoteOffer[] {
  if (!offer.gtin) return [];
  const candidates = byGtin.get(offer.gtin) ?? [];
  const seenStores = new Set<string>([offer.storeSlug]);
  const result: QuoteOffer[] = [];

  for (const candidate of candidates) {
    if (seenStores.has(candidate.storeSlug)) continue;
    seenStores.add(candidate.storeSlug);
    result.push(candidate);
    if (result.length === MAX_ALTERNATIVES) break;
  }

  return result;
}
