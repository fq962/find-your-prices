import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { pgErrorCode, pgErrorMessage } from '@/server/db/pg';
import { rpc } from '@/server/db/rpc';
import { affiliateApplications, affiliateOffers, affiliatePartners } from '@/server/db/schema';
import { deleteByPublicUrl, uploadImage } from '@/server/storage/r2';
import { SITE_ROUTES } from '@/features/i18n/routes';
import {
  isSafeHttpUrl,
  isValidSlug,
  isWithinWindow,
  normalizeCurrency,
  partnerPaths,
  slugify,
} from '@/features/affiliates/affiliateRules';
import type { ApplicationData } from '@/features/affiliates/applicationRules';
import { hasDatabase } from './catalog';

/**
 * Programa de afiliados (migración 0047): lectura para las páginas públicas,
 * escritura para el panel y el contador de clics de la redirección.
 *
 * Las tablas están cerradas a las llaves públicas, así que todo pasa por el
 * cliente de servidor, igual que `storeContent.ts`. Las páginas públicas solo
 * ven aliados activos y dentro de su ventana de campaña, y de ellos solo los
 * productos activos.
 *
 * Las filas van por Drizzle y los logos viven en R2 (carpeta
 * `affiliate-images/`, ver `server/storage/r2.ts`).
 */

/** Carpeta de R2 de los logos (antes, el bucket de Supabase del mismo nombre). */
export const AFFILIATE_IMAGES_BUCKET = 'affiliate-images';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface AffiliateOffer {
  id: string;
  partnerId: string;
  titleEs: string;
  titleEn: string | null;
  noteEs: string | null;
  noteEn: string | null;
  url: string;
  imageUrl: string | null;
  price: number | null;
  listPrice: number | null;
  currency: string;
  /** Código propio del producto; si es `null` vale el del aliado. */
  promoCode: string | null;
  isActive: boolean;
  sortOrder: number;
  clickCount: number;
}

export interface AffiliatePartner {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  affiliateUrl: string | null;
  promoCode: string | null;
  promoTextEs: string | null;
  promoTextEn: string | null;
  taglineEs: string | null;
  taglineEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  logoUrl: string | null;
  imageAlt: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  clickCount: number;
  offers: AffiliateOffer[];
}

const p = affiliatePartners;
const o = affiliateOffers;

const PARTNER_COLUMNS = {
  id: p.id,
  slug: p.slug,
  name: p.name,
  website_url: p.website_url,
  affiliate_url: p.affiliate_url,
  promo_code: p.promo_code,
  promo_text_es: p.promo_text_es,
  promo_text_en: p.promo_text_en,
  tagline_es: p.tagline_es,
  tagline_en: p.tagline_en,
  description_es: p.description_es,
  description_en: p.description_en,
  logo_url: p.logo_url,
  image_alt: p.image_alt,
  is_active: p.is_active,
  is_featured: p.is_featured,
  sort_order: p.sort_order,
  starts_at: p.starts_at,
  ends_at: p.ends_at,
  click_count: p.click_count,
};
const OFFER_COLUMNS = {
  id: o.id,
  partner_id: o.partner_id,
  title_es: o.title_es,
  title_en: o.title_en,
  note_es: o.note_es,
  note_en: o.note_en,
  url: o.url,
  image_url: o.image_url,
  price: o.price,
  list_price: o.list_price,
  currency: o.currency,
  promo_code: o.promo_code,
  is_active: o.is_active,
  sort_order: o.sort_order,
  click_count: o.click_count,
};

/** Sin la 0047 la tabla no existe: las páginas muestran "sin aliados" y no caen. */
const MISSING_TABLE = '42P01';

function isMissingTable(error: unknown): boolean {
  return pgErrorCode(error) === MISSING_TABLE;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapOffer(row: Record<string, unknown>): AffiliateOffer {
  return {
    id: String(row.id),
    partnerId: String(row.partner_id),
    titleEs: String(row.title_es),
    titleEn: (row.title_en as string | null) ?? null,
    noteEs: (row.note_es as string | null) ?? null,
    noteEn: (row.note_en as string | null) ?? null,
    url: String(row.url),
    imageUrl: (row.image_url as string | null) ?? null,
    price: toNumber(row.price),
    listPrice: toNumber(row.list_price),
    currency: String(row.currency ?? 'USD'),
    promoCode: (row.promo_code as string | null) ?? null,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
    clickCount: Number(row.click_count ?? 0),
  };
}

function mapPartner(row: Record<string, unknown>, offers: AffiliateOffer[]): AffiliatePartner {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    websiteUrl: String(row.website_url),
    affiliateUrl: (row.affiliate_url as string | null) ?? null,
    promoCode: (row.promo_code as string | null) ?? null,
    promoTextEs: (row.promo_text_es as string | null) ?? null,
    promoTextEn: (row.promo_text_en as string | null) ?? null,
    taglineEs: (row.tagline_es as string | null) ?? null,
    taglineEn: (row.tagline_en as string | null) ?? null,
    descriptionEs: (row.description_es as string | null) ?? null,
    descriptionEn: (row.description_en as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    imageAlt: (row.image_alt as string | null) ?? null,
    isActive: Boolean(row.is_active),
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order ?? 0),
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    clickCount: Number(row.click_count ?? 0),
    offers: offers.filter((offer) => offer.partnerId === String(row.id)),
  };
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

/** Todos los aliados con todos sus productos, para el panel. */
export async function listPartnersForAdmin(): Promise<AffiliatePartner[]> {
  const db = getDb();
  let partners: Array<Record<string, unknown>>;
  let offers: Array<Record<string, unknown>>;
  try {
    [partners, offers] = await Promise.all([
      db.select(PARTNER_COLUMNS).from(p).orderBy(asc(p.sort_order), asc(p.name)),
      db.select(OFFER_COLUMNS).from(o).orderBy(asc(o.sort_order), asc(o.created_at)),
    ]);
  } catch (error) {
    throw new Error(explain(error));
  }

  const offerRows = offers.map(mapOffer);
  return partners.map((row) => mapPartner(row, offerRows));
}

export async function getPartnerForAdmin(id: string): Promise<AffiliatePartner | null> {
  const rows = await listPartnersForAdmin();
  return rows.find((row) => row.id === id) ?? null;
}

/**
 * Lo que ve el visitante: aliados activos y vigentes, con sus productos
 * activos. Destacados primero, después el orden del panel.
 */
export async function listPublicPartners(now: Date = new Date()): Promise<AffiliatePartner[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  let partners: Array<Record<string, unknown>>;
  try {
    partners = await db
      .select(PARTNER_COLUMNS)
      .from(p)
      .where(eq(p.is_active, true))
      .orderBy(desc(p.is_featured), asc(p.sort_order), asc(p.name));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw new Error(pgErrorMessage(error));
  }

  const live = partners.filter((row) =>
    isWithinWindow((row.starts_at as string | null) ?? null, (row.ends_at as string | null) ?? null, now),
  );
  if (live.length === 0) return [];

  const offers = await db
    .select(OFFER_COLUMNS)
    .from(o)
    .where(and(eq(o.is_active, true), inArray(o.partner_id, live.map((row) => String(row.id)))))
    .orderBy(asc(o.sort_order), asc(o.created_at));

  const offerRows = (offers as Array<Record<string, unknown>>).map(mapOffer);
  return live.map((row) => mapPartner(row, offerRows));
}

export async function getPublicPartner(slug: string): Promise<AffiliatePartner | null> {
  if (!isValidSlug(slug)) return null;
  const partners = await listPublicPartners();
  return partners.find((partner) => partner.slug === slug) ?? null;
}

/**
 * A dónde manda `/go/<aliado>`: el enlace del producto si vino uno válido de
 * ese aliado, si no el enlace de afiliado, si no el sitio. Suma el clic.
 * `null` si el aliado no existe o no está vigente.
 */
export interface Outbound {
  target: string;
  partnerId: string;
  offerId: string | null;
}

export async function resolveOutbound(slug: string, offerId: string | null): Promise<Outbound | null> {
  const partner = await getPublicPartner(slug);
  if (!partner) return null;

  const offer = offerId ? partner.offers.find((item) => item.id === offerId) ?? null : null;
  const target = offer?.url ?? partner.affiliateUrl ?? partner.websiteUrl;
  if (!isSafeHttpUrl(target)) return null;

  // El clic no puede frenar la salida: si falla, se pierde un conteo, nada más.
  try {
    await rpc('record_affiliate_click', { p_partner_id: partner.id, p_offer_id: offer?.id ?? null });
  } catch (error) {
    console.warn('[affiliates] no se pudo contar el clic:', pgErrorMessage(error));
  }

  return { target, partnerId: partner.id, offerId: offer?.id ?? null };
}

// -----------------------------------------------------------------------------
// Escritura (panel)
// -----------------------------------------------------------------------------

export interface PartnerInput {
  name: string;
  slug: string;
  websiteUrl: string;
  affiliateUrl: string;
  promoCode: string;
  promoTextEs: string;
  promoTextEn: string;
  taglineEs: string;
  taglineEn: string;
  descriptionEs: string;
  descriptionEn: string;
  imageAlt: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
}

export interface OfferInput {
  titleEs: string;
  titleEn: string;
  noteEs: string;
  noteEn: string;
  url: string;
  imageUrl: string;
  price: string;
  listPrice: string;
  currency: string;
  promoCode: string;
  isActive: boolean;
  sortOrder: string;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function requiredUrl(value: string, label: string): string {
  const trimmed = value.trim();
  if (!isSafeHttpUrl(trimmed)) throw new Error(`${label}: tiene que ser una URL que empiece con https://`);
  return trimmed;
}

function optionalUrl(value: string, label: string): string | null {
  const trimmed = nullable(value);
  return trimmed === null ? null : requiredUrl(trimmed, label);
}

function optionalPrice(value: string, label: string): number | null {
  const trimmed = nullable(value.replace(/,/g, ''));
  if (trimmed === null) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label}: no es un número válido.`);
  return Math.round(parsed * 100) / 100;
}

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `<input type="datetime-local">` llega sin zona ("2026-11-01T00:00"). Se
 * interpreta en hora de Honduras (UTC−6, sin horario de verano), que es la
 * que tiene en la cabeza quien carga la campaña.
 */
function optionalDate(value: string): string | null {
  const trimmed = nullable(value);
  if (trimmed === null) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const hasSeconds = /T\d{2}:\d{2}:\d{2}/.test(trimmed);
  const withZone = hasZone ? trimmed : `${trimmed}${hasSeconds ? '' : ':00'}-06:00`;
  const time = Date.parse(withZone);
  if (Number.isNaN(time)) throw new Error('Fecha inválida.');
  return new Date(time).toISOString();
}

function partnerRow(input: PartnerInput) {
  const name = input.name.trim();
  if (!name) throw new Error('El nombre es obligatorio.');
  const slug = slugify(input.slug.trim() || name);
  if (!isValidSlug(slug)) throw new Error('El slug solo puede tener minúsculas, números y guiones.');

  const startsAt = optionalDate(input.startsAt);
  const endsAt = optionalDate(input.endsAt);
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error('La campaña termina antes de empezar.');
  }

  return {
    name,
    slug,
    website_url: requiredUrl(input.websiteUrl, 'Sitio web'),
    affiliate_url: optionalUrl(input.affiliateUrl, 'Enlace de afiliado'),
    promo_code: nullable(input.promoCode),
    promo_text_es: nullable(input.promoTextEs),
    promo_text_en: nullable(input.promoTextEn),
    tagline_es: nullable(input.taglineEs),
    tagline_en: nullable(input.taglineEn),
    description_es: nullable(input.descriptionEs),
    description_en: nullable(input.descriptionEn),
    image_alt: nullable(input.imageAlt),
    is_active: input.isActive,
    is_featured: input.isFeatured,
    sort_order: integer(input.sortOrder),
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

function offerRow(input: OfferInput) {
  const title = input.titleEs.trim();
  if (!title) throw new Error('El nombre del producto es obligatorio.');
  const currency = normalizeCurrency(input.currency || 'USD');
  if (!currency) throw new Error('La moneda tiene que ser un código de tres letras (USD, HNL, EUR).');

  return {
    title_es: title,
    title_en: nullable(input.titleEn),
    note_es: nullable(input.noteEs),
    note_en: nullable(input.noteEn),
    url: requiredUrl(input.url, 'Enlace del producto'),
    image_url: optionalUrl(input.imageUrl, 'Imagen'),
    price: optionalPrice(input.price, 'Precio'),
    list_price: optionalPrice(input.listPrice, 'Precio anterior'),
    currency,
    promo_code: nullable(input.promoCode),
    is_active: input.isActive,
    sort_order: integer(input.sortOrder),
  };
}

/** Explica los errores de base que el panel puede provocar. */
function explain(error: unknown): string {
  if (pgErrorCode(error) === '23505') return 'Ya existe un aliado con ese slug.';
  if (isMissingTable(error)) return 'Faltan las tablas de afiliados: corré la migración 0047_affiliates.sql.';
  return pgErrorMessage(error);
}

/** Corre una escritura del panel y traduce el error de base a algo legible. */
async function explained<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(explain(error));
  }
}

async function readPartner(id: string): Promise<{ slug: string; logo_url: string | null }> {
  const [row] = await explained(() =>
    getDb().select({ slug: p.slug, logo_url: p.logo_url }).from(p).where(eq(p.id, id)),
  );
  if (!row) throw new Error('El aliado no existe.');
  return row;
}

export async function createPartner(input: PartnerInput): Promise<string> {
  const values = partnerRow(input);
  const [created] = await explained(() =>
    getDb().insert(p).values(values).returning({ id: p.id, slug: p.slug }),
  );
  revalidatePartners([created.slug]);
  return created.id;
}

export async function updatePartner(id: string, input: PartnerInput): Promise<void> {
  const before = await readPartner(id);
  const values = partnerRow(input);
  const [after] = await explained(() =>
    getDb().update(p).set(values).where(eq(p.id, id)).returning({ slug: p.slug }),
  );
  revalidatePartners([before.slug, after?.slug ?? before.slug]);
}

export async function deletePartner(id: string): Promise<void> {
  const row = await readPartner(id);
  await explained(() => getDb().delete(p).where(eq(p.id, id)));

  await deleteByPublicUrl(row.logo_url);
  revalidatePartners([row.slug]);
}

export async function saveOffer(partnerId: string, offerId: string | null, input: OfferInput): Promise<void> {
  const row = offerRow(input);
  await explained(() =>
    offerId
      ? getDb().update(o).set(row).where(and(eq(o.id, offerId), eq(o.partner_id, partnerId)))
      : getDb().insert(o).values({ ...row, partner_id: partnerId }),
  );
  await revalidatePartnerById(partnerId);
}

export async function deleteOffer(partnerId: string, offerId: string): Promise<void> {
  await explained(() => getDb().delete(o).where(and(eq(o.id, offerId), eq(o.partner_id, partnerId))));
  await revalidatePartnerById(partnerId);
}

/**
 * Sube el logo al bucket y guarda su URL. Mismo esquema de nombre que las
 * tiendas (`<slug>-<marca de tiempo>`): reemplazar el logo cambia la URL y
 * ninguna caché sigue mostrando el anterior.
 */
export async function uploadPartnerLogo(id: string, file: File): Promise<string> {
  const partner = await readPartner(id);
  const url = await uploadImage(AFFILIATE_IMAGES_BUCKET, partner.slug, file);

  await explained(() => getDb().update(p).set({ logo_url: url }).where(eq(p.id, id)));

  await deleteByPublicUrl(partner.logo_url);
  revalidatePartners([partner.slug]);
  return url;
}

export async function removePartnerLogo(id: string): Promise<void> {
  const partner = await readPartner(id);

  await explained(() => getDb().update(p).set({ logo_url: null }).where(eq(p.id, id)));

  await deleteByPublicUrl(partner.logo_url);
  revalidatePartners([partner.slug]);
}

async function revalidatePartnerById(partnerId: string): Promise<void> {
  try {
    const [row] = await getDb().select({ slug: p.slug }).from(p).where(eq(p.id, partnerId));
    revalidatePartners(row ? [row.slug] : []);
  } catch {
    revalidatePartners([]);
  }
}

/** Tira el índice de aliados en los dos idiomas y la página de cada slug tocado. */
function revalidatePartners(slugs: string[]): void {
  for (const path of Object.values(SITE_ROUTES.partners)) revalidatePath(path);
  for (const slug of new Set(slugs)) {
    for (const path of Object.values(partnerPaths(slug))) revalidatePath(path);
  }
}

// -----------------------------------------------------------------------------
// Solicitudes de afiliación (migración 0049)
// -----------------------------------------------------------------------------

export type ApplicationStatus = 'new' | 'contacted' | 'accepted' | 'rejected';

export const APPLICATION_STATUSES: ApplicationStatus[] = ['new', 'contacted', 'accepted', 'rejected'];

export interface AffiliateApplication extends ApplicationData {
  id: string;
  createdAt: string;
  status: ApplicationStatus;
  notes: string | null;
  locale: string | null;
}

/** Cuántas mandó el mismo visitante en la última hora: el freno anti-ráfaga. */
export async function countRecentApplications(visitorHash: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const [row] = await getDb()
      .select({ n: count() })
      .from(affiliateApplications)
      .where(and(eq(affiliateApplications.visitor_hash, visitorHash), gte(affiliateApplications.created_at, since)));
    return row?.n ?? 0;
  } catch (error) {
    throw new Error(explainApplications(error));
  }
}

export async function createApplication(data: ApplicationData, locale: string, visitorHash: string | null): Promise<void> {
  try {
    await getDb().insert(affiliateApplications).values({
      store_name: data.storeName,
      website: data.website,
      contact_name: data.contactName,
      email: data.email,
      phone: data.phone,
      category: data.category,
      message: data.message,
      locale,
      visitor_hash: visitorHash,
    });
  } catch (error) {
    throw new Error(explainApplications(error));
  }
}

export async function listApplications(): Promise<AffiliateApplication[]> {
  let data: Array<typeof affiliateApplications.$inferSelect>;
  try {
    data = await getDb()
      .select()
      .from(affiliateApplications)
      .orderBy(desc(affiliateApplications.created_at))
      .limit(200);
  } catch (error) {
    throw new Error(explainApplications(error));
  }
  return data.map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    storeName: String(row.store_name),
    website: (row.website as string | null) ?? null,
    contactName: String(row.contact_name),
    email: String(row.email),
    phone: (row.phone as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    message: (row.message as string | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    status: row.status as ApplicationStatus,
    notes: (row.notes as string | null) ?? null,
  }));
}

/** Solicitudes sin atender, para el aviso del panel. 0 si falta la migración. */
export async function countNewApplications(): Promise<number> {
  try {
    const [row] = await getDb()
      .select({ n: count() })
      .from(affiliateApplications)
      .where(eq(affiliateApplications.status, 'new'));
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function updateApplication(id: string, status: ApplicationStatus, notes: string): Promise<void> {
  if (!APPLICATION_STATUSES.includes(status)) throw new Error('Estado inválido.');
  try {
    await getDb()
      .update(affiliateApplications)
      .set({ status, notes: nullable(notes) })
      .where(eq(affiliateApplications.id, id));
  } catch (error) {
    throw new Error(explainApplications(error));
  }
}

function explainApplications(error: unknown): string {
  if (isMissingTable(error)) return 'Falta la tabla de solicitudes: corré la migración 0049_affiliate_applications.sql.';
  return pgErrorMessage(error);
}
