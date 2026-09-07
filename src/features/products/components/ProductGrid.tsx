import type { Product } from "@/types";
import { ProductCard } from "./ProductCard";

export interface ProductGridProps {
  products: Product[];
  locale?: string;
  emptyMessage?: string;
  viewLargerImageLabel?: string;
  closeImageLabel?: string;
}

export function ProductGrid({
  products,
  locale,
  emptyMessage,
  viewLargerImageLabel,
  closeImageLabel,
}: ProductGridProps) {
  return (
    <>
      <ul
        className={
          products.length > 0 ? "divide-y divide-neutral-200 border-y border-neutral-200" : ""
        }
      >
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              locale={locale}
              viewLargerImageLabel={viewLargerImageLabel}
              closeImageLabel={closeImageLabel}
            />
          </li>
        ))}
      </ul>
      {products.length === 0 && emptyMessage && (
        <p className="py-12 text-center text-sm text-neutral-500">{emptyMessage}</p>
      )}
    </>
  );
}
