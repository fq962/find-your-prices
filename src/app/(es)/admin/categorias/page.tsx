import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { loadCategoryAdminData } from '@/server/services/categories';
import { CategoryAdmin } from '@/features/admin-categories/CategoryAdmin';

/**
 * Panel de categorías.
 *
 * Dos trabajos en una pantalla: relacionar las categorías de cada tienda con
 * el árbol propio del sitio, y mantener ese árbol. Los datos se leen acá con
 * la service key; las acciones van contra /api/admin/categories/*.
 *
 * Misma situación de acceso que el panel de scraping: abierto hasta que
 * entre OAuth; ADMIN_API_SECRET cierra la API.
 */

export const metadata: Metadata = {
  title: 'Panel de categorías',
  robots: NO_INDEX_ROBOTS,
};

export const dynamic = 'force-dynamic';

type LoadResult =
  | { ok: true; data: Awaited<ReturnType<typeof loadCategoryAdminData>> }
  | { ok: false; message: string };

async function load(): Promise<LoadResult> {
  try {
    return { ok: true, data: await loadCategoryAdminData() };
  } catch (error) {
    // Antes de correr las migraciones el esquema no existe: se muestra el
    // motivo en pantalla en vez de romper la página entera.
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export default async function CategoryAdminPage() {
  const result = await load();
  if (result.ok) return <CategoryAdmin {...result.data} />;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-24">
      <h1 className="text-2xl font-semibold text-[var(--text)]">Panel de categorías</h1>
      <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/8 p-6">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">
          No se pudo leer la base de datos
        </p>
        <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{result.message}</p>
      </div>
    </div>
  );
}
