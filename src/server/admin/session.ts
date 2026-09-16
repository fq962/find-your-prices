import 'server-only';
import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { safeEqual } from '@/server/scraping/api-guard';

/**
 * Sesion del panel de administracion.
 *
 * No hay usuarios: la unica llave es CRON_SECRET, la misma que dispara el
 * scraping. Al desbloquear, el navegador recibe una cookie HttpOnly con un
 * HMAC del secreto (nunca el secreto en claro), asi una cookie filtrada no
 * sirve para llamar al cron. Rotar CRON_SECRET invalida todas las sesiones.
 */

export const ADMIN_SESSION_COOKIE = 'fyp_admin';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function expectedToken(secret: string): string {
  return createHmac('sha256', secret).update('admin-session-v1').digest('hex');
}

/** True si la cookie presente corresponde al CRON_SECRET actual. */
export async function hasAdminSession(): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return Boolean(token && safeEqual(token, expectedToken(secret)));
}

/** Valida la clave escrita y, si es correcta, deja la cookie de sesion. */
export async function openAdminSession(candidate: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(candidate, secret)) return false;

  (await cookies()).set(ADMIN_SESSION_COOKIE, expectedToken(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return true;
}

export async function closeAdminSession(): Promise<void> {
  (await cookies()).delete(ADMIN_SESSION_COOKIE);
}
