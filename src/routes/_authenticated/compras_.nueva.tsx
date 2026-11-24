import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, Segmented } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { SupplierFormDialog } from "@/components/app/SupplierFormDialog";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import {
  api,
  categoriesQuery,
  productsQuery,
  settingsQuery,
  suppliersQuery,
  useDbMutation,
  type Product,
  type PurchaseItem,
} from "@/lib/db";
import { fmtBs, fmtNum, fmtQty, fmtUsd, localDay, parseAmount, round2, usdToBs } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compras_/nueva")({
  head: () => pageHead("Registrar compra", "Factura del proveedor, productos que llegaron y cómo se pagó."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, suppliersQuery, productsQuery, categoriesQuery]),
  component: NuevaCompra,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

interface DraftLine extends PurchaseItem {
  packsStr: string;
  costStr: string;
}

function NuevaCompra() {
  const navigate = useNavigate();
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const rate = Number(settings.rate);

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [controlNo, setControlNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localDay());
  const [paymentType, setPaymentType] = useState<"contado" | "credito" | "abono">("contado");
  const [paidStr, setPaidStr] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [newSupOpen, setNewSupOpen] = useState(false);
  const [newProdOpen, setNewProdOpen] = useState(false);

  const register = useDbMutation(api.registerPurchase);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const matchingProducts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter(
        (p) =>
          p.active &&
          (!s ||
            p.name.toLowerCase().includes(s) ||
            p.code.toLowerCase().includes(s) ||
            (p.meta?.brand?.toLowerCase().includes(s) ?? false) ||
            (p.meta?.barcode?.toLowerCase().includes(s) ?? false)),
      )
      .slice(0, 12);
  }, [products, q]);

  function addProduct(p: Product) {
    setLines((prev) => [
      ...prev,
      {
        product_id: p.id,
        code: p.code,
        name: p.name,
        presentation: "Unidad",
        units_per_pack: 1,
        packs: 1,
        cost_per_pack: Number(p.cost),
        expiry: null,
        packsStr: "1",
        costStr: fmtNum(p.cost),
      },
    ]);
    setQ("");
  }

  function changePresentation(idx: number, presName: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const p = productById.get(l.product_id);
        if (presName === "Unidad" || !p) {
          const c = p ? Number(p.cost) : l.cost_per_pack;
          return { ...l, presentation: "Unidad", units_per_pack: 1, cost_per_pack: c, costStr: fmtNum(c) };
        }
        const pr = p.presentations.find((x) => x.name === presName);
        if (!pr) return l;
        const c = round2(Number(p.cost) * Number(pr.qty));
        return { ...l, presentation: pr.name, units_per_pack: Number(pr.qty), cost_per_pack: c, costStr: fmtNum(c) };
      }),
    );
  }

  const totalUsd = round2(
    lines.reduce((s, l) => s + parseAmount(l.packsStr) * parseAmount(l.costStr), 0),
  );

  async function submitPurchase(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Elige un proveedor.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto a la compra.");
      return;
    }
    const cleanItems: PurchaseItem[] = [];
    for (const l of lines) {
      const packs = parseAmount(l.packsStr);
      const costPerPack = round2(parseAmount(l.costStr));
      if (packs <= 0) {
        toast.error(`La cantidad de ${l.name} debe ser mayor a cero.`);
        return;
      }
      cleanItems.push({
        product_id: l.product_id,
        code: l.code,
        name: l.name,
        presentation: l.presentation,
        units_per_pack: l.units_per_pack,
        packs,
        cost_per_pack: costPerPack,
        expiry: l.expiry || null,
      });
    }

    const paidUsd =
      paymentType === "contado"
        ? totalUsd
        : paymentType === "credito"
          ? 0
          : Math.min(totalUsd, round2(parseAmount(paidStr)));

    try {
      await register.mutateAsync({
        supplierId,
        invoiceNo: invoiceNo.trim(),
        controlNo: controlNo.trim(),
        invoiceDate,
        items: cleanItems,
        paymentType,
        paidUsd,
        note: note.trim(),
        rate,
      });
      toast.success("Compra registrada y mercancía sumada al inventario");
      navigate({ to: "/compras" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/compras" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a compras
      </Link>
      <PageHeader title="Registrar compra" subtitle="Ingresa la factura del proveedor para actualizar el inventario y el costo." />

      <form onSubmit={submitPurchase} className="space-y-6">
        <Panel title="Datos de la factura">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Proveedor</Label>
                <button type="button" onClick={() => setNewSupOpen(true)} className="text-xs font-semibold text-info hover:underline">
                  + Nuevo proveedor
                </button>
              </div>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige el proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.rif ? `(${s.rif})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="invNo">Nº Factura</Label>
              <Input id="invNo" placeholder="000123" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ctrlNo">Nº Control</Label>
              <Input id="ctrlNo" placeholder="00-00123" value={controlNo} onChange={(e) => setControlNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invDate">Fecha de factura</Label>
              <Input id="invDate" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
          </div>
        </Panel>

        <Panel
          title="Mercancía recibida"
          description="Busca un producto para agregarlo o registra uno nuevo si no existe todavía."
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setNewProdOpen(true)}>
              <PackagePlus className="h-4 w-4" /> Nuevo producto
            </Button>
          }
        >
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por nombre, código, marca o código de barras…" className="pl-9" />
          </div>

          {q.trim() && (
            <div className="mb-4 grid gap-2 rounded-xl border bg-muted/40 p-2 sm:grid-cols-2 lg:grid-cols-3">
              {matchingProducts.length === 0 ? (
                <p className="col-span-full py-3 text-center text-sm text-muted-foreground">Sin resultados.</p>
              ) : (
                matchingProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left text-sm hover:border-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.code} · stock {fmtQty(p.stock)} {p.unit}</p>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-accent-foreground" />
                  </button>
                ))
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Escribe arriba el nombre de un producto para añadirlo.
            </p>
          ) : (
            <div className="space-y-3">
              {lines.map((l, idx) => {
                const p = productById.get(l.product_id);
                const packs = parseAmount(l.packsStr);
                const sub = round2(packs * parseAmount(l.costStr));
                const totalUnits = packs * l.units_per_pack;
                return (
                  <div key={idx} className="grid items-end gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[1.6fr_1.1fr_0.8fr_0.9fr_1fr_auto]">
                    <div>
                      <p className="text-sm font-semibold">{l.name}</p>
                      <p className="text-xs text-muted-foreground">Entran {fmtQty(totalUnits)} {p?.unit ?? "und"} · Subtotal <b className="tabular">{fmtUsd(sub)}</b></p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Presentación</Label>
                      <Select value={l.presentation} onValueChange={(v) => changePresentation(idx, v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Unidad">Unidad (x1)</SelectItem>
                          {(p?.presentations ?? []).map((pr) => (
                            <SelectItem key={pr.name} value={pr.name}>
                              {pr.name} (x{fmtQty(pr.qty)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cantidad</Label>
                      <Input
                        inputMode="decimal"
                        className="tabular"
                        value={l.packsStr}
                        onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, packsStr: e.target.value } : x)))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Costo ($)</Label>
                      <Input
                        inputMode="decimal"
                        className="tabular"
                        value={l.costStr}
                        onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, costStr: e.target.value } : x)))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vencimiento</Label>
                      <Input
                        type="date"
                        value={l.expiry ?? ""}
                        onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, expiry: e.target.value || null } : x)))}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Panel title="Pago y notas">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Condición de pago</Label>
                <Segmented<"contado" | "credito" | "abono">
                  value={paymentType}
                  onChange={setPaymentType}
                  options={[
                    { value: "contado", label: "Contado" },
                    { value: "credito", label: "Crédito" },
                    { value: "abono", label: "Abono" },
                  ]}
                />
              </div>
              {paymentType === "abono" && (
                <div className="space-y-1">
                  <Label htmlFor="paidUsd">Monto abonado ($)</Label>
                  <Input id="paidUsd" inputMode="decimal" placeholder="0,00" className="tabular" value={paidStr} onChange={(e) => setPaidStr(e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="pNote">Nota</Label>
                <Textarea id="pNote" rows={2} placeholder="Observaciones sobre la factura o entrega…" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </Panel>

          <div className="flex flex-col justify-between rounded-2xl bg-gradient-panel p-6 text-panel-foreground shadow-card">
            <div>
              <p className="eyebrow text-panel-muted">Total de la compra</p>
              <p className="mt-1 font-display text-5xl font-extrabold text-accent tabular">{fmtUsd(totalUsd)}</p>
              <p className="text-sm text-panel-muted tabular">{fmtBs(usdToBs(totalUsd, rate))}</p>
            </div>
            <Button type="submit" variant="accent" size="xl" className="mt-6 w-full" disabled={lines.length === 0 || register.isPending}>
              {register.isPending ? "Guardando compra…" : "Guardar compra y sumar stock"}
            </Button>
          </div>
        </div>
      </form>

      <SupplierFormDialog
        editing={newSupOpen ? "new" : null}
        onClose={() => setNewSupOpen(false)}
        onSaved={(s) => setSupplierId(s.id)}
      />
      <ProductFormDialog
        editing={newProdOpen ? "new" : null}
        onClose={() => setNewProdOpen(false)}
        categories={categories}
        rate={rate}
        onSaved={(p) => addProduct(p)}
      />
    </div>
  );
}
