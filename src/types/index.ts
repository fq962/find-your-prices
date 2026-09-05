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
}

export interface PricePoint {
  productId: string;
  store: string;
  price: number;
  currency: string;
  url: string;
  fetchedAt: string;
}
