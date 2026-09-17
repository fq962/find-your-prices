import Link from "next/link";
import type { CSSProperties } from "react";
import { ImagePlate } from "@/components/shared/ImagePlate";
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
 * Tarjeta de tienda: el logo en una placa cuadrada redondeada, el nombre y
 * sus cifras. Cuadrada y no redonda porque la mayoría de los logos son
 * cuadrados o apaisados: en un círculo quedaban recortados o flotando. El
 * logo rellena la placa entera (sin margen) sobre blanco, que es el fondo
 * con el que casi todos vienen; un logo apaisado deja bandas blancas que se
 * funden con la placa. Sin logo, la inicial en serif itálica ocupa la placa
 * sobre el fondo sutil, así una tienda recién dada de alta ya se ve
 * terminada mientras alguien le sube la imagen.
 */
export function StoreTile({ store, href, meta, index = 0, eager = false }: StoreTileProps) {
  return (
    <Link
      href={href}
      className="group enter flex h-full flex-col items-center rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 pt-8 pb-6 text-center outline-none transition-[border-color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
      style={{ "--enter-delay": `${Math.min(index, MAX_STAGGERED) * 55}ms` } as CSSProperties}
    >
      <ImagePlate
        imageUrl={store.imageUrl}
        alt={store.imageAlt ?? store.name}
        name={store.name}
        eager={eager}
        className="h-24 w-24 rounded-[1.5rem] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.04] sm:h-28 sm:w-28"
        initialClassName="text-[3rem]"
      />

      <h3 className="mt-5 text-[1rem] leading-snug font-medium tracking-[-0.01em] text-balance text-[var(--text)]">
        {store.name}
      </h3>
      <p className="mt-1 text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">{meta}</p>
    </Link>
  );
}
