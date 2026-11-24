import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Building2, HandCoins, Pencil, Plus, Printer, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Segmented, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { ConfirmButton } from "@/components/app/ConfirmButton";
import { SupplierFormDialog } from "@/components/app/SupplierFormDialog";
import {
  api,
  purchasesQuery,
  settingsQuery,
  suppliersQuery,
  useDbMutation,
  type Purchase,
  type Supplier,
} from "@/lib/db";
import { fmtBs, fmtDate, fmtDateTime, fmtNum, fmtQty, fmtUsd, localDay, parseAmount, round2, usdToBs } from "@/lib/format";
import { unpackSupplier } from "@/lib/meta";
import { escapeHtml, printHtml } from "@/lib/print";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => pageHead("Compras", "Mercancía que llegó de los proveedores."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, purchasesQuery, suppliersQuery]),
  component: Compras,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function Compras() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: purchases } = useSuspenseQuery(purchasesQuery);
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const rate = Number(settings.rate);

  const [tab, setTab] = useState<"compras" | "proveedores">("compras");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "anulada">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingSup, setEditingSup] = useState<Supplier | "new" | null>(null);

  const [payingPurchase, setPayingPurchase] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const voidPurchase = useDbMutation(api.voidPurchase);
  const payPurchase = useDbMutation(api.payPurchase);
  const deleteSupplier = useDbMutation((id: string) => api.remove("suppliers", id));

  const month = localDay().slice(0, 7);
  const activePurchases = useMemo(() => purchases.filter((p) => p.status !== "anulada"), [purchases]);
  const monthTotal = round2(
    activePurchases.filter((p) => localDay(p.created_at).startsWith(month)).reduce((s, p) => s + Number(p.total_usd), 0),
  );
  const pendingPay = round2(
    activePurchases.reduce((s, p) => s + Math.max(0, Number(p.total_usd) - Number(p.paid_usd)), 0),
  );

  const filteredPurchases = useMemo(() => {
    const s = q.trim().toLowerCase();
    return purchases.filter(
      (p) =>
        (statusFilter === "all" || (statusFilter === "anulada" ? p.status === "anulada" : p.status !== "anulada")) &&
        (!s ||
          p.number.toLowerCase().includes(s) ||
          p.invoice_no.toLowerCase().includes(s) ||
          p.supplier_name.toLowerCase().includes(s)),
    );
  }, [purchases, q, statusFilter]);

  const filteredSuppliers = useMemo(() => {
    const s = q.trim().toLowerCase();
    return suppliers.filter(
      (x) =>
        !s ||
        x.name.toLowerCase().includes(s) ||
        x.rif.toLowerCase().includes(s) ||
        x.phone.toLowerCase().includes(s) ||
        x.address.toLowerCase().includes(s),
    );
  }, [suppliers, q]);

  const openPurchase = purchases.find((p) => p.id === openId) ?? null;
  const openPurchasePending = openPurchase ? round2(Math.max(0, Number(openPurchase.total_usd) - Number(openPurchase.paid_usd))) : 0;

  function openPayModal(p: Purchase) {
    const owed = round2(Math.max(0, Number(p.total_usd) - Number(p.paid_usd)));
    setPayingPurchase(p);
    setPayAmount(fmtNum(owed));
  }

  async function submitPurchasePayment(e: FormEvent) {
    e.preventDefault();
    if (!payingPurchase) return;
    const owed = round2(Math.max(0, Number(payingPurchase.total_usd) - Number(payingPurchase.paid_usd)));
    const abono = round2(parseAmount(payAmount));
    if (abono <= 0 || abono > owed + 0.01) {
      toast.error(`Ingresa un monto válido (máximo ${fmtUsd(owed)}).`);
      return;
    }
    const nextPaid = round2(Math.min(Number(payingPurchase.total_usd), Number(payingPurchase.paid_usd) + abono));
    const nextType = nextPaid >= Number(payingPurchase.total_usd) - 0.01 ? "contado" : "abono";
    try {
      await payPurchase.mutateAsync({ id: payingPurchase.id, paidUsd: nextPaid, paymentType: nextType });
      toast.success(nextType === "contado" ? "Compra pagada en su totalidad" : "Abono registrado");
      setPayingPurchase(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function printPurchase(p: Purchase) {
    const logoUrl = new URL(logo, window.location.origin).href;
    const rows = (p.items ?? [])
      .map(
        (it) =>
          `<tr><td>${escapeHtml(it.code)}</td><td>${escapeHtml(it.name)} (${escapeHtml(it.presentation)} x${fmtQty(it.units_per_pack)})</td><td class="r">${fmtQty(it.packs)}</td><td class="r">${fmtUsd(it.cost_per_pack)}</td><td class="r">${fmtUsd(Number(it.packs) * Number(it.cost_per_pack))}</td></tr>`,
      )
      .join("");
    printHtml(
      `Compra ${p.number}`,
      `<div class="head"><img src="${logoUrl}"><div><h1>${escapeHtml(settings.company_name)}</h1>
       <div class="muted">${escapeHtml(settings.rif)} · ${escapeHtml(settings.phone)}</div></div>
       <div style="margin-left:auto;text-align:right"><h1>Compra ${escapeHtml(p.number)}</h1><div>${fmtDate(p.created_at)}</div></div></div>
       <p><b>Proveedor:</b> ${escapeHtml(p.supplier_name)} · <b>Factura:</b> ${escapeHtml(p.invoice_no || "—")} · <b>Control:</b> ${escapeHtml(p.control_no || "—")}</p>
       <table><thead><tr><th>Código</th><th>Producto</th><th class="r">Cant.</th><th class="r">Costo</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
       <p class="r tot">Total ${fmtUsd(p.total_usd)}</p>
       <p class="r muted">Pagado ${fmtUsd(p.paid_usd)} · ${fmtBs(usdToBs(Number(p.total_usd), Number(p.rate)))}</p>
       ${p.note ? `<p><b>Nota:</b> ${escapeHtml(p.note)}</p>` : ""}`,
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras"
        subtitle="Facturas de proveedores, entrada de mercancía al inventario y directorio de proveedores."
        actions={
          tab === "compras" ? (
            <Button variant="accent" asChild>
              <Link to="/compras/nueva">
                <Plus className="h-4 w-4" /> Registrar compra
              </Link>
            </Button>
          ) : (
            <Button variant="accent" onClick={() => setEditingSup("new")}>
              <Plus className="h-4 w-4" /> Nuevo proveedor
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="panel" label="Compras del mes" value={fmtUsd(monthTotal)} hint={fmtBs(usdToBs(monthTotal, rate))} />
        <StatCard tone={pendingPay > 0 ? "warning" : "default"} label="Por pagar a proveedores" value={fmtUsd(pendingPay)} hint="Saldo pendiente de compras" />
        <StatCard label="Proveedores" value={String(suppliers.length)} hint={`${activePurchases.length} compras registradas`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<"compras" | "proveedores">
          value={tab}
          onChange={setTab}
          options={[
            { value: "compras", label: `Compras (${purchases.length})` },
            { value: "proveedores", label: `Proveedores (${suppliers.length})` },
          ]}
        />
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "compras" ? "Buscar por número, factura o proveedor…" : "Buscar proveedor por nombre, RIF, contacto o rubro…"}
            className="pl-9"
          />
        </div>
        {tab === "compras" && (
          <Segmented<"all" | "active" | "anulada">
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "active", label: "Activas" },
              { value: "anulada", label: "Anuladas" },
            ]}
          />
        )}
      </div>

      {tab === "compras" ? (
        filteredPurchases.length === 0 ? (
          <EmptyState icon={<Truck className="h-8 w-8" />} title="No hay compras aquí">
            Registra la primera compra para sumar mercancía al inventario.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Número</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Proveedor</th>
                  <th className="px-4 py-2.5">Factura</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Pagado / Debe</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((p) => {
                  const pending = round2(Math.max(0, Number(p.total_usd) - Number(p.paid_usd)));
                  return (
                    <tr key={p.id} onClick={() => setOpenId(p.id)} className="cursor-pointer border-t hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-semibold">{p.number}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(p.invoice_date + "T12:00:00")}</td>
                      <td className="px-4 py-2.5 font-medium">{p.supplier_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.invoice_no || "—"}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular">{fmtUsd(p.total_usd)}</td>
                      <td className="px-4 py-2.5 text-right tabular">
                        <span className="text-muted-foreground">{fmtUsd(p.paid_usd)}</span>
                        {p.status !== "anulada" && pending > 0.01 && (
                          <p className="text-[11px] font-semibold text-warning">Debe {fmtUsd(pending)}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : filteredSuppliers.length === 0 ? (
        <EmptyState icon={<Building2 className="h-8 w-8" />} title="Sin proveedores">
          Agrega proveedores para llevar el historial de tus compras.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Proveedor</th>
                <th className="px-4 py-2.5">RIF</th>
                <th className="px-4 py-2.5">Contacto</th>
                <th className="px-4 py-2.5">Dirección / Condiciones</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((s) => {
                const parsed = unpackSupplier(s.address);
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{s.name}</p>
                      {parsed.meta.notes && <p className="text-xs text-muted-foreground">{parsed.meta.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.rif || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <p>{s.phone || "—"}</p>
                      {(parsed.meta.contact || parsed.meta.email) && (
                        <p className="text-xs">{[parsed.meta.contact, parsed.meta.email].filter(Boolean).join(" · ")}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <p>{parsed.address || "—"}</p>
                      {parsed.meta.terms && <p className="text-xs">{parsed.meta.terms}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditingSup(s)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          title={`¿Eliminar a ${s.name}?`}
                          confirmLabel="Eliminar"
                          onConfirm={async () => {
                            try {
                              await deleteSupplier.mutateAsync(s.id);
                              toast.success("Proveedor eliminado");
                            } catch (err) {
                              toast.error("No se puede eliminar porque tiene compras registradas.");
                              throw err;
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!openPurchase} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {openPurchase && (
            <>
              <DialogHeader>
                <p className="eyebrow text-muted-foreground">Compra de mercancía</p>
                <DialogTitle className="page-title flex items-center gap-3 text-3xl">
                  {openPurchase.number} <StatusBadge status={openPurchase.status} />
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="eyebrow text-muted-foreground">Proveedor</p>
                  <p className="font-semibold">{openPurchase.supplier_name}</p>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Factura / Control</p>
                  <p className="font-semibold">{openPurchase.invoice_no || "—"} / {openPurchase.control_no || "—"}</p>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Fecha</p>
                  <p className="font-semibold">{fmtDateTime(openPurchase.created_at)}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-right">Costo</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openPurchase.items ?? []).map((it, i) => (
                      <tr key={it.product_id + i} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium">{it.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.presentation} x{fmtQty(it.units_per_pack)}
                            {it.expiry ? ` · Vence ${fmtDate(it.expiry + "T12:00:00")}` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right tabular">{fmtQty(it.packs)}</td>
                        <td className="px-3 py-2 text-right tabular">{fmtUsd(it.cost_per_pack)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular">{fmtUsd(Number(it.packs) * Number(it.cost_per_pack))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-gradient-panel p-4 text-panel-foreground">
                <div>
                  <p className="eyebrow text-panel-muted">Total compra</p>
                  <p className="font-display text-3xl font-extrabold text-accent tabular">{fmtUsd(openPurchase.total_usd)}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="capitalize">{openPurchase.payment_type}</p>
                  <p className="font-bold tabular text-accent">
                    Pagado {fmtUsd(openPurchase.paid_usd)}
                    {openPurchasePending > 0.01 && ` · Debe ${fmtUsd(openPurchasePending)}`}
                  </p>
                </div>
              </div>
              {openPurchase.note && <p className="text-sm"><b>Nota:</b> {openPurchase.note}</p>}
              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => printPurchase(openPurchase)}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                {openPurchase.status !== "anulada" && openPurchasePending > 0.01 && (
                  <Button variant="success" onClick={() => openPayModal(openPurchase)}>
                    <HandCoins className="h-4 w-4" /> Registrar pago / abono
                  </Button>
                )}
                {openPurchase.status !== "anulada" && (
                  <ConfirmButton
                    variant="ghost"
                    className="text-destructive"
                    title="¿Anular esta compra?"
                    description="Se descontará del inventario la mercancía que entró con esta factura."
                    confirmLabel="Sí, anular"
                    onConfirm={async () => {
                      try {
                        await voidPurchase.mutateAsync(openPurchase.id);
                        toast.success("Compra anulada");
                        setOpenId(null);
                      } catch (err) {
                        toast.error((err as Error).message);
                        throw err;
                      }
                    }}
                  >
                    Anular compra
                  </ConfirmButton>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!payingPurchase} onOpenChange={(v) => !v && setPayingPurchase(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="page-title text-2xl">Pago a proveedor</DialogTitle>
          </DialogHeader>
          {payingPurchase && (
            <form onSubmit={submitPurchasePayment} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {payingPurchase.number} · {payingPurchase.supplier_name} · Saldo pendiente:{" "}
                <b className="text-foreground tabular">{fmtUsd(Number(payingPurchase.total_usd) - Number(payingPurchase.paid_usd))}</b>
              </p>
              <div className="space-y-1">
                <Label htmlFor="paySupAmt">Monto a abonar ($)</Label>
                <Input id="paySupAmt" required inputMode="decimal" className="tabular" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setPayingPurchase(null)}>Cancelar</Button>
                <Button type="submit" variant="success" disabled={payPurchase.isPending}>
                  {payPurchase.isPending ? "Guardando…" : "Guardar pago"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <SupplierFormDialog editing={editingSup} onClose={() => setEditingSup(null)} />
    </div>
  );
}
