import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { CategoryNode } from "@/server/services/categoryPages";

interface CategoryTileProps {
  category: CategoryNode;
  href: string;
  /** "1 234 artículos", ya formateado por la vista. */
  countLabel: string;
  /** Posición en la retícula, para el escalonado de entrada. */
  index?: number;
  /** Prioridad de carga de la imagen: las primeras del pliegue superior. */
  eager?: boolean;
  /**
   * Texto de la tarjeta cuando no es el nombre a secas: "Abarrotes en
   * PriceSmart" en una landing de tienda. El nombre sigue siendo el `alt`.
   */
  label?: ReactNode;
}

/** Tope del escalonado: pasado el 8º elemento el retardo deja de crecer. */
const MAX_STAGGERED = 8;

/**
 * Tarjeta de categoría con imagen: la unidad de las secciones "populares".
 *
 * La imagen vive en una placa cuadrada de fondo tenue y se pinta con
 * `object-contain`: las fotos de categoría son recortes de producto sobre
 * blanco, y estirarlas a cubrir deformaría o cortaría el objeto. Sin imagen
 * no hay caja gris: la inicial de la categoría en serif itálica ocupa la
 * placa, así que una categoría recién creada ya se ve terminada mientras
 * alguien le sube la foto.
 */
export function CategoryTile({
  category,
  href,
  countLabel,
  index = 0,
  eager = false,
  label,
}: CategoryTileProps) {
  const alt = category.imageAlt ?? category.name;

  return (
    <Link
      href={href}
      className="group enter flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] outline-none transition-[border-color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
      style={{ "--enter-delay": `${Math.min(index, MAX_STAGGERED) * 55}ms` } as CSSProperties}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-white">
        {category.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */
          <img
            src={category.imageUrl}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain p-6 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.05]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center font-serif text-[clamp(4rem,9vw,6.5rem)] leading-none tracking-[-0.04em] text-[var(--accent)] italic opacity-80 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.06]"
          >
            {category.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-start justify-between gap-3 px-5 pt-4 pb-5">
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] leading-snug font-medium tracking-[-0.01em] text-balance text-[var(--text)]">
            {label ?? category.name}
          </h3>
          <p className="mt-1 text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">{countLabel}</p>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-4 w-4 shrink-0 -translate-x-1 text-[var(--text-tertiary)] opacity-0 transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-hover:translate-x-0 group-hover:opacity-100"
        >
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}
