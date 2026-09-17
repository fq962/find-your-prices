import type { Metadata } from 'next';
import Link from 'next/link';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { CACHE_SCOPES, isCacheScope } from '@/server/services/cacheRefresh';
import { lockAdmin, refreshCacheAction } from './actions';

/**
 * Hub del panel: la puerta a cada herramienta y los botones de caché.
 *
 * Antes cada herramienta enlazaba a las demás desde su cabecera y `/admin`
 * a secas no existía; con cuatro herramientas ya hacía falta una página que
 * las liste y explique de un vistazo qué hace cada una.
 */
export const metadata: Metadata = { title: 'Panel', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface Tool {
  href: string;
  title: string;
  description: string;
}

const TOOLS: Tool[] = [
  {
    href: '/admin/scraping',
    title: 'Scraping',
    description: 'Tiendas, objetivos y corridas: qué se rastrea, cada cuánto y cómo salió la última vez.',
  },
  {
    href: '/admin/categorias',
    title: 'Árbol y mapeo de categorías',
    description: 'El árbol canónico y a qué nodo apunta cada categoría de cada tienda.',
  },
  {
    href: '/admin/categorias/contenido',
    title: 'Contenido de categorías',
    description: 'Imagen, destacado y texto SEO (español e inglés) de cada landing de categoría.',
  },
  {
    href: '/admin/tiendas',
    title: 'Tiendas',
    description: 'Logo y texto alternativo de cada tienda, para el índice y sus landings.',
  },
];

interface PageProps {
  searchParams: Promise<{ cache?: string; paths?: string }>;
}

const buttonClass =
  'rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

export default async function AdminHubPage({ searchParams }: PageProps) {
  const { cache, paths } = await searchParams;
  const refreshed = cache && isCacheScope(cache) ? CACHE_SCOPES.find((info) => info.scope === cache) : null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            Find Your Prices · Panel operativo
          </p>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <h1 className="enter text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
              Panel
            </h1>
            <form action={lockAdmin}>
              <button type="submit" className={buttonClass}>
                Cerrar sesión
              </button>
            </form>
          </div>
          <p className="enter mt-4 max-w-[60ch] text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)]">
            Las herramientas del sitio y los cachés que se pueden refrescar a mano.
          </p>
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl space-y-16">
          <section aria-labelledby="tools-heading">
            <h2 id="tools-heading" className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">
              Herramientas
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {TOOLS.map((tool) => (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    className="group flex h-full items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4 outline-none transition-[border-color,background-color] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)]">
                        {tool.title}
                      </span>
                      <span className="mt-1 block text-[0.8125rem] leading-[1.5] text-[var(--text-secondary)]">
                        {tool.description}
                      </span>
                      <span className="mt-2 block font-mono text-[0.75rem] text-[var(--text-tertiary)]">{tool.href}</span>
                    </span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-x-1"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cache-heading">
            <h2 id="cache-heading" className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">
              Refrescar caché
            </h2>
            <p className="mt-1 max-w-[70ch] text-[0.8125rem] leading-[1.55] text-[var(--text-tertiary)]">
              Las páginas se sirven desde caché (portada 5 min; categorías, tiendas y sitemaps 1 h) y las búsquedas
              viven 5 min en el data cache. Guardar desde el panel ya refresca lo que toca; estos botones son para
              cuando algo se generó en mal momento o después de un scraping manual.
            </p>

            {refreshed && (
              <p role="status" className="mt-6 rounded-2xl bg-[var(--price-win-soft)] px-4 py-3 text-[0.875rem] text-[var(--price-win)]">
                Listo: «{refreshed.label}» ({paths ?? '0'} rutas más el data cache). La próxima visita regenera cada
                página.
              </p>
            )}
            {cache === 'error' && (
              <p role="alert" className="mt-6 rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
                Ese alcance no existe.
              </p>
            )}

            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {CACHE_SCOPES.map((info) => (
                <li
                  key={info.scope}
                  className={`flex items-start justify-between gap-4 rounded-2xl border border-[var(--border)] px-5 py-4 ${
                    info.scope === 'all' ? 'bg-[var(--bg-subtle)] sm:col-span-2' : 'bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)]">{info.label}</p>
                    <p className="mt-1 text-[0.8125rem] leading-[1.5] text-[var(--text-secondary)]">{info.description}</p>
                  </div>
                  <form action={refreshCacheAction} className="shrink-0">
                    <input type="hidden" name="scope" value={info.scope} />
                    <button type="submit" className={buttonClass}>
                      Refrescar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
