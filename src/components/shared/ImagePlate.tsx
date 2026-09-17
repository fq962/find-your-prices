interface ImagePlateProps {
  imageUrl: string | null | undefined;
  alt: string;
  /** De acá sale la inicial cuando no hay imagen. */
  name: string;
  /** Tamaño, radio y sombra: lo decide quien la coloca. */
  className?: string;
  /** Clases extra de la imagen (la escala al pasar por encima, por ejemplo). */
  imageClassName?: string;
  /** Clases extra de la inicial. */
  initialClassName?: string;
  eager?: boolean;
}

/**
 * La placa de imagen del sitio: categorías y tiendas, en tarjetas, carátulas
 * y miniaturas del panel. Es una sola por una razón: la regla de cómo se
 * pinta un logo o un recorte de producto tiene que ser la misma en todos
 * lados, y cuando vivía copiada en seis sitios cada copia tenía un margen y
 * un fondo distintos.
 *
 * La regla:
 *   - Con imagen, fondo BLANCO fijo (no el del tema) y la imagen rellena la
 *     placa entera con `object-contain`, sin margen. Casi todas vienen sobre
 *     blanco, así que un logo cuadrado la ocupa completa y uno apaisado o un
 *     recorte de producto queda centrado sin que se note el marco.
 *   - Sin imagen, el fondo sutil del tema y la inicial en serif itálica, así
 *     una fila recién creada ya se ve terminada mientras alguien sube la foto.
 *
 * Nunca es redonda: en un círculo lo cuadrado se recorta y lo apaisado
 * flota. El radio lo pone quien la usa, siempre sobre un rectángulo.
 */
export function ImagePlate({
  imageUrl,
  alt,
  name,
  className = "",
  imageClassName = "",
  initialClassName = "",
  eager = false,
}: ImagePlateProps) {
  return (
    <span
      className={`relative block overflow-hidden ${imageUrl ? "bg-white" : "bg-[var(--bg-subtle)]"} ${className}`}
    >
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */
        <img
          src={imageUrl}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-contain ${imageClassName}`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center font-serif leading-none tracking-[-0.04em] text-[var(--accent)] italic opacity-80 ${initialClassName}`}
        >
          {name.charAt(0)}
        </span>
      )}
    </span>
  );
}
