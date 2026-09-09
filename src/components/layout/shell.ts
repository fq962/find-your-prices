/**
 * Ancho del contenedor de la página, en un solo lugar.
 *
 * Antes cada bloque escribía `max-w-3xl` (48rem) por su cuenta: correcto para
 * leer prosa, estrecho para un catálogo, que dejaba dos franjas vacías a los
 * lados en un monitor. Pero el remedio se pasó al otro extremo: a 96rem la
 * página se convertía en una pared de fichas diminutas y la mirada no
 * encontraba dónde apoyarse.
 *
 * El techo son 68rem. Es la medida en la que dos fichas de galería caben
 * grandes y una fila de lista todavía se recorre sin mover la cabeza — más
 * ancho que la columna de lectura original, y bastante menos que la pantalla.
 *
 * Mobile-first: en teléfono es ancho completo con 16px de margen, que es lo
 * único que hay; cada salto suma ancho y respiración, nunca los quita. Vive en
 * un módulo aparte, y no como clase CSS, para que Tailwind vea el literal al
 * escanear el código y genere las utilidades.
 */
export const SHELL =
  "mx-auto w-full max-w-[48rem] px-4 sm:px-6 lg:max-w-[60rem] lg:px-8 xl:max-w-[68rem]";

/**
 * Columna de lectura para las páginas de texto —acerca de, políticas—.
 *
 * Centrada y acotada a 68 caracteres: es el ancho al que se vuelve a la
 * izquierda sin perder el renglón. Va centrada dentro del contenedor y no
 * pegada al borde, porque una columna angosta alineada a la izquierda de una
 * pantalla ancha deja todo el peso de la página en un costado.
 */
export const SHELL_READING = "mx-auto w-full max-w-[68ch] px-4 sm:px-6";
