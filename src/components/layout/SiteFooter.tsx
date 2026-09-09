import { siteConfig } from "@/config/site";
import { SHELL } from "@/components/layout/shell";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className={`${SHELL} flex flex-col gap-1 py-10`}>
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
