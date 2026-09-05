import type { Product } from "@/types";
import { ProductCard } from "./ProductCard";

export interface ProductGridProps {
  products: Product[];
  locale?: string;
  emptyMessage?: string;
}

export function ProductGrid({ products, locale, emptyMessage }: ProductGridProps) {
  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} locale={locale} />
          </li>
        ))}
      </ul>
      {products.length === 0 && emptyMessage && (
        <p className="text-center text-sm text-neutral-500">{emptyMessage}</p>
      )}
    </>
  );
}
