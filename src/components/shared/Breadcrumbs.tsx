import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/seo/schema";

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Nombre accesible de la navegación ("Ubicación" / "Breadcrumb"). */
  label: string;
}

/**
 * Migas visibles. Van con el mismo `BreadcrumbItem` que el JSON-LD para que
 * lo que Google lee y lo que la persona ve sean la misma ruta: una miga en el
 * grafo que no está en la página es exactamente el tipo de discrepancia que
 * un rastreador penaliza.
 *
 * El último elemento no es enlace (es la página actual) y lleva
 * `aria-current`.
 */
export function Breadcrumbs({ items, label }: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className="enter-fade">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] tracking-[-0.005em] text-[var(--text-tertiary)]">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.path}-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 opacity-60"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              )}
              {isLast ? (
                <span aria-current="page" className="text-[var(--text)]">
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.path}
                  className="rounded-sm outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
