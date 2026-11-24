// Venezuelan number format: dot for thousands, comma for decimals.
const nf = (min: number, max: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: min, maximumFractionDigits: max });

const usdFmt = nf(2, 2);
const bsFmt = nf(2, 2);
const rateFmt = nf(2, 4);
const qtyFmt = nf(0, 3);

export const fmtUsd = (n: number | null | undefined) => `$ ${usdFmt.format(Number(n ?? 0))}`;
export const fmtBs = (n: number | null | undefined) => `Bs ${bsFmt.format(Number(n ?? 0))}`;
export const fmtRate = (n: number | null | undefined) => `Bs ${rateFmt.format(Number(n ?? 0))}`;
export const fmtNum = (n: number | null | undefined, decimals = 2) =>
  nf(decimals, decimals).format(Number(n ?? 0));
export const fmtQty = (n: number | null | undefined) => qtyFmt.format(Number(n ?? 0));

/** Parse a user-typed amount accepting "1.234,56", "1234,56" or "1234.56". */
export function parseAmount(input: string): number {
  const s = input.trim().replace(/\s|\$|Bs/gi, "");
  if (!s) return 0;
  let normalized = s;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const usdToBs = (usd: number, rate: number) => round2(usd * rate);
export const bsToUsd = (bs: number, rate: number) => (rate > 0 ? round2(bs / rate) : 0);

const dateFmt = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const longDateFmt = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const fmtDate = (d: string | Date | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—");
export const fmtLongDate = (d: string | Date) => {
  const s = longDateFmt.format(new Date(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Local (Caracas) calendar day as YYYY-MM-DD. */
export function localDay(d: string | Date = new Date()): string {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** WhatsApp link from a Venezuelan phone like 0414-1234567. */
export function whatsappUrl(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "58" + digits.slice(1);
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}
