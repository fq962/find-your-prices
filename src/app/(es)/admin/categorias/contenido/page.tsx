import type { Metadata } from 'next';
import Link from 'next/link';
import { ImagePlate } from '@/components/shared/ImagePlate';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { categoryPaths } from '@/lib/seo/categorySeo';
import { listCategoriesForContent } from '@/server/services/categoryContent';

/**
 * Lista de categorías para mantener su contenido: imagen, destacado y texto
 * SEO. Cada fila lleva al formulario. Está detrás de la puerta de /admin.
 */
export const metadata: Metadata = { title: 'Contenido de categorías', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

export default async function CategoryContentIndexPage() {
  const rows = await listCategoriesForContent();
  const roots = rows.filter((row) => row.parentId === null);
  const childrenOf = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parentId) continue;
    childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row]);
  }

  const withImage = rows.filter((row) => row.imageUrl).length;
  const withText = rows.filter((row) => row.content.es.intro || row.content.es.body).length;
  const featured = rows.filter((row) => row.featuredPosition !== null).length;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
              Panel
            </Link>
            {' · '}
            <Link href="/admin/categorias" className="text-[var(--accent)] hover:opacity-70">
              Árbol y mapeo
            </Link>
            {' · '}
            <Link href="/admin/scraping" className="text-[var(--accent)] hover:opacity-70">
              Scraping
            </Link>
            {' · '}
            <Link href="/admin/tiendas" className="text-[var(--accent)] hover:opacity-70">
              Tiendas
            </Link>
          </p>
          <h1 className="enter mt-6 text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            Contenido de categorías
          </h1>
          <p className="enter mt-4 max-w-[60ch] text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)]">
            Imagen, texto SEO y palabras clave de cada landing. Lo que no esté escrito sale con
            un texto de respaldo que nombra la categoría y sus cifras; lo que sí, manda.
          </p>
          <dl className="enter mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[0.8125rem] text-[var(--text-tertiary)]">
            <Stat label="Categorías" value={rows.length} />
            <Stat label="Con imagen" value={withImage} />
            <Stat label="Con texto" value={withText} />
            <Stat label="Destacadas" value={featured} />
          </dl>
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl space-y-10">
          {roots.map((root) => (
            <section key={root.id}>
              <Row row={root} />
              <ul className="mt-2 space-y-2 border-l border-[var(--border)] pl-4 sm:pl-6">
                {(childrenOf.get(root.id) ?? []).map((child) => (
                  <li key={child.id}>
                    <Row row={child} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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

function Row({ row }: { row: Awaited<ReturnType<typeof listCategoriesForContent>>[number] }) {
  const hasText = Boolean(row.content.es.intro || row.content.es.body || row.content.es.title);
  return (
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
          <span>{hasText ? 'texto ✓' : 'sin texto'}</span>
          {row.featuredPosition !== null && <span>destacada #{row.featuredPosition}</span>}
        </p>
      </div>
      <Link
        href={categoryPaths(row.slug).es}
        target="_blank"
        className="hidden text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)] sm:block"
      >
        Ver
      </Link>
      <Link
        href={`/admin/categorias/contenido/${row.id}`}
        className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)]"
      >
        Editar
      </Link>
    </div>
  );
}
