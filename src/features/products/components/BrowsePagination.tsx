import Link from "next/link";
import { browsePageLinks } from "../browsePaging";

interface BrowsePaginationProps {
  /** Página actual; 0 si la navegación va en una landing que no es ninguna de ellas. */
  current: number;
  pageCount: number;
  href: (page: number) => string;
  /** Nombre accesible de la navegación. */
  label: string;
}

const CHIP =
  "inline-flex min-w-10 items-center justify-center rounded-full px-3 py-2 text-[0.875rem] tabular-nums outline-none transition-colors duration-[var(--dur-base)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

/**
 * Navegación entre las páginas de un listado "todos los productos".
 *
 * Son enlaces `<a>` de verdad, renderizados en el servidor, y ese es todo el
 * punto: es el camino por el que el rastreador llega a las fichas que la
 * landing no pinta (ver `browsePaging.ts`). Qué números se muestran lo decide
 * `browsePageLinks`.
 */
export function BrowsePagination({ current, pageCount, href, label }: BrowsePaginationProps) {
  if (pageCount < 1) return null;
  const links = browsePageLinks(current, pageCount);

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-1.5">
        {current > 1 && (
          <li>
            <Link
              href={href(current - 1)}
              rel="prev"
              className={`${CHIP} border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]`}
            >
              ← Anterior
            </Link>
          </li>
        )}

        {links.map((page, index) =>
          page === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-[var(--text-tertiary)]">
              …
            </li>
          ) : (
            <li key={page}>
              {page === current ? (
                <span
                  aria-current="page"
                  className={`${CHIP} bg-[var(--text)] font-semibold text-[var(--bg)]`}
                >
                  {page}
                </span>
              ) : (
                <Link
                  href={href(page)}
                  className={`${CHIP} text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]`}
                >
                  {page}
                </Link>
              )}
            </li>
          ),
        )}

        {current >= 1 && current < pageCount && (
          <li>
            <Link
              href={href(current + 1)}
              rel="next"
              className={`${CHIP} border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]`}
            >
              Siguiente →
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
