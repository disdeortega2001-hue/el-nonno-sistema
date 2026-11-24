import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fmtBs, fmtNum, fmtUsd, parseAmount, round2, usdToBs } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/pricing";
import { emptyTender, summarizeTender, type TenderInput } from "@/lib/payments";
import type { PaymentInput } from "@/lib/db";
import { cn } from "@/lib/utils";

const ICONS: Record<PaymentMethod, typeof Wallet> = {
  divisas: Banknote,
  bolivares: Wallet,
  pago_movil: Smartphone,
  punto: CreditCard,
};

export interface PaymentResult {
  payments: PaymentInput[];
  paymentType: "contado" | "credito";
}

/**
 * Cobrar: split a total across Divisas / Bolívares / Pago móvil / Punto.
 * With `allowCredit`, the cashier can leave part (or all) owed.
 */
export function PaymentDialog({
  open,
  onOpenChange,
  totalUsd,
  rate,
  title = "Cobrar",
  description,
  allowCredit = false,
  creditOnly = false,
  confirmLabel = "Cobrar",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  totalUsd: number;
  rate: number;
  title?: string;
  description?: string;
  allowCredit?: boolean;
  /** For "abonos": partial payments are fine, no credit switch shown. */
  creditOnly?: boolean;
  confirmLabel?: string;
  onConfirm: (r: PaymentResult) => Promise<void>;
}) {
  const [raw, setRaw] = useState<Record<PaymentMethod, string>>({ divisas: "", bolivares: "", pago_movil: "", punto: "" });
  const [credit, setCredit] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRaw({ divisas: "", bolivares: "", pago_movil: "", punto: "" });
      setCredit(false);
    }
  }, [open]);

  const tender: TenderInput = useMemo(() => {
    const t = emptyTender();
    for (const m of PAYMENT_METHODS) t[m.key] = parseAmount(raw[m.key]);
    return t;
  }, [raw]);
  const sum = summarizeTender(tender, totalUsd, rate);
  const partialOk = credit || creditOnly;
  const canConfirm = partialOk ? sum.paidUsd > 0 || credit : sum.missingUsd <= 0.009;

  function fillRest(key: PaymentMethod, currency: "usd" | "bs") {
    const others = { ...tender, [key]: 0 };
    const rest = summarizeTender(others, totalUsd, rate).missingUsd;
    if (rest <= 0) return;
    setRaw((r) => ({ ...r, [key]: currency === "usd" ? fmtNum(rest) : fmtNum(usdToBs(rest, rate)) }));
  }

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm({
        payments: sum.payments.map((p) => ({ ...p })),
        paymentType: credit || (creditOnly && sum.missingUsd > 0) ? "credito" : "contado",
      });
      onOpenChange(false);
    } catch {
      // The caller already showed the error; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="page-title text-3xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="rounded-xl bg-gradient-panel p-4 text-panel-foreground">
          <p className="eyebrow text-panel-muted">Total a cobrar</p>
          <p className="font-display text-4xl font-extrabold text-accent tabular">{fmtUsd(totalUsd)}</p>
          <p className="text-sm text-panel-muted tabular">{fmtBs(usdToBs(totalUsd, rate))}</p>
        </div>

        <div className="space-y-2">
          {PAYMENT_METHODS.map((m) => {
            const Icon = ICONS[m.key];
            const typed = tender[m.key];
            return (
              <div key={m.key} className="flex items-center gap-3 rounded-lg border p-2.5">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="w-28 shrink-0">
                  <p className="text-sm font-semibold">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">en {m.currency === "usd" ? "$" : "Bs"}</p>
                </div>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  className="tabular text-right"
                  value={raw[m.key]}
                  onChange={(e) => setRaw((r) => ({ ...r, [m.key]: e.target.value }))}
                />
                <Button type="button" variant="soft" size="sm" onClick={() => fillRest(m.key, m.currency)}>
                  Lo que falta
                </Button>
                {m.currency === "bs" && typed > 0 && (
                  <span className="hidden w-16 text-right text-xs text-muted-foreground sm:inline">
                    ≈ {fmtUsd(round2(typed / (rate || 1)))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted p-2">
            <p className="eyebrow text-muted-foreground">Pagado</p>
            <p className="font-bold tabular">{fmtUsd(sum.paidUsd)}</p>
          </div>
          <div className={cn("rounded-lg p-2", sum.missingUsd > 0 ? "bg-warning-soft" : "bg-muted")}>
            <p className="eyebrow text-muted-foreground">Falta</p>
            <p className={cn("font-bold tabular", sum.missingUsd > 0 && "text-warning")}>{fmtUsd(sum.missingUsd)}</p>
          </div>
          <div className={cn("rounded-lg p-2", sum.changeUsd > 0 ? "bg-success-soft" : "bg-muted")}>
            <p className="eyebrow text-muted-foreground">Vuelto</p>
            <p className={cn("font-bold tabular", sum.changeUsd > 0 && "text-success")}>{fmtUsd(sum.changeUsd)}</p>
            {sum.changeUsd > 0 && <p className="text-[11px] text-muted-foreground">{fmtBs(usdToBs(sum.changeUsd, rate))}</p>}
          </div>
        </div>

        {allowCredit && !creditOnly && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="credit" className="font-semibold">Dejar a crédito</Label>
              <p className="text-xs text-muted-foreground">Lo que falte queda en Por cobrar a nombre del cliente.</p>
            </div>
            <Switch id="credit" checked={credit} onCheckedChange={setCredit} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="success" size="lg" disabled={!canConfirm || busy} onClick={confirm}>
            {busy ? "Guardando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
