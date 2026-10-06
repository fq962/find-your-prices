/**
 * El carrito dentro de una URL, para mandarlo por WhatsApp o abrirlo en otro
 * teléfono.
 *
 * El sitio no tiene cuentas, así que no hay dónde guardar una lista para
 * compartirla: la lista entera viaja en el enlace. Solo van ids y cantidades
 * —nombres, precios y tiendas los vuelve a leer quien abre el enlace, ya
 * vigentes—.
 *
 * Formato: por renglón, los 16 bytes del uuid y 2 bytes de cantidad, todo en
 * base64url. 24 caracteres por renglón: cien renglones caben en ~2 400, muy
 * por debajo de lo que aguanta cualquier navegador o WhatsApp. Con el uuid en
 * texto serían 40 por renglón.
 */

import { clampQuantity, MAX_CART_LINES } from "./cart";

export interface SharedLine {
  id: string;
  quantity: number;
}

/** Nombre del parámetro en la URL de la cotización. */
export const SHARE_PARAM = "c";

const UUID_HEX = /^[0-9a-f]{32}$/;
const BYTES_PER_LINE = 18;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeCart(lines: SharedLine[]): string {
  const valid = lines
    .filter((line) => UUID_HEX.test(line.id.replaceAll("-", "").toLowerCase()))
    .slice(0, MAX_CART_LINES);
  const bytes = new Uint8Array(valid.length * BYTES_PER_LINE);

  valid.forEach((line, index) => {
    const offset = index * BYTES_PER_LINE;
    const hex = line.id.replaceAll("-", "").toLowerCase();
    for (let byte = 0; byte < 16; byte += 1) {
      bytes[offset + byte] = Number.parseInt(hex.slice(byte * 2, byte * 2 + 2), 16);
    }
    const quantity = clampQuantity(line.quantity);
    bytes[offset + 16] = quantity >> 8;
    bytes[offset + 17] = quantity & 0xff;
  });

  return toBase64Url(bytes);
}

/**
 * Lo inverso. Ante cualquier cosa rara —enlace cortado, editado a mano—
 * devuelve los renglones que sí se pudieron leer en vez de fallar entero.
 */
export function decodeCart(value: string | null | undefined): SharedLine[] {
  if (!value) return [];
  const bytes = fromBase64Url(value.trim());
  if (!bytes) return [];

  const result: SharedLine[] = [];
  const seen = new Set<string>();
  const count = Math.min(Math.floor(bytes.length / BYTES_PER_LINE), MAX_CART_LINES);

  for (let index = 0; index < count; index += 1) {
    const offset = index * BYTES_PER_LINE;
    let hex = "";
    for (let byte = 0; byte < 16; byte += 1) {
      hex += bytes[offset + byte].toString(16).padStart(2, "0");
    }
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, quantity: clampQuantity((bytes[offset + 16] << 8) | bytes[offset + 17]) });
  }

  return result;
}
