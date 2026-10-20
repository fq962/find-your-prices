import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "@/features/i18n/translate";
import { BrowseView } from "@/features/products/components/BrowseView";
import { parseBrowsePage } from "@/features/products/browsePaging";
import { browseMetadata } from "@/lib/seo/browseSeo";
import {
  categoryBreadcrumbs,
  categoryBrowsePath,
  categoryDescription,
  categoryIndexMetadata,
  categoryMetadata,
  categoryPaths,
  categoryTitle,
} from "@/lib/seo/categorySeo";
import { JsonLd } from "@/lib/seo/JsonLd";
import {
  breadcrumbJsonLd,
  categoryCollectionJsonLd,
  collectionPageJsonLd,
  graph,
  itemListJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/schema";
import { SITE_ROUTES } from "@/features/i18n/routes";
import { getCategoryBrowsePage } from "@/server/services/browsePages";
import { getCategoryIndex, getCategoryPage } from "@/server/services/categoryPages";
import { CategoryIndexView } from "./CategoryIndexView";
import { CategoryPageView } from "./CategoryPageView";

/**
 * Lo que comparten las cuatro rutas de categoría (índice y nodo, en dos
 * idiomas). Cada `page.tsx` es una línea que elige el idioma; el resto —datos,
 * metadata, JSON-LD y vista— vive acá una sola vez.
 */

export async function categoryIndexPageMetadata(locale: Locale): Promise<Metadata> {
  const data = await getCategoryIndex(locale);
  return categoryIndexMetadata(locale, data.totalProducts);
}

export async function CategoryIndexRoute({ locale }: { locale: Locale }) {
  const data = await getCategoryIndex(locale);

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd(locale),
          websiteJsonLd(locale),
          collectionPageJsonLd(locale, SITE_ROUTES.categories[locale]),
          breadcrumbJsonLd([
            { name: locale === "es" ? "Inicio" : "Home", path: SITE_ROUTES.home[locale] },
            {
              name: locale === "es" ? "Categorías" : "Categories",
              path: SITE_ROUTES.categories[locale],
            },
          ]),
        ])}
      />
      <CategoryIndexView locale={locale} data={data} />
    </>
  );
}

export async function categoryPageMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const data = await getCategoryPage(slug, locale);
  if (!data) {
    return {
      title: locale === "es" ? "Categoría no encontrada" : "Category not found",
      robots: { index: false, follow: true },
    };
  }
  return categoryMetadata(data, locale);
}

export async function CategoryRoute({ slug, locale }: { slug: string; locale: Locale }) {
  const data = await getCategoryPage(slug, locale);
  // 404 real: una categoría sin artículos (o inexistente) no es una landing.
  if (!data) notFound();

  const path = categoryPaths(data.category.slug)[locale];

  return (
    <>
      {/* Organización, sitio, la colección, sus productos populares y las
          migas en un solo grafo: es lo que le dice a Google que esta es una
          página de listado con jerarquía, no una ficha suelta. */}
      <JsonLd
        data={graph([
          organizationJsonLd(locale),
          websiteJsonLd(locale),
          categoryCollectionJsonLd({
            locale,
            path,
            name: categoryTitle(data.category, locale),
            description: categoryDescription(data, locale),
            image: data.category.imageUrl,
          }),
          itemListJsonLd(data.popular.length > 0 ? data.popular : data.initialProducts, locale),
          breadcrumbJsonLd(categoryBreadcrumbs(data.category, data.parent, locale)),
        ])}
      />
      <CategoryPageView locale={locale} data={data} />
    </>
  );
}

// -----------------------------------------------------------------------------
// Listado paginado "todos los productos" (solo es). Ver `browsePages.ts`.
// -----------------------------------------------------------------------------

async function loadCategoryBrowse(slug: string, rawPage: string) {
  const page = parseBrowsePage(rawPage);
  return page === null ? null : getCategoryBrowsePage(slug, page);
}

export async function categoryBrowseMetadata(slug: string, rawPage: string): Promise<Metadata> {
  const data = await loadCategoryBrowse(slug, rawPage);
  if (!data) return { title: "Página no encontrada", robots: { index: false, follow: true } };

  const { category } = data.scope;
  return browseMetadata({
    subject: category.name,
    page: data.page,
    pageCount: data.pageCount,
    total: data.total,
    products: data.products,
    path: categoryBrowsePath(category.slug, data.page),
    enPath: categoryPaths(category.slug).en,
  });
}

export async function CategoryBrowseRoute({ slug, rawPage }: { slug: string; rawPage: string }) {
  const data = await loadCategoryBrowse(slug, rawPage);
  if (!data) notFound();

  const { category, parent } = data.scope;
  const breadcrumbs = [
    ...categoryBreadcrumbs(category, parent, "es"),
    { name: `Página ${data.page}`, path: categoryBrowsePath(category.slug, data.page) },
  ];

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd("es"),
          websiteJsonLd("es"),
          itemListJsonLd(data.products, "es"),
          breadcrumbJsonLd(breadcrumbs),
        ])}
      />
      <BrowseView
        subject={category.name}
        page={data.page}
        pageCount={data.pageCount}
        total={data.total}
        products={data.products}
        breadcrumbs={breadcrumbs}
        landingPaths={categoryPaths(category.slug)}
        href={(page) => categoryBrowsePath(category.slug, page)}
      />
    </>
  );
}
