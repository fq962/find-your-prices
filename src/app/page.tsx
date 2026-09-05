import { LocaleProvider } from "@/features/i18n/LocaleContext";
import { LocaleSwitcher } from "@/features/i18n/LocaleSwitcher";
import { Hero } from "@/features/products/components/Hero";
import { ProductSearchApp } from "@/features/products/components/ProductSearchApp";
import { products } from "@/features/products/data";

export default function Home() {
  return (
    <LocaleProvider>
      <div className="flex flex-1 flex-col bg-neutral-50">
        <div className="flex justify-end px-4 pt-4 sm:px-6">
          <LocaleSwitcher />
        </div>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pb-16 sm:gap-14 sm:px-6 lg:gap-20">
          <Hero />
          <ProductSearchApp initialProducts={products} />
        </main>
      </div>
    </LocaleProvider>
  );
}
