"use client";

import type { CSSProperties } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import type { DictionaryKey } from "@/features/i18n/translate";
import { useRevealRef } from "@/hooks/useRevealRef";

export interface CatalogStatsProps {
  productCount: number;
  storeCount: number;
  categoryCount: number;
}

/**
 * Cierre de la página: el alcance del catálogo dicho con números grandes, a
 * sangre completa. Es el único bloque que rompe la columna de lectura, y esa
 * ruptura es el punto — después de una lista densa, el ojo necesita un
 * cambio de escala y de densidad antes del footer.
 *
 * Son totales del catálogo, no del filtro activo: responden "qué abarca este
 * sitio", no "qué estás viendo" (eso ya lo dice el contador de resultados).
 *
 * Se usa `<div>` y no `<dl>` a propósito: `dl` expone rol "list" en los
 * mapeos ARIA actuales y la página tiene una única lista, la de resultados.
 */
export function CatalogStats({ productCount, storeCount, categoryCount }: CatalogStatsProps) {
  const { t } = useLocale();
  const revealRef = useRevealRef();

  const stats: { value: number; labelKey: DictionaryKey }[] = [
    { value: productCount, labelKey: "statsProductsLabel" },
    { value: storeCount, labelKey: "statsStoresLabel" },
    { value: categoryCount, labelKey: "statsCategoriesLabel" },
  ];

  return (
    <section className="mt-24 border-y border-[var(--border)] bg-[var(--bg-subtle)]/60">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 divide-y divide-[var(--border)] px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
        {stats.map(({ value, labelKey }, index) => (
          <div
            key={labelKey}
            ref={revealRef}
            className="reveal flex flex-col gap-1 py-10 sm:items-center sm:py-14"
            style={{ "--enter-delay": `${index * 90}ms` } as CSSProperties}
          >
            <p className="text-[clamp(3rem,7vw,5rem)] leading-[0.85] font-semibold tracking-[-0.05em] tabular-nums text-[var(--text)]">
              {value}
            </p>
            <p className="font-serif text-[clamp(1.125rem,2.4vw,1.5rem)] tracking-[0.01em] text-[var(--text-tertiary)] italic">
              {t(labelKey)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
