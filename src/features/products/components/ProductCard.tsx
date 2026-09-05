import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";

export interface ProductCardProps {
  product: Product;
  locale?: string;
}

export function ProductCard({ product, locale }: ProductCardProps) {
  const { name, price, currency, store, imageUrl, description, availability } = product;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={name}
          className="aspect-square w-full rounded-xl object-cover"
        />
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-neutral-900">{name}</h3>
        <p className="text-lg font-semibold text-neutral-900">
          {formatPrice(price, currency, locale)}
        </p>
        <p className="text-sm text-neutral-500">{store}</p>
      </div>
      {description && <p className="text-sm text-neutral-600">{description}</p>}
      {availability && <p className="text-sm text-neutral-500">{availability}</p>}
    </div>
  );
}
