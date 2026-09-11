"use client";

import { useState } from "react";
import {
  categoryLabel,
  UNCATEGORIZED_VALUE,
  type FacetOption,
} from "@/features/products/categoryFacets";
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
 * El orden es categoría, tienda, marca, precio y ajustes: primero qué se
 * busca, después dónde, después de quién, y al final cuánto. Categoría y
 * tienda arrancan abiertas porque son las dos primeras preguntas; lo demás va
 * plegado.
 */

export type FilterSectionKey = "category" | "price" | "store" | "brand" | "more";

export interface FilterSidebarProps {
  categories: FacetOption[];
  stores: FacetOption[];
  brands: FacetOption[];

  /** Opciones marcadas por faceta. Vacío es "todas". */
  category: string[];
  store: string[];
  brand: string[];
  minPrice?: number;
  maxPrice?: number;
  onlyDiscounted: boolean;
  includeUnavailable: boolean;

  onCategoryChange: (value: string[]) => void;
  onStoreChange: (value: string[]) => void;
  onBrandChange: (value: string[]) => void;
  onPriceChange: (range: PriceRange) => void;
  onOnlyDiscountedChange: (value: boolean) => void;
  onIncludeUnavailableChange: (value: boolean) => void;

  currencySymbol: string;
  formatAmount: (amount: number) => string;

  /**
   * Qué secciones arrancan abiertas. Por defecto categoría y tienda (ver
   * `INITIALLY_OPEN`); la hoja de teléfono pasa `[]` porque ahí el panel entra
   * a pantalla completa y todo abierto de una vez es más para desplazar que
   * para leer.
   */
  initiallyOpen?: FilterSectionKey[];

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
    /** Opción "Sin categorizar aún" del árbol de categorías. */
    uncategorized: string;
    /** Chevrón que abre y cierra las subcategorías. */
    expand: string;
    collapse: string;
  };
}

const INITIALLY_OPEN: FilterSectionKey[] = ["category", "store"];

/**
 * Resumen de una faceta plegada: la única elegida, o cuántas hay.
 *
 * `label` traduce el valor a texto: las categorías viajan como slug y el
 * resumen tiene que decir "Juguetería y Juegos", no "jugueteria-y-juegos".
 */
function facetSummary(
  values: string[],
  label: (value: string) => string = (value) => value,
): string | undefined {
  if (values.length === 0) return undefined;
  if (values.length === 1) return label(values[0]);
  return `${label(values[0])} +${values.length - 1}`;
}

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
  initiallyOpen = INITIALLY_OPEN,
  labels,
}: FilterSidebarProps) {
  const [open, setOpen] = useState<Set<FilterSectionKey>>(new Set(initiallyOpen));

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

  const categoryListLabels = {
    ...listLabels,
    uncategorized: labels.uncategorized,
    expand: labels.expand,
    collapse: labels.collapse,
  };

  const categoryName = (value: string) =>
    value === UNCATEGORIZED_VALUE ? labels.uncategorized : categoryLabel(categories, value);

  return (
    <div className="flex flex-col">
      <FilterSection
        title={labels.category}
        open={open.has("category")}
        onToggle={() => toggle("category")}
        summary={facetSummary(category, categoryName)}
      >
        <FilterOptionList
          name="fyp-facet-category"
          options={categories}
          value={category}
          onChange={onCategoryChange}
          labels={categoryListLabels}
        />
      </FilterSection>

      <FilterSection
        title={labels.store}
        open={open.has("store")}
        onToggle={() => toggle("store")}
        summary={facetSummary(store)}
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
        summary={facetSummary(brand)}
      >
        <FilterOptionList
          name="fyp-facet-brand"
          options={brands}
          value={brand}
          onChange={onBrandChange}
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
