"use client";

import { useState } from "react";
import type { FacetOption } from "@/server/services/catalog";
import { FilterOptionList } from "./FilterOptionList";
import { FilterSection } from "./FilterSection";
import { PriceFilter, type PriceRange } from "./PriceFilter";
import { Toggle } from "./Toggle";

/**
 * Panel de facetas del catálogo.
 *
 * Un solo componente para los dos sitios donde aparece: fijo a la izquierda en
 * escritorio, y dentro de la hoja a pantalla completa en teléfono. Escribirlo
 * dos veces era garantizar que una faceta nueva entrara sólo en uno de los dos
 * —y que nadie lo notara hasta que alguien reportara que en el móvil "no está
 * el filtro de marca".
 *
 * Qué sección arranca abierta no es arbitrario: categoría y precio son las dos
 * preguntas con las que la gente llega ("qué tipo de cosa" y "cuánto puedo
 * gastar"). Tienda y marca son refinamientos, y van plegadas.
 */

export type FilterSectionKey = "category" | "price" | "store" | "brand" | "more";

export interface FilterSidebarProps {
  categories: FacetOption[];
  stores: FacetOption[];
  brands: FacetOption[];

  category?: string;
  store?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  onlyDiscounted: boolean;
  includeUnavailable: boolean;

  onCategoryChange: (value: string | undefined) => void;
  onStoreChange: (value: string | undefined) => void;
  onBrandChange: (value: string | undefined) => void;
  onPriceChange: (range: PriceRange) => void;
  onOnlyDiscountedChange: (value: boolean) => void;
  onIncludeUnavailableChange: (value: boolean) => void;

  currencySymbol: string;
  formatAmount: (amount: number) => string;

  labels: {
    category: string;
    price: string;
    store: string;
    brand: string;
    more: string;
    all: string;
    search: string;
    noMatches: string;
    anyPrice: string;
    andUp: string;
    minPrice: string;
    maxPrice: string;
    onlyDiscounted: string;
    includeUnavailable: string;
    showMore: string;
    showLess: string;
  };
}

const INITIALLY_OPEN: FilterSectionKey[] = ["category", "price"];

export function FilterSidebar({
  categories,
  stores,
  brands,
  category,
  store,
  brand,
  minPrice,
  maxPrice,
  onlyDiscounted,
  includeUnavailable,
  onCategoryChange,
  onStoreChange,
  onBrandChange,
  onPriceChange,
  onOnlyDiscountedChange,
  onIncludeUnavailableChange,
  currencySymbol,
  formatAmount,
  labels,
}: FilterSidebarProps) {
  const [open, setOpen] = useState<Set<FilterSectionKey>>(new Set(INITIALLY_OPEN));

  const toggle = (key: FilterSectionKey) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Resumen del precio elegido, para cuando la sección está plegada. */
  const priceSummary = () => {
    if (minPrice === undefined && maxPrice === undefined) return undefined;
    if (maxPrice === undefined) return `${formatAmount(minPrice ?? 0)} ${labels.andUp}`;
    return `${formatAmount(minPrice ?? 0)} – ${formatAmount(maxPrice)}`;
  };

  const moreSummary = [
    onlyDiscounted ? labels.onlyDiscounted : null,
    includeUnavailable ? labels.includeUnavailable : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const listLabels = {
    all: labels.all,
    search: labels.search,
    noMatches: labels.noMatches,
    showMore: labels.showMore,
    showLess: labels.showLess,
  };

  return (
    <div className="flex flex-col">
      <FilterSection
        title={labels.category}
        open={open.has("category")}
        onToggle={() => toggle("category")}
        summary={category}
      >
        <FilterOptionList
          name="fyp-facet-category"
          options={categories}
          value={category}
          onChange={onCategoryChange}
          labels={listLabels}
        />
      </FilterSection>

      <FilterSection
        title={labels.price}
        open={open.has("price")}
        onToggle={() => toggle("price")}
        summary={priceSummary()}
      >
        <PriceFilter
          minPrice={minPrice}
          maxPrice={maxPrice}
          onChange={onPriceChange}
          currencySymbol={currencySymbol}
          formatAmount={formatAmount}
          labels={{
            min: labels.minPrice,
            max: labels.maxPrice,
            andUp: labels.andUp,
            any: labels.anyPrice,
          }}
        />
      </FilterSection>

      <FilterSection
        title={labels.store}
        open={open.has("store")}
        onToggle={() => toggle("store")}
        summary={store}
      >
        <FilterOptionList
          name="fyp-facet-store"
          options={stores}
          value={store}
          onChange={onStoreChange}
          labels={listLabels}
        />
      </FilterSection>

      <FilterSection
        title={labels.brand}
        open={open.has("brand")}
        onToggle={() => toggle("brand")}
        summary={brand}
      >
        <FilterOptionList
          name="fyp-facet-brand"
          options={brands}
          value={brand}
          onChange={onBrandChange}
          labels={listLabels}
        />
      </FilterSection>

      {/* Los dos interruptores van juntos y al final porque no son facetas del
          catálogo —no responden "qué producto"— sino ajustes de qué entra en la
          lista. Mezclarlos con las categorías obligaría a leer la barra entera
          para entender por qué una búsqueda devuelve poco. */}
      <FilterSection
        title={labels.more}
        open={open.has("more")}
        onToggle={() => toggle("more")}
        summary={moreSummary || undefined}
      >
        <div className="flex flex-col gap-3 pt-1">
          <Toggle
            checked={onlyDiscounted}
            onChange={onOnlyDiscountedChange}
            label={labels.onlyDiscounted}
          />
          <Toggle
            checked={includeUnavailable}
            onChange={onIncludeUnavailableChange}
            label={labels.includeUnavailable}
          />
        </div>
      </FilterSection>
    </div>
  );
}
