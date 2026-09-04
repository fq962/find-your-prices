// Tipos compartidos por toda la app. Los tipos propios de una sola feature
// van en `features/<feature>/types.ts`, no aquí.

export interface Product {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface PricePoint {
  productId: string;
  store: string;
  price: number;
  currency: string;
  url: string;
  fetchedAt: string;
}
