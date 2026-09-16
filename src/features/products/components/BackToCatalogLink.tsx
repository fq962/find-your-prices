"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { readLastCatalogUrl } from "@/features/products/catalogUrlState";

/**
 * "Volver al catálogo" desde la ficha.
 *
 * Enlaza a la última dirección del catálogo en esta pestaña —con la búsqueda,
 * los filtros y la categoría que se llevaban— y cae a la portada del idioma si
 * no hay ninguna. En el servidor y durante la hidratación el href es la
 * portada, así el HTML coincide; React lo cambia al montar.
 */
export interface BackToCatalogLinkProps {
  /** Portada del idioma actual: "/" o "/en". */
  homePath: string;
  className?: string;
  children: ReactNode;
}

const noop = () => () => {};

export function BackToCatalogLink({ homePath, className, children }: BackToCatalogLinkProps) {
  const href = useSyncExternalStore(
    noop,
    () => readLastCatalogUrl(homePath) ?? homePath,
    () => homePath,
  );

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
