import Link from "next/link";
import type { ReactNode } from "react";
import type { CategoryNode } from "@/server/services/categoryPages";

interface CategoryRowProps {
  category: CategoryNode;
  href: string;
  /** Texto secundario a la derecha: "1 234 artículos" o "8 subcategorías". */
  meta: string;
  /** Marca la fila de la página actual (en el "también en …" de una hija). */
  current?: boolean;
  /** Texto de la fila cuando no es el nombre a secas ("Abarrotes en PriceSmart"). */
  label?: ReactNode;
}

/**
 * Fila de la lista "comprar por categoría": nombre, dato y chevrón.
 *
 * Es la forma densa de recorrer el árbol, la que se usa cuando ya no importa
 * la foto sino encontrar el nombre rápido. La fila entera es el enlace y el
 * chevrón se desplaza al pasar por encima: el movimiento dice "esto lleva a
 * algún lado" sin cambiar nada de color.
 */
export function CategoryRow({ category, href, meta, current = false, label }: CategoryRowProps) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={`group flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 outline-none transition-[border-color,background-color,transform] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
          current
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border)] bg-transparent"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)]">
            {label ?? category.name}
          </span>
          <span className="mt-0.5 block text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">
            {meta}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-x-1"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </li>
  );
}
