import Link from "next/link";
import type { CSSProperties } from "react";
import type { StoreNode } from "@/server/services/storePages";

interface StoreTileProps {
  store: StoreNode;
  href: string;
  /** "12 345 artículos · 14 categorías", ya formateado por la vista. */
  meta: string;
  index?: number;
  eager?: boolean;
}

const MAX_STAGGERED = 8;

/**
 * Tarjeta de tienda: el logo en un medallón redondo sobre placa tenue, el
 * nombre y sus cifras. El medallón y no la placa entera de `CategoryTile`
 * porque un logo es un objeto compacto y casi siempre horizontal: a sangre
 * completa quedaría flotando en una caja demasiado grande. Sin logo, la
 * inicial en serif itálica ocupa el medallón, así una tienda recién dada de
 * alta ya se ve terminada mientras alguien le sube la imagen.
 */
export function StoreTile({ store, href, meta, index = 0, eager = false }: StoreTileProps) {
  return (
    <Link
      href={href}
      className="group enter flex h-full flex-col items-center rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 pt-8 pb-6 text-center outline-none transition-[border-color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
      style={{ "--enter-delay": `${Math.min(index, MAX_STAGGERED) * 55}ms` } as CSSProperties}
    >
      <span className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-[var(--bg-subtle)] ring-1 ring-[var(--border)] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.05] sm:h-28 sm:w-28">
        {store.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */
          <img
            src={store.imageUrl}
            alt={store.imageAlt ?? store.name}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-contain p-4"
          />
        ) : (
          <span
            aria-hidden="true"
            className="font-serif text-[3rem] leading-none tracking-[-0.04em] text-[var(--accent)] italic opacity-80"
          >
            {store.name.charAt(0)}
          </span>
        )}
      </span>

      <h3 className="mt-5 text-[1rem] leading-snug font-medium tracking-[-0.01em] text-balance text-[var(--text)]">
        {store.name}
      </h3>
      <p className="mt-1 text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">{meta}</p>
    </Link>
  );
}
