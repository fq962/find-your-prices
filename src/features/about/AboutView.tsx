import Link from "next/link";
import type { CSSProperties } from "react";
import { SHELL } from "@/components/layout/shell";
import { siteConfig } from "@/config/site";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { ABOUT_CONTENT } from "./aboutContent";

/**
 * Página "Acerca de".
 *
 * Una sola columna, sin ilustraciones ni tarjetas de más: quien entra acá viene
 * a leer qué es esto y quién lo hizo, y esas dos respuestas caben en pantalla y
 * media. El único momento con peso visual es el título, que reutiliza el
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
    <div className={`${SHELL} pb-8`}>
      {/* --- Encabezado ------------------------------------------------ */}
      <header className="flex flex-col items-start pt-14 pb-10 sm:pt-20 sm:pb-14">
        <p
          className="enter text-[0.6875rem] font-medium tracking-[0.18em] text-[var(--text-tertiary)] uppercase"
          style={{ "--enter-delay": "80ms" } as CSSProperties}
        >
          {siteConfig.name}
        </p>

        <h1
          className="enter mt-3 text-[clamp(2.75rem,9vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]"
          style={{ "--enter-delay": "140ms" } as CSSProperties}
        >
          {content.title}
        </h1>

        <p
          className="enter mt-4 max-w-[24ch] font-serif text-[clamp(1.375rem,5vw,2.25rem)] leading-[1.15] tracking-[-0.015em] text-[var(--accent)] italic"
          style={{ "--enter-delay": "240ms" } as CSSProperties}
        >
          {content.lede}
        </p>
      </header>

      {/* --- Qué es esto ------------------------------------------------ */}
      <Section heading={content.what.heading} delay="320ms">
        {/* 62ch: el ancho al que una línea se lee sin perder el renglón. Que el
            contenedor de la página sea ancho no significa que el texto lo sea. */}
        <div className="flex max-w-[62ch] flex-col gap-4">
          {content.what.paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="text-[1.0625rem] leading-[1.65] text-[var(--text-secondary)] sm:text-[1.125rem]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </Section>

      {/* --- Cómo funciona ---------------------------------------------- */}
      <Section heading={content.how.heading} delay="380ms">
        <ol className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {content.how.steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5"
            >
              <span
                aria-hidden="true"
                className="text-[0.75rem] font-semibold tabular-nums text-[var(--accent)]"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[1.0625rem] font-medium tracking-[-0.015em] text-[var(--text)]">
                {step.title}
              </h3>
              <p className="text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* --- Quiénes ----------------------------------------------------- */}
      <Section heading={content.creators.heading} delay="440ms">
        <div className="flex flex-col gap-5">
          {/* Dos personas, dos columnas, también en teléfono: verlos juntos es
              el punto del bloque. Apilados parecerían dos proyectos. */}
          <ul className="grid grid-cols-2 gap-3 sm:max-w-md sm:gap-4">
            {siteConfig.creators.map((creator) => (
              <li
                key={creator.name}
                className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-6 text-center"
              >
                {/* Inicial en vez de foto: no hay fotos, y un avatar genérico
                    de silueta dice menos que la letra del propio nombre. */}
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[1.375rem] font-semibold text-[var(--accent)] sm:h-16 sm:w-16"
                >
                  {creator.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-[1rem] font-medium tracking-[-0.01em] text-[var(--text)]">
                  {creator.name}
                </span>
              </li>
            ))}
          </ul>

          <p className="max-w-[52ch] text-[1.0625rem] leading-[1.6] text-[var(--text-secondary)]">
            {content.creators.caption}
          </p>
        </div>
      </Section>

      {/* --- Lo que no somos --------------------------------------------- */}
      <Section heading={content.honesty.heading} delay="500ms">
        <div className="flex flex-col gap-6">
          <ul className="max-w-[62ch] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] [&>li+li]:border-t [&>li+li]:border-[var(--border)]">
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

          <div className="flex flex-col gap-3">
            <p className="max-w-[62ch] text-[0.9375rem] leading-[1.6] text-[var(--text-tertiary)]">
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
        </div>
      </Section>

      {/* --- Vuelta al catálogo ------------------------------------------ */}
      <section className="mt-14 flex flex-col items-start gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-10 sm:mt-20 sm:items-center sm:py-14 sm:text-center">
        <h2 className="text-[1.5rem] font-semibold tracking-[-0.025em] text-[var(--text)] sm:text-[1.875rem]">
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

interface SectionProps {
  heading: string;
  delay: string;
  children: React.ReactNode;
}

function Section({ heading, delay, children }: SectionProps) {
  return (
    <section
      className="enter mt-12 flex flex-col gap-5 sm:mt-16"
      style={{ "--enter-delay": delay } as CSSProperties}
    >
      <h2 className="text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
        {heading}
      </h2>
      {children}
    </section>
  );
}
