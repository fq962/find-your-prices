/**
 * Tamaño de página del catálogo.
 *
 * Un solo número compartido por el servidor y el cliente, y esa es toda la
 * razón por la que existe este módulo. El lote que la ruta pinta en el HTML y
 * el que pide el navegador al desplazarse son páginas de la MISMA consulta: si
 * cada lado usa su propio tamaño, el desplazamiento pide el registro equivocado
 * y se saltan artículos sin que nada falle a la vista.
 *
 * Es un módulo puro a propósito —sin React, sin `use client`— para que lo pueda
 * importar tanto un Server Component como el hook del navegador.
 */
export const CATALOG_PAGE_SIZE = 48;
