import type { Metadata } from 'next';
import Link from 'next/link';
import { ImagePlate } from '@/components/shared/ImagePlate';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { storePaths } from '@/lib/seo/storeSeo';
import { listStoresForContent } from '@/server/services/storeContent';

/**
 * Lista de tiendas para mantener su imagen. Cada fila lleva al formulario.
 * Está detrás de la puerta de /admin.
 */
export const metadata: Metadata = { title: 'Tiendas', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

export default async function StoreContentIndexPage() {
  const rows = await listStoresForContent();
  const withImage = rows.filter((row) => row.imageUrl).length;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            Find Your Prices · Panel operativo ·{' '}
            <Link href="/admin/categorias" className="text-[var(--accent)] hover:opacity-70">
              Árbol y mapeo
            </Link>
            {' · '}
            <Link href="/admin/categorias/contenido" className="text-[var(--accent)] hover:opacity-70">
              Contenido de categorías
            </Link>
            {' · '}
            <Link href="/admin/scraping" className="text-[var(--accent)] hover:opacity-70">
              Scraping
            </Link>
          </p>
          <h1 className="enter mt-6 text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            Tiendas
          </h1>
          <p className="enter mt-4 max-w-[60ch] text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)]">
            Imagen de cada tienda: se muestra en el índice de tiendas, en la cabecera de su landing y
            como vista previa al compartir. Sin imagen sale la inicial.
          </p>
          <dl className="enter mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[0.8125rem] text-[var(--text-tertiary)]">
            <Stat label="Tiendas" value={rows.length} />
            <Stat label="Con imagen" value={withImage} />
          </dl>
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <ul className="mx-auto w-full max-w-6xl space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                <ImagePlate imageUrl={row.imageUrl} alt="" name={row.name} className="h-12 w-12 shrink-0 rounded-xl" initialClassName="text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium text-[var(--text)]">
                    {row.name}
                    {!row.isActive && (
                      <span className="ml-2 text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
                        inactiva
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-[var(--text-tertiary)]">
                    <span className="font-mono">/{row.slug}</span>
                    <span>{row.imageUrl ? 'imagen ✓' : 'sin imagen'}</span>
                  </p>
                </div>
                <Link
                  href={storePaths(row.slug).es}
                  target="_blank"
                  className="hidden text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)] sm:block"
                >
                  Ver
                </Link>
                <Link
                  href={`/admin/tiendas/${row.id}`}
                  className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="tracking-[0.14em] uppercase">{label}</dt>
      <dd className="text-[1rem] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
    </div>
  );
}
