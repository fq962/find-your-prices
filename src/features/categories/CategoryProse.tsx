import type { ReactNode } from "react";

/**
 * Cuerpo SEO de una categoría, escrito en Markdown mínimo desde el panel.
 *
 * Se admite a propósito muy poco: `## Subtítulo`, párrafos separados por
 * línea en blanco, listas con `- ` y **negrita**. Nada de HTML crudo —el
 * texto lo escribe una persona con acceso al panel, pero el panel tiene una
 * contraseña compartida, y un `<script>` en una landing pública es un precio
 * demasiado alto por ahorrarse este parser de treinta líneas.
 *
 * Los subtítulos salen como `<h2>`/`<h3>` reales: son lo que Google lee como
 * estructura, y el motivo por el que el cuerpo existe.
 */
export function CategoryProse({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className={`space-y-5 ${className}`}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: string, key: number): ReactNode {
  if (block.startsWith("### ")) {
    return (
      <h3
        key={key}
        className="pt-2 text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--text)]"
      >
        {inline(block.slice(4))}
      </h3>
    );
  }
  if (block.startsWith("## ")) {
    return (
      <h2
        key={key}
        className="pt-4 text-[clamp(1.25rem,2.4vw,1.5rem)] font-semibold tracking-[-0.02em] text-balance text-[var(--text)]"
      >
        {inline(block.slice(3))}
      </h2>
    );
  }

  const lines = block.split("\n");
  if (lines.every((line) => /^[-*] /.test(line))) {
    return (
      <ul key={key} className="list-disc space-y-1.5 pl-5 marker:text-[var(--text-tertiary)]">
        {lines.map((line, i) => (
          <li key={i}>{inline(line.slice(2))}</li>
        ))}
      </ul>
    );
  }

  return <p key={key}>{inline(lines.join(" "))}</p>;
}

/** `**negrita**` es lo único que se interpreta dentro de una línea. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-[var(--text)]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
