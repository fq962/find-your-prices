import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SHELL_READING } from "@/components/layout/shell";
import { siteConfig } from "@/config/site";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { ABOUT_CONTENT } from "./aboutContent";

/**
 * Página "Acerca de".
 *
 * Una columna de lectura centrada, con el mismo tratamiento de encabezados que
 * las páginas de política: son la misma familia de páginas de texto y merecen
 * leerse igual. El único momento con peso visual es el título, que reutiliza el
 * contraste sans/serif de la portada para que la página se sienta del mismo
 * sitio.
 *
 * El texto vive en `aboutContent.ts`; acá sólo está la forma.
 */

export interface AboutViewProps {
  locale: Locale;
}

const POLICY_PAGES = ["terms", "privacy", "content"] as const;

const POLICY_LABELS: Record<Locale, Record<(typeof POLICY_PAGES)[number], string>> = {
  es: { terms: "Términos de uso", privacy: "Privacidad", content: "Uso de contenido" },
  en: { terms: "Terms of use", privacy: "Privacy", content: "Content use" },
};

export function AboutView({ locale }: AboutViewProps) {
  const content = ABOUT_CONTENT[locale];

  return (
    <div className={`${SHELL_READING} pb-8`}>
      <header className="flex flex-col items-start pt-14 pb-10 sm:pt-20 sm:pb-14">
        <h1
          className="enter text-[clamp(2.75rem,9vw,4.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]"
          style={{ "--enter-delay": "80ms" } as CSSProperties}
        >
          {content.title}
        </h1>

        <p
          className="enter mt-4 max-w-[24ch] font-serif text-[clamp(1.375rem,5vw,2.125rem)] leading-[1.15] tracking-[-0.015em] text-[var(--accent)] italic"
          style={{ "--enter-delay": "180ms" } as CSSProperties}
        >
          {content.lede}
        </p>
      </header>

      <Section heading={content.what.heading} delay="260ms">
        {content.what.paragraphs.map((paragraph) => (
          <Paragraph key={paragraph}>{paragraph}</Paragraph>
        ))}

        {/* La autoría va dentro del texto y no en un bloque de retratos: son dos
            apodos de GitHub, y un enlace a su perfil dice más de quiénes somos
            que cualquier tarjeta con una inicial dentro de un círculo. */}
        <Paragraph>
          {content.credit.lead}{" "}
          {siteConfig.creators.map((creator, index) => (
            <span key={creator.nick}>
              {index > 0 && content.credit.join}
              <a
                href={creator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium text-[var(--text)] underline decoration-[var(--border-strong)] decoration-1 underline-offset-[3px] outline-none transition-colors duration-[var(--dur-fast)] hover:decoration-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {creator.nick}
              </a>
            </span>
          ))}
          {content.credit.tail}
        </Paragraph>
      </Section>

      <Section heading={content.sourcing.heading} delay="320ms">
        {content.sourcing.paragraphs.map((paragraph) => (
          <Paragraph key={paragraph}>{paragraph}</Paragraph>
        ))}
      </Section>

      <Section heading={content.honesty.heading} delay="380ms">
        <ul className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] [&>li+li]:border-t [&>li+li]:border-[var(--border)]">
          {content.honesty.items.map((item) => (
            <li key={item} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="mt-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 8.5 15.5 15.5" />
              </svg>
              <span className="text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)] sm:text-[1rem]">
                {item}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 pt-2">
          <p className="text-[0.9375rem] leading-[1.6] text-[var(--text-tertiary)]">
            {content.honesty.policiesNote}
          </p>
          <ul className="flex flex-wrap gap-2">
            {POLICY_PAGES.map((page) => (
              <li key={page}>
                <Link
                  href={routeFor(page, locale)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2 text-[0.875rem] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {POLICY_LABELS[locale][page]}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h13m0 0-5-5m5 5-5 5" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <section className="mt-14 flex flex-col items-start gap-3 rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-9 sm:mt-16">
        <h2 className="text-[1.375rem] font-semibold tracking-[-0.025em] text-[var(--text)]">
          {content.cta.heading}
        </h2>
        <p className="max-w-[44ch] text-[1rem] leading-[1.6] text-[var(--text-secondary)]">
          {content.cta.body}
        </p>
        <Link
          href={routeFor("home", locale)}
          className="mt-1 inline-flex h-12 items-center rounded-full bg-[var(--text)] px-6 text-[0.9375rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          {content.cta.action}
        </Link>
      </section>
    </div>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <p className="text-[1rem] leading-[1.7] text-[var(--text-secondary)] sm:text-[1.0625rem]">
      {children}
    </p>
  );
}

interface SectionProps {
  heading: string;
  delay: string;
  children: ReactNode;
}

function Section({ heading, delay, children }: SectionProps) {
  return (
    <section
      className="enter mt-11 flex flex-col gap-3.5 sm:mt-14"
      style={{ "--enter-delay": delay } as CSSProperties}
    >
      <h2 className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--text)] sm:text-[1.25rem]">
        {heading}
      </h2>
      {children}
    </section>
  );
}
