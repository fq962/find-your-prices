'use server';

import { closeAdminSession, openAdminSession } from '@/server/admin/session';

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
