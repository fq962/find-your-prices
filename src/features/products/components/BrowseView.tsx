import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { PopularProducts } from "@/features/categories/PopularProducts";
import { browseHeading, browsePageLabel } from "@/lib/seo/browseSeo";
import type { BreadcrumbItem } from "@/lib/seo/schema";
import type { Product } from "@/types";
import { BrowsePagination } from "./BrowsePagination";

interface BrowseViewProps {
  subject: string;
  page: number;
  pageCount: number;
  total: number;
  products: Product[];
  breadcrumbs: BreadcrumbItem[];
  /** La landing de la que cuelga el listado, en los dos idiomas. */
  landingPaths: { es: string; en: string };
  href: (page: number) => string;
}

/**
 * Una página del listado "todos los productos", de una categoría o de una
 * tienda (ver `server/services/browsePages.ts`).
 *
 * Deliberadamente sencilla: migas, título, la retícula de siempre y la
 * paginación arriba y abajo. Quien quiera filtrar tiene el buscador en la
 * landing, enlazado desde acá; esta página existe para que cada ficha tenga
 * un enlace que el rastreador pueda seguir. Solo en español.
 */
export function BrowseView({
  subject,
  page,
  pageCount,
  total,
  products,
  breadcrumbs,
  landingPaths,
  href,
}: BrowseViewProps) {
  const count = new Intl.NumberFormat("es-HN").format(total);
  const pagination = (
    <BrowsePagination current={page} pageCount={pageCount} href={href} label="Páginas del listado" />
  );

  return (
    <PageLayout locale="es" localePaths={landingPaths}>
      <div className={SHELL}>
        <div className="pt-6 sm:pt-8">
          <Breadcrumbs label="Ubicación" items={breadcrumbs} />
        </div>

        <header className="pt-10 pb-8 sm:pt-14">
          <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            {browsePageLabel(page, pageCount)}
          </p>
          <h1 className="mt-3 text-[clamp(1.875rem,4.4vw,3rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-[var(--text)]">
            {browseHeading(subject)}
          </h1>
          <p className="mt-4 max-w-[60ch] text-[1rem] leading-[1.55] text-[var(--text-secondary)]">
            {count} artículos con precio actualizado, de la A a la Z.{" "}
            <Link
              href={landingPaths.es}
              className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
            >
              Buscar y filtrar en {subject}
            </Link>
          </p>
        </header>

        <div className="pb-8">{pagination}</div>

        <PopularProducts products={products} locale="es" label={browseHeading(subject)} />

        <div className="border-t border-[var(--border)] mt-12 pt-8 pb-16 sm:pb-20">{pagination}</div>
      </div>
    </PageLayout>
  );
}
