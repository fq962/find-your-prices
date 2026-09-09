/**
 * Ancho del contenedor de la página, en un solo lugar.
 *
 * Antes cada bloque escribía `max-w-3xl` (48rem) por su cuenta. Esa medida es
 * la correcta para leer prosa, pero el catálogo no es prosa: en un monitor
 * dejaba dos franjas vacías enormes a los lados mientras las fichas de producto
 * se apretaban en el centro. Acá el ancho crece con la pantalla —hasta 96rem—
 * y el aire sobrante se convierte en columnas de producto.
 *
 * Mobile-first: en teléfono es ancho completo con 16px de margen, que es lo
 * único que hay; cada salto suma ancho y respiración, nunca los quita. Vive en
 * un módulo aparte, y no como clase CSS, para que Tailwind vea el literal al
 * escanear el código y genere las utilidades.
 */
export const SHELL =
  "mx-auto w-full max-w-[52rem] px-4 sm:px-6 lg:max-w-[72rem] lg:px-8 xl:max-w-[84rem] 2xl:max-w-[96rem]";

/**
 * Variante angosta para texto corrido —pie de página, avisos—, donde una línea
 * de 96rem sería ilegible.
 */
export const SHELL_NARROW = "mx-auto w-full max-w-[52rem] px-4 sm:px-6 lg:px-8";
