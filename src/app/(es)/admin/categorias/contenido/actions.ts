'use server';

import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/server/admin/session';
import {
  removeCategoryImage,
  saveCategoryContent,
  uploadCategoryImage,
  type CategoryContentFields,
} from '@/server/services/categoryContent';

/**
 * Server actions del mantenimiento de contenido de categorías.
 *
 * El layout de /admin ya bloquea la página sin sesión, pero una server action
 * es un endpoint propio y se puede invocar sin pasar por la página: cada una
 * vuelve a comprobar la cookie antes de tocar nada.
 */

async function assertAdmin(): Promise<void> {
  if (!(await hasAdminSession())) throw new Error('No autorizado');
}

function editPath(id: string, status: 'saved' | 'error', message?: string): string {
  const params = new URLSearchParams({ status });
  if (message) params.set('message', message.slice(0, 300));
  return `/admin/categorias/contenido/${id}?${params}`;
}

function fields(formData: FormData, locale: 'es' | 'en'): CategoryContentFields {
  const read = (name: string) => String(formData.get(`${locale}_${name}`) ?? '');
  return {
    title: read('title'),
    metaDescription: read('meta_description'),
    intro: read('intro'),
    body: read('body'),
    // Una por línea o separadas por coma: lo que sea más cómodo de pegar.
    keywords: read('keywords')
      .split(/[\n,]/)
      .map((k) => k.trim())
      .filter(Boolean),
  };
}

export async function saveContentAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const featuredRaw = String(formData.get('featured_position') ?? '').trim();
  const featured = featuredRaw === '' ? null : Number(featuredRaw);

  try {
    await saveCategoryContent(id, {
      imageAlt: String(formData.get('image_alt') ?? ''),
      featuredPosition: Number.isFinite(featured) ? featured : null,
      content: { es: fields(formData, 'es'), en: fields(formData, 'en') },
    });
  } catch (error) {
    redirect(editPath(id, 'error', error instanceof Error ? error.message : String(error)));
  }
  redirect(editPath(id, 'saved'));
}

export async function uploadImageAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const file = formData.get('image');

  if (!(file instanceof File) || file.size === 0) {
    redirect(editPath(id, 'error', 'Elegí una imagen antes de subir.'));
  }

  try {
    await uploadCategoryImage(id, file);
  } catch (error) {
    redirect(editPath(id, 'error', error instanceof Error ? error.message : String(error)));
  }
  redirect(editPath(id, 'saved'));
}

export async function removeImageAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  try {
    await removeCategoryImage(id);
  } catch (error) {
    redirect(editPath(id, 'error', error instanceof Error ? error.message : String(error)));
  }
  redirect(editPath(id, 'saved'));
}
