import Link from "next/link";
import type { CSSProperties } from "react";
import { SHELL_READING } from "@/components/layout/shell";
import { siteConfig } from "@/config/site";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { LEGAL_DOCS, POLICIES_UPDATED, type LegalDocId } from "./legalContent";

/**
 * Plantilla de los tres documentos legales.
 *
 * Una sola vista para los tres: son el mismo objeto —título, entradilla,
 * secciones numeradas— y tener tres componentes casi iguales garantizaba que
 * uno se quedara atrás al cambiar algo.
 *
 * Dos decisiones que importan más de lo que parece:
 *
 *   - El texto se mide en `ch`, no en píxeles. Un documento legal se lee de
 *     corrido y a partir de ~75 caracteres por línea el ojo pierde el renglón
 *     al volver a la izquierda.
 *   - Los otros dos documentos están enlazados arriba. Quien llega acá suele
 *     ser alguien de una tienda buscando a quién escribirle; obligarlo a volver
 *     al pie de página para encontrar el documento correcto es exactamente el
 *     tipo de fricción que termina en un correo del abogado en vez de en uno
 *     nuestro.
 */

export interface LegalDocViewProps {
  doc: LegalDocId;
  locale: Locale;
}

const DOC_ORDER: LegalDocId[] = ["terms", "privacy", "content"];

const NAV_LABELS: Record<Locale, Record<LegalDocId, string>> = {
  es: { terms: "Términos", privacy: "Privacidad", content: "Uso de contenido" },
  en: { terms: "Terms", privacy: "Privacy", content: "Content use" },
};

const UPDATED_LABEL: Record<Locale, string> = {
  es: "Última actualización",
  en: "Last updated",
};

const CONTACT_LABEL: Record<Locale, { heading: string; body: string; action: string }> = {
  es: {
    heading: "¿Necesitás hablar con alguien?",
    body: "Escribinos y respondemos. No hace falta ningún trámite previo.",
    action: "Escribir un correo",
  },
  en: {
    heading: "Need to talk to someone?",
    body: "Write to us and we answer. No paperwork required first.",
    action: "Send an email",
  },
};

export function LegalDocView({ doc, locale }: LegalDocViewProps) {
  const content = LEGAL_DOCS[locale][doc];
  const contact = CONTACT_LABEL[locale];

  // La fecha se guarda en ISO y se formatea acá: "9 de septiembre de 2026" en
  // español y "September 9, 2026" en inglés, en vez de un 9/9/2026 ambiguo.
  const updated = new Intl.DateTimeFormat(locale === "es" ? "es-HN" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${POLICIES_UPDATED}T00:00:00Z`));

  return (
    <div className={`${SHELL_READING} pb-8`}>
      <header className="flex flex-col items-start pt-14 pb-8 sm:pt-20 sm:pb-10">
        <h1
          className="enter max-w-[18ch] text-[clamp(2.25rem,6.5vw,3.5rem)] leading-[1] font-semibold tracking-[-0.035em] text-balance text-[var(--text)]"
          style={{ "--enter-delay": "80ms" } as CSSProperties}
        >
          {content.title}
        </h1>

        <p
          className="enter mt-4 text-[1.0625rem] leading-[1.6] text-[var(--text-secondary)] sm:text-[1.1875rem]"
          style={{ "--enter-delay": "160ms" } as CSSProperties}
        >
          {content.lede}
        </p>

        <p
          className="enter mt-5 text-[0.8125rem] text-[var(--text-tertiary)]"
          style={{ "--enter-delay": "220ms" } as CSSProperties}
        >
          {UPDATED_LABEL[locale]}: <time dateTime={POLICIES_UPDATED}>{updated}</time>
        </p>
      </header>

      {/* Los tres documentos, siempre a mano. El actual queda marcado en vez de
          desaparecer: así se ve dónde estás dentro del conjunto. */}
      <nav aria-label={content.title} className="mb-10 sm:mb-12">
        <ul className="flex flex-wrap gap-2">
          {DOC_ORDER.map((candidate) => {
            const isCurrent = candidate === doc;
            return (
              <li key={candidate}>
                <Link
                  href={routeFor(candidate, locale)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`inline-flex items-center rounded-full border px-3.5 py-2 text-[0.875rem] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    isCurrent
                      ? "border-[var(--text)] bg-[var(--text)] font-medium text-[var(--text-inverted)]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  }`}
                >
                  {NAV_LABELS[locale][candidate]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <article className="flex flex-col gap-9">
        {content.sections.map((section, index) => (
          <section key={section.heading || `cont-${index}`} className="flex flex-col gap-3">
            {/* Una sección sin título es la continuación de la anterior: se
                pinta sin encabezado en vez de inventarle uno de relleno. */}
            {section.heading !== "" && (
              <h2 className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--text)] sm:text-[1.25rem]">
                {section.heading}
              </h2>
            )}

            {section.paragraphs?.map((paragraph) => (
              <p
                key={paragraph}
                className="text-[1rem] leading-[1.7] text-[var(--text-secondary)]"
              >
                {paragraph}
              </p>
            ))}

            {section.list && (
              <ul className="flex flex-col gap-2.5 pt-1">
                {section.list.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[0.6875rem] h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]"
                    />
                    <span className="text-[1rem] leading-[1.7] text-[var(--text-secondary)]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>

      <section className="mt-12 flex flex-col items-start gap-3 rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-8 sm:mt-16">
        <h2 className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--text)]">
          {contact.heading}
        </h2>
        <p className="max-w-[46ch] text-[0.9375rem] leading-[1.6] text-[var(--text-secondary)]">
          {contact.body}
        </p>
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--text)] px-5 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m3.5 7 8.5 6 8.5-6" />
          </svg>
          {contact.action}
        </a>
        <p className="text-[0.8125rem] tabular-nums text-[var(--text-tertiary)]">
          {siteConfig.contactEmail}
        </p>
      </section>
    </div>
  );
}
