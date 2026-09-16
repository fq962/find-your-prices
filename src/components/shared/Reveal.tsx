"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { useRevealRef } from "@/hooks";

interface RevealProps {
  children: ReactNode;
  /** Etiqueta del contenedor; `section` por defecto. */
  as?: ElementType;
  className?: string;
  /** Retardo del reveal, para escalonar bloques hermanos. */
  delayMs?: number;
  id?: string;
  "aria-labelledby"?: string;
}

/**
 * Bloque que entra al viewport con el reveal de `globals.css`.
 *
 * Existe para que los Server Components puedan escalonar secciones sin
 * volverse cliente: lo único cliente es este contenedor, que marca
 * `data-revealed` cuando el observer lo ve. Sin JS o con menos movimiento el
 * contenido está visible desde el principio (ver `.reveal` y su media query).
 */
export function Reveal({
  children,
  as: Tag = "section",
  className = "",
  delayMs = 0,
  ...rest
}: RevealProps) {
  const ref = useRevealRef();
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={{ "--enter-delay": `${delayMs}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
