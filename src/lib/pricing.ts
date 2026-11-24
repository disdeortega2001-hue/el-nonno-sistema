import { round2 } from "./format";

export type PriceKind = "detal" | "mayor";

export interface Presentation {
  name: string;
  qty: number;
  price_detal: number;
  price_mayor: number;
}

export interface ProductLike {
  id: string;
  code: string;
  name: string;
  unit: string;
  price_detal: number;
  price_mayor: number;
  stock: number;
  presentations: Presentation[];
}

/** One line of a sale document, stored in sales_docs.items. */
export interface DocItem {
  product_id: string;
  code: string;
  name: string;
  unit: string;
  /** Presentation name (e.g. "Caja") or null when sold by the base unit. */
  presentation: string | null;
  /** Base units per presentation (1 when sold by unit). */
  pres_qty: number;
  /** How many units / presentations the customer takes. */
  count: number;
  /** Total base units = count * pres_qty (what leaves the shelf). */
  qty: number;
  /** Price per selected unit or presentation. */
  price: number;
  line_total: number;
}

export function unitPrice(p: Pick<ProductLike, "price_detal" | "price_mayor">, kind: PriceKind): number {
  return Number(kind === "mayor" ? p.price_mayor : p.price_detal);
}

export function presentationPrice(pr: Presentation, kind: PriceKind): number {
  return Number(kind === "mayor" ? pr.price_mayor : pr.price_detal);
}

export function buildLine(
  product: ProductLike,
  kind: PriceKind,
  count: number,
  presentation: Presentation | null = null,
): DocItem {
  const pres_qty = presentation ? Number(presentation.qty) : 1;
  const price = presentation ? presentationPrice(presentation, kind) : unitPrice(product, kind);
  return {
    product_id: product.id,
    code: product.code,
    name: product.name,
    unit: product.unit,
    presentation: presentation ? presentation.name : null,
    pres_qty,
    count,
    qty: round3(count * pres_qty),
    price,
    line_total: round2(count * price),
  };
}

/** Re-price existing lines when the price list (detal/mayor) changes. */
export function repriceLines(lines: DocItem[], products: ProductLike[], kind: PriceKind): DocItem[] {
  return lines.map((l) => {
    const p = products.find((x) => x.id === l.product_id);
    if (!p) return l;
    const pres = l.presentation ? (p.presentations.find((x) => x.name === l.presentation) ?? null) : null;
    return buildLine(p, kind, l.count, pres);
  });
}

export function linesTotal(lines: DocItem[]): number {
  return round2(lines.reduce((s, l) => s + l.line_total, 0));
}

/** Merge a new line into the cart: same product + presentation adds up. */
export function addToCart(lines: DocItem[], line: DocItem, product: ProductLike, kind: PriceKind): DocItem[] {
  const idx = lines.findIndex((l) => l.product_id === line.product_id && l.presentation === line.presentation);
  if (idx === -1) return [...lines, line];
  const existing = lines[idx]!;
  const pres = line.presentation ? (product.presentations.find((x) => x.name === line.presentation) ?? null) : null;
  const merged = buildLine(product, kind, existing.count + line.count, pres);
  return lines.map((l, i) => (i === idx ? merged : l));
}

export function round3(n: number) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Base units a cart already takes from a product (all presentations). */
export function qtyInCart(lines: DocItem[], productId: string): number {
  return round3(lines.filter((l) => l.product_id === productId).reduce((s, l) => s + l.qty, 0));
}

/** "3 cajas + 10 und" style breakdown using the largest presentation. */
export function stockBreakdown(stock: number, unit: string, presentations: Presentation[]): string {
  const base = `${formatQty(stock)} ${unit}`;
  const big = [...presentations].sort((a, b) => b.qty - a.qty)[0];
  if (!big || big.qty <= 1 || stock < big.qty) return base;
  const packs = Math.floor(stock / big.qty);
  const rest = round3(stock - packs * big.qty);
  const name = packs === 1 ? big.name.toLowerCase() : pluralEs(big.name.toLowerCase());
  return rest > 0 ? `${packs} ${name} + ${formatQty(rest)} ${unit}` : `${packs} ${name}`;
}

function pluralEs(w: string) {
  if (/[aeiou]$/.test(w)) return w + "s";
  return w + "es";
}

function formatQty(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n);
}

export interface DocLike {
  id: string;
  kind: string;
  status: string;
  client_id: string | null;
  items: DocItem[];
  total_usd: number;
  paid_usd: number;
}

/** Units held by open orders (pedidos por facturar), per product id. */
export function reservedByProduct(docs: DocLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of docs) {
    if (d.kind !== "pedido" || d.status !== "por_facturar") continue;
    for (const it of d.items) m.set(it.product_id, round3((m.get(it.product_id) ?? 0) + Number(it.qty)));
  }
  return m;
}

export function balance(d: Pick<DocLike, "total_usd" | "paid_usd">): number {
  return round2(Number(d.total_usd) - Number(d.paid_usd));
}

/** What a client still owes across pending invoices. */
export function clientDebt(docs: DocLike[], clientId: string): number {
  return round2(
    docs
      .filter((d) => d.kind === "factura" && d.status === "pendiente" && d.client_id === clientId)
      .reduce((s, d) => s + balance(d), 0),
  );
}

/** Remaining credit; a limit of 0 means no credit allowed. */
export function creditAvailable(limit: number, debt: number): number {
  return round2(Math.max(0, Number(limit) - debt));
}

export type PaymentMethod = "divisas" | "bolivares" | "pago_movil" | "punto";

export const PAYMENT_METHODS: { key: PaymentMethod; label: string; currency: "usd" | "bs" }[] = [
  { key: "divisas", label: "Divisas", currency: "usd" },
  { key: "bolivares", label: "Bolívares", currency: "bs" },
  { key: "pago_movil", label: "Pago móvil", currency: "bs" },
  { key: "punto", label: "Punto de venta", currency: "bs" },
];

export const methodLabel = (k: string) => PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k;
