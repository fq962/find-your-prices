import { revalidatePath } from 'next/cache';
import { assertCronAuthorized, toErrorResponse } from '@/server/scraping/api-guard';

/**
 * POST /api/revalidate?secret=<CRON_SECRET>&path=/
 *
 * Tira la copia cacheada de una página y obliga a que la siguiente visita la
 * genere de nuevo contra la base.
 *
 * Por qué hace falta: la portada y las fichas son estáticas con `revalidate`,
 * y eso es lo correcto —se sirven al instante y no golpean la base por
 * visitante—. El precio es que una página generada en un mal momento se queda
 * congelada hasta que venza su plazo. Pasó de verdad: durante una migración
 * larga la base quedó bloqueada, la portada se regeneró justo entonces, guardó
 * un catálogo vacío y siguió sirviendo eso aunque la base ya estuviera bien.
 * Sin esta puerta la única salida era volver a desplegar.
 *
 * Usa el mismo secreto que el cron de scraping, porque es la misma clase de
 * operación: algo que dispara trabajo en el servidor y que no puede quedar
 * abierto a internet. Sin `CRON_SECRET` configurado el endpoint responde 401,
 * nunca abierto.
 *
 * Es POST y no GET a propósito: un GET que cambia estado del servidor lo puede
 * disparar un prefetch del navegador o un rastreador que encuentre la URL.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lo que se refresca cuando no se pide nada en concreto.
 *
 * Las dos portadas, porque son la misma página en dos idiomas y quien pide
 * "refrescá la home" las quiere las dos. Las fichas de producto no entran acá:
 * son decenas de miles y se revalidan solas cada diez minutos.
 */
const DEFAULT_PATHS = ['/', '/en'];

export async function POST(request: Request): Promise<Response> {
  try {
    assertCronAuthorized(request);

    const url = new URL(request.url);
    // `path` se puede repetir: ?path=/&path=/en&path=/p/algun-producto
    const requested = url.searchParams.getAll('path').filter((path) => path.startsWith('/'));
    const paths = requested.length > 0 ? requested : DEFAULT_PATHS;

    for (const path of paths) revalidatePath(path);

    return Response.json({ ok: true, revalidated: paths, at: new Date().toISOString() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
