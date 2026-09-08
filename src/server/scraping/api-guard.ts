import 'server-only';

/**
 * Autenticacion de los endpoints de scraping y administracion.
 *
 * Hay dos puertas distintas:
 *
 *  - CRON_SECRET protege /api/scraping/run, el endpoint que dispara el cron
 *    externo. Sin secreto configurado el endpoint queda cerrado: un scraper
 *    abierto a internet es un ataque de denegacion de servicio gratis contra
 *    las tiendas que rastreamos.
 *
 *  - ADMIN_API_SECRET protege el CRUD del panel. Mientras no exista OAuth se
 *    puede dejar sin configurar y el panel queda abierto, tal como se acordo
 *    para la primera etapa. Al definir la variable, el panel exige el token.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'No autorizado') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function extractToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();

  const custom = request.headers.get('x-scraper-secret');
  if (custom) return custom.trim();

  // Muchos servicios de cron solo permiten configurar una url, sin cabeceras.
  const url = new URL(request.url);
  return url.searchParams.get('secret');
}

/** Comparacion en tiempo constante, para no filtrar el secreto por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Puerta del endpoint de cron. Siempre exige secreto. */
export function assertCronAuthorized(request: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new UnauthorizedError(
      'CRON_SECRET no esta configurado. Definilo en .env.local antes de exponer el endpoint.',
    );
  }

  const token = extractToken(request);
  if (!token || !safeEqual(token, expected)) {
    throw new UnauthorizedError('Secreto de cron invalido');
  }
}

/** Puerta del panel. Abierta mientras ADMIN_API_SECRET no este definido. */
export function assertAdminAuthorized(request: Request): void {
  const expected = process.env.ADMIN_API_SECRET;
  if (!expected) return;

  const token = extractToken(request);
  if (!token || !safeEqual(token, expected)) {
    throw new UnauthorizedError('Secreto de administracion invalido');
  }
}

/** Convierte cualquier error en una respuesta json coherente. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ ok: false, error: error.message }, { status: 401 });
  }

  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, error: message }, { status: 500 });
}
