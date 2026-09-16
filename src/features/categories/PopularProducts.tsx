"use client";

import { useMemo } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import { productPath } from "@/features/products/productPath";
import type { Product } from "@/types";

interface PopularProductsProps {
  products: Product[];
  locale: Locale;
  label: string;
}

/**
 * Los más pedidos de la categoría, en la retícula compacta del catálogo.
 *
 * Es cliente por lo mismo que el buscador: la ruta de cada ficha se arma
 * con una función, y React no deja cruzar funciones de servidor a cliente.
 * Reutiliza `ProductGrid` tal cual —misma tarjeta, mismo comparar— para
 * que estos artículos no parezcan de otra página.
 */
export function PopularProducts({ products, locale, label }: PopularProductsProps) {
  const { t } = useLocale();

  const compareLabels = useMemo(
    () => ({
      add: t("compareAddLabel"),
      remove: t("compareRemoveLabel"),
      full: t("compareFullLabel"),
    }),
    [t],
  );

  const href = (product: Product) => (product.slug ? productPath(locale, product.slug) : undefined);

  return (
    <ProductGrid
      products={products}
      // Igual que ProductSearchApp: "es-HN" imprime "L 299.00", "es" a secas
      // imprime "299,00 HNL".
      locale={locale === "en" ? "en-HN" : "es-HN"}
      mode="grid"
      density="compact"
      productHref={href}
      compareLabels={compareLabels}
      viewLargerImageLabel={t("viewLargerImageLabel")}
      closeImageLabel={t("closeImageLabel")}
      label={label}
    />
  );
}
