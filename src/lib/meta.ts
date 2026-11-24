import type { Presentation } from "./pricing";

export interface ProductMeta {
  brand?: string;
  barcode?: string;
  location?: string;
  notes?: string;
}

export interface ClientMeta {
  contact?: string;
  phone2?: string;
  email?: string;
  zone?: string;
  notes?: string;
}

export interface SupplierMeta {
  contact?: string;
  phone2?: string;
  email?: string;
  terms?: string;
  notes?: string;
}

interface RawMetaEntry {
  __meta: true;
  brand?: string;
  barcode?: string;
  location?: string;
  notes?: string;
}

function isMetaEntry(x: unknown): x is RawMetaEntry {
  return typeof x === "object" && x !== null && (x as Record<string, unknown>)["__meta"] === true;
}

/** Splits stored JSONB presentations into pure Presentation[] and optional ProductMeta. */
export function unpackProductPresentations(raw: unknown): { presentations: Presentation[]; meta: ProductMeta } {
  if (!Array.isArray(raw)) return { presentations: [], meta: {} };
  const presentations: Presentation[] = [];
  let meta: ProductMeta = {};
  for (const item of raw) {
    if (isMetaEntry(item)) {
      meta = {
        ...(item.brand ? { brand: item.brand } : {}),
        ...(item.barcode ? { barcode: item.barcode } : {}),
        ...(item.location ? { location: item.location } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
      };
    } else if (typeof item === "object" && item !== null && "name" in item && "qty" in item) {
      presentations.push(item as Presentation);
    }
  }
  return { presentations, meta };
}

/** Packs Presentation[] and optional ProductMeta back into the presentations JSONB column. */
export function packProductPresentations(presentations: Presentation[], meta: ProductMeta): unknown[] {
  const cleanMeta: RawMetaEntry = { __meta: true };
  let hasMeta = false;
  if (meta.brand?.trim()) {
    cleanMeta.brand = meta.brand.trim();
    hasMeta = true;
  }
  if (meta.barcode?.trim()) {
    cleanMeta.barcode = meta.barcode.trim();
    hasMeta = true;
  }
  if (meta.location?.trim()) {
    cleanMeta.location = meta.location.trim();
    hasMeta = true;
  }
  if (meta.notes?.trim()) {
    cleanMeta.notes = meta.notes.trim();
    hasMeta = true;
  }
  return hasMeta ? [...presentations, cleanMeta] : [...presentations];
}

const META_PREFIX = "[Datos:";
const META_REGEX = /\n?\[Datos:\s*([^\]]+)\]\s*$/;

/** Encodes address + labeled optional fields in a readable single text column. */
export function packAddressMeta(address: string, entries: [string, string | undefined][]): string {
  const base = address.trim();
  const parts = entries
    .map(([label, val]) => [label, (val ?? "").replace(/[|\]]/g, " ").trim()] as const)
    .filter(([, val]) => val.length > 0)
    .map(([label, val]) => `${label}: ${val}`);
  if (parts.length === 0) return base;
  const block = `${META_PREFIX} ${parts.join(" | ")}]`;
  return base ? `${base}\n${block}` : block;
}

/** Extracts plain address and labeled optional fields from an address column. */
export function unpackAddressMeta<T extends string>(
  raw: string | null | undefined,
  labelToKey: Record<string, T>,
): { address: string; meta: Partial<Record<T, string>> } {
  const text = raw ?? "";
  const match = text.match(META_REGEX);
  if (!match) return { address: text.trim(), meta: {} };
  const address = text.slice(0, match.index).trim();
  const meta: Partial<Record<T, string>> = {};
  for (const seg of match[1]!.split("|")) {
    const colon = seg.indexOf(":");
    if (colon === -1) continue;
    const label = seg.slice(0, colon).trim();
    const value = seg.slice(colon + 1).trim();
    const key = labelToKey[label];
    if (key && value) meta[key] = value;
  }
  return { address, meta };
}

export const CLIENT_META_LABELS: Record<string, keyof ClientMeta> = {
  Contacto: "contact",
  "Tel. Alt": "phone2",
  Correo: "email",
  Zona: "zone",
  Notas: "notes",
};

export const SUPPLIER_META_LABELS: Record<string, keyof SupplierMeta> = {
  Contacto: "contact",
  "Tel. Alt": "phone2",
  Correo: "email",
  Condiciones: "terms",
  Notas: "notes",
};

export function unpackClient(address: string | null | undefined) {
  return unpackAddressMeta<keyof ClientMeta>(address, CLIENT_META_LABELS);
}

export function packClient(address: string, meta: ClientMeta) {
  return packAddressMeta(address, [
    ["Contacto", meta.contact],
    ["Tel. Alt", meta.phone2],
    ["Correo", meta.email],
    ["Zona", meta.zone],
    ["Notas", meta.notes],
  ]);
}

export function unpackSupplier(address: string | null | undefined) {
  return unpackAddressMeta<keyof SupplierMeta>(address, SUPPLIER_META_LABELS);
}

export function packSupplier(address: string, meta: SupplierMeta) {
  return packAddressMeta(address, [
    ["Contacto", meta.contact],
    ["Tel. Alt", meta.phone2],
    ["Correo", meta.email],
    ["Condiciones", meta.terms],
    ["Notas", meta.notes],
  ]);
}
