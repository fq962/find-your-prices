// Tipos compartidos por toda la app. Los tipos propios de una sola feature
// van en `features/<feature>/types.ts`, no aquí.

export interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  store: string;
  category: string;
  imageUrl?: string;
  availability?: string;
  description?: string;

  // --- Campos que aporta el scraping real ---
  // Opcionales a propósito: las fixtures y las pruebas siguen construyendo
  // productos sin ellos, y cada tienda llena solo lo que publica.

  /** Ficha del producto en la tienda de origen. */
  url?: string;
  /** Marca, tal como la reporta la tienda. */
  brand?: string;
  /** Slug de la tienda, para enlaces y logos. */
  storeSlug?: string;
  /**
   * Segmento de URL legible de la ficha (/p/<slug>).
   *
   * Opcional porque el fixture no lo trae: sin él, la lista simplemente no
   * enlaza a la ficha, que es el comportamiento que ya tenía sin catálogo real.
   */
  slug?: string;
  /** Precio tachado. Solo llega cuando hay descuento real. */
  listPrice?: number;
  /** Porcentaje de descuento respecto a listPrice. */
  discountPercent?: number;
  /** Disponibilidad como booleano, aparte de la etiqueta de availability. */
  inStock?: boolean;
  /** Calificación media en escala 0-5. */
  ratingAverage?: number;
  /** Cantidad de votos que sostienen esa calificación. */
  ratingCount?: number;
  /**
   * Slug del nodo canónico de `categories`, si el mapeo existe. Es el valor
   * que usa el filtro; `category` es solo el texto que se muestra.
   */
  categorySlug?: string;
}

export interface PricePoint {
  productId: string;
  store: string;
  price: number;
  currency: string;
  url: string;
  fetchedAt: string;
}
