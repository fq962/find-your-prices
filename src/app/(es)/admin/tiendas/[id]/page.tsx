import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { storePaths } from '@/lib/seo/storeSeo';
import { getStoreForContent } from '@/server/services/storeContent';
import { ImageUploader } from '@/features/admin-shared/ImageUploader';
import { removeStoreImageAction, saveStoreAction, uploadStoreImageAction } from '../actions';

/**
 * Formulario de una tienda: imagen (Storage) y texto alternativo. Todo por
 * server actions, como el de categorías.
 */
export const metadata: Metadata = { title: 'Editar tienda', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}

const inputClass =
  'w-full border-0 border-b border-[var(--border-strong)] bg-transparent px-0 py-2 text-[0.9375rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]';
const buttonClass =
  'rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]';
const ghostButtonClass =
  'rounded-full border border-[var(--border-strong)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)]';

export default async function StoreContentEditPage({ params, searchParams }: PageProps) {
  const [{ id }, { status, message }] = await Promise.all([params, searchParams]);
  const row = await getStoreForContent(id);
  if (!row) notFound();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin/tiendas" className="text-[var(--accent)] hover:opacity-70">
              ← Tiendas
            </Link>
          </p>
          <h1 className="enter mt-6 text-[clamp(2rem,5vw,3.25rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            {row.name}
          </h1>
          <p className="enter mt-3 flex flex-wrap gap-x-4 text-[0.8125rem] text-[var(--text-tertiary)]">
            <span className="font-mono">/{row.slug}</span>
            <Link href={storePaths(row.slug).es} target="_blank" className="text-[var(--accent)] hover:opacity-70">
              Ver página ES
            </Link>
            <Link href={storePaths(row.slug).en} target="_blank" className="text-[var(--accent)] hover:opacity-70">
              Ver página EN
            </Link>
            {row.baseUrl && (
              <a href={row.baseUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text)]">
                {row.baseUrl}
              </a>
            )}
          </p>

          {status === 'saved' && (
            <p role="status" className="mt-6 rounded-2xl bg-[var(--price-win-soft)] px-4 py-3 text-[0.875rem] text-[var(--price-win)]">
              Guardado. Las páginas afectadas ya se regeneraron.
            </p>
          )}
          {status === 'error' && (
            <p role="alert" className="mt-6 rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
              {message ?? 'No se pudo guardar.'}
            </p>
          )}
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl space-y-14">
          <section>
            <SectionTitle
              title="Imagen"
              hint="El logo de la tienda, idealmente cuadrado y sobre fondo blanco o transparente, hasta 5 MB. Podés pegarla directo del portapapeles. Se muestra en un medallón redondo: dejale aire alrededor."
            />
            <div className="mt-6 grid gap-6 sm:grid-cols-[12rem_1fr]">
              <div className="aspect-square overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-subtle)]">
                {row.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */
                  <img src={row.imageUrl} alt={row.imageAlt ?? row.name} className="h-full w-full object-contain p-8" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-serif text-6xl text-[var(--accent)] italic">
                    {row.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                <ImageUploader
                  entityId={row.id}
                  action={uploadStoreImageAction}
                  buttonClass={buttonClass}
                  defaultWidth={512}
                />
                {row.imageUrl && (
                  <form action={removeStoreImageAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit" className={ghostButtonClass}>
                      Quitar imagen
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          <form action={saveStoreAction} className="space-y-8">
            <input type="hidden" name="id" value={row.id} />
            <section>
              <SectionTitle
                title="Presentación"
                hint="El texto alternativo describe la imagen para lectores de pantalla y para Google Imágenes. Vacío = el nombre de la tienda."
              />
              <label className="mt-6 block">
                <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
                  Texto alternativo de la imagen
                </span>
                <input name="image_alt" defaultValue={row.imageAlt ?? ''} placeholder={row.name} className={inputClass} />
              </label>
            </section>

            <div className="flex items-center gap-4 border-t border-[var(--border)] pt-8">
              <button type="submit" className={buttonClass}>
                Guardar
              </button>
              <Link href="/admin/tiendas" className="text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)]">
                Volver a la lista
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">{title}</h2>
      <p className="mt-1 max-w-[70ch] text-[0.8125rem] leading-[1.55] text-[var(--text-tertiary)]">{hint}</p>
    </div>
  );
}
