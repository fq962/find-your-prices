import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className="reveal-on-scroll mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-10 sm:px-6">
        <p className="text-[0.8125rem] tracking-[-0.005em] text-[var(--text-tertiary)]">
          {siteConfig.name}
        </p>
        <p className="text-[0.8125rem] text-[var(--text-tertiary)] opacity-70">
          © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
