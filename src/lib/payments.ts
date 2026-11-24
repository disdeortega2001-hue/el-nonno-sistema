import { bsToUsd, round2, usdToBs } from "./format";
import { PAYMENT_METHODS, type PaymentMethod } from "./pricing";

/** Amounts typed by the cashier, each in its own currency ($ for divisas, Bs for the rest). */
export type TenderInput = Record<PaymentMethod, number>;

export interface TenderSummary {
  paidUsd: number;
  missingUsd: number;
  changeUsd: number;
  /** Payments to record: never more than the total; change comes out of cash first. */
  payments: { method: PaymentMethod; amount_usd: number; amount_bs: number }[];
}

export function summarizeTender(tender: TenderInput, totalUsd: number, rate: number): TenderSummary {
  const lines = PAYMENT_METHODS.map((m) => {
    const typed = Number(tender[m.key] || 0);
    const usd = m.currency === "usd" ? round2(typed) : bsToUsd(typed, rate);
    const bs = m.currency === "usd" ? 0 : round2(typed);
    return { method: m.key, amount_usd: usd, amount_bs: bs };
  });
  const paidUsd = round2(lines.reduce((s, l) => s + l.amount_usd, 0));
  const missingUsd = round2(Math.max(0, totalUsd - paidUsd));
  let changeUsd = round2(Math.max(0, paidUsd - totalUsd));

  // Give change from cash: divisas first, then bolívares.
  let excess = changeUsd;
  for (const key of ["divisas", "bolivares"] as PaymentMethod[]) {
    if (excess <= 0) break;
    const l = lines.find((x) => x.method === key)!;
    const take = Math.min(l.amount_usd, excess);
    l.amount_usd = round2(l.amount_usd - take);
    if (key === "bolivares") l.amount_bs = usdToBs(l.amount_usd, rate);
    excess = round2(excess - take);
  }
  // Electronic overpayment can't be returned as change.
  if (excess > 0) changeUsd = round2(changeUsd - excess);

  return {
    paidUsd,
    missingUsd,
    changeUsd,
    payments: lines.filter((l) => l.amount_usd > 0),
  };
}

export const emptyTender = (): TenderInput => ({ divisas: 0, bolivares: 0, pago_movil: 0, punto: 0 });

export interface OpenInvoice {
  id: string;
  balance: number;
}

/**
 * Spread a client's payment over their pending invoices, oldest first.
 * Each payment line may be split across invoices; Bs amounts are split in proportion.
 */
export function distributePayments(
  invoices: OpenInvoice[],
  payments: { method: string; amount_usd: number; amount_bs: number }[],
): { docId: string; method: string; amount_usd: number; amount_bs: number }[] {
  const owed = invoices.map((i) => ({ id: i.id, left: round2(i.balance) }));
  const out: { docId: string; method: string; amount_usd: number; amount_bs: number }[] = [];
  for (const p of payments) {
    let usdLeft = round2(p.amount_usd);
    let bsLeft = round2(p.amount_bs);
    for (const inv of owed) {
      if (usdLeft <= 0) break;
      if (inv.left <= 0) continue;
      const take = round2(Math.min(inv.left, usdLeft));
      const isLast = take >= usdLeft;
      const bs = p.amount_bs > 0 ? (isLast ? bsLeft : round2((p.amount_bs * take) / p.amount_usd)) : 0;
      out.push({ docId: inv.id, method: p.method, amount_usd: take, amount_bs: bs });
      inv.left = round2(inv.left - take);
      usdLeft = round2(usdLeft - take);
      bsLeft = round2(bsLeft - bs);
    }
  }
  return out;
}
