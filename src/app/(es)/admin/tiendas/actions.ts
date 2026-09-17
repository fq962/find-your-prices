'use server';

import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/server/admin/session';
import { removeStoreImage, saveStoreContent, uploadStoreImage } from '@/server/services/storeContent';

/**
 * Server actions del mantenimiento de tiendas. Como las de categorías:
 * cada una vuelve a comprobar la cookie antes de tocar nada.
 */

async function assertAdmin(): Promise<void> {
  if (!(await hasAdminSession())) throw new Error('No autorizado');
}

function editPath(id: string, status: 'saved' | 'error', message?: string): string {
  const params = new URLSearchParams({ status });
  if (message) params.set('message', message.slice(0, 300));
  return `/admin/tiendas/${id}?${params}`;
}

export async function saveStoreAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  try {
    await saveStoreContent(id, { imageAlt: String(formData.get('image_alt') ?? '') });
  } catch (error) {
    redirect(editPath(id, 'error', error instanceof Error ? error.message : String(error)));
  }
  redirect(editPath(id, 'saved'));
}

export async function uploadStoreImageAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const file = formData.get('image');

  if (!(file instanceof File) || file.size === 0) {
    redirect(editPath(id, 'error', 'Elegí una imagen antes de subir.'));
  }

  try {
    await uploadStoreImage(id, file);
  } catch (error) {
    redirect(editPath(id, 'error', error instanceof Error ? error.message : String(error)));
  }
  redirect(editPath(id, 'saved'));
}

export async function removeStoreImageAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  try {
    await removeStoreImage(id);
  } catch (error) {
    redirect(editPath(id, 'error', error instanceof Error ? error.message : String(error)));
  }
  redirect(editPath(id, 'saved'));
}
