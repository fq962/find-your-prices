'use server';

import { redirect } from 'next/navigation';
import { closeAdminSession, hasAdminSession, openAdminSession } from '@/server/admin/session';
import { isCacheScope, refreshCache } from '@/server/services/cacheRefresh';

export interface UnlockState {
  error: string | null;
}

/** Server action del formulario de desbloqueo del panel. */
export async function unlockAdmin(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  if (!process.env.CRON_SECRET) {
    return { error: 'CRON_SECRET no está configurado en el servidor.' };
  }

  const candidate = String(formData.get('secret') ?? '').trim();
  const ok = await openAdminSession(candidate);
  // Al poner la cookie, Next vuelve a renderizar el layout y ya entra al panel.
  return ok ? { error: null } : { error: 'Clave incorrecta.' };
}

export async function lockAdmin(): Promise<void> {
  await closeAdminSession();
}

/**
 * Botones de "refrescar caché" del hub. El layout ya bloquea la página sin
 * sesión, pero una server action es un endpoint propio: se vuelve a
 * comprobar la cookie antes de tirar nada.
 */
export async function refreshCacheAction(formData: FormData): Promise<void> {
  if (!(await hasAdminSession())) throw new Error('No autorizado');
  const scope = String(formData.get('scope') ?? '');
  if (!isCacheScope(scope)) redirect('/admin?cache=error');
  const result = refreshCache(scope);
  redirect(`/admin?cache=${scope}&paths=${result.paths.length}`);
}
