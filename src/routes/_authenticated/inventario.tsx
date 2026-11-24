import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowDownUp, Boxes, CalendarClock, Download, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Segmented, StatCard } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { CategoryChips } from "@/components/app/ProductPicker";
import { CategoryImage } from "@/components/app/CategoryImage";
import { ConfirmButton } from "@/components/app/ConfirmButton";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import {
  api,
  categoriesQuery,
  movementsQuery,
  productsQuery,
  purchasesQuery,
  salesDocsQuery,
  settingsQuery,
  useDbMutation,
  type Product,
} from "@/lib/db";
import { fmtDate, fmtDateTime, fmtNum, fmtQty, fmtUsd, localDay, parseAmount, round2 } from "@/lib/format";
import { reservedByProduct, round3, stockBreakdown } from "@/lib/pricing";
import { downloadCsv } from "@/lib/print";

export const Route = createFileRoute("/_authenticated/inventario")({
  head: () => pageHead("Inventario", "Gestión CRUD de productos, carga manual rápida, ajustes, mermas y vencimientos."),
  loader: ({ context }) =>
    ensureAll(context.queryClient, [settingsQuery, productsQuery, categoriesQuery, movementsQuery, purchasesQuery, salesDocsQuery]),
  component: Inventario,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Tab = "existencias" | "carga" | "movimientos" | "vencimientos";

interface QuickDraft {
  stock?: string;
  min_stock?: string;
  cost?: string;
  price_detal?: string;
  price_mayor?: string;
}

function Inventario() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { data: movements } = useSuspenseQuery(movementsQuery);
  const { data: purchases } = useSuspenseQuery(purchasesQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const rate = Number(settings.rate);

  const [tab, setTab] = useState<Tab>("existencias");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adjKind, setAdjKind] = useState<"ajuste" | "merma">("ajuste");
  const [adjDir, setAdjDir] = useState<"add" | "sub">("add");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const [drafts, setDrafts] = useState<Record<string, QuickDraft>>({});

  const adjust = useDbMutation(api.adjustStock);
  const deleteProduct = useDbMutation((id: string) => api.remove("products", id));
  const saveBatch = useDbMutation(async (items: { product: Product; draft: QuickDraft }[]) => {
    for (const { product, draft } of items) {
      if (draft.stock !== undefined) {
        const nextStock = Math.max(0, round3(parseAmount(draft.stock)));
        const delta = round3(nextStock - Number(product.stock));
        if (Math.abs(delta) > 0.0001) {
          await api.adjustStock({
            productId: product.id,
            qty: delta,
            kind: "ajuste",
            reason: "Carga manual / conteo físico",
          });
        }
      }
      const patch: Record<string, unknown> = { id: product.id };
      let hasPriceChange = false;
      if (draft.min_stock !== undefined) {
        patch["min_stock"] = Math.max(0, round3(parseAmount(draft.min_stock)));
        hasPriceChange = true;
      }
      if (draft.cost !== undefined) {
        patch["cost"] = round2(parseAmount(draft.cost));
        hasPriceChange = true;
      }
      if (draft.price_detal !== undefined) {
        patch["price_detal"] = round2(parseAmount(draft.price_detal));
        hasPriceChange = true;
      }
      if (draft.price_mayor !== undefined) {
        patch["price_mayor"] = round2(parseAmount(draft.price_mayor));
        hasPriceChange = true;
      }
      if (hasPriceChange) {
        await api.upsert("products", patch);
      }
    }
  });

  const reserved = useMemo(() => reservedByProduct(docs), [docs]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);
  const totalCost = round2(activeProducts.reduce((s, p) => s + Number(p.stock) * Number(p.cost), 0));
  const totalRetail = round2(activeProducts.reduce((s, p) => s + Number(p.stock) * Number(p.price_detal), 0));
  const lowCount = activeProducts.filter((p) => Number(p.stock) - (reserved.get(p.id) ?? 0) <= Number(p.min_stock)).length;

  const today = localDay();
  const in30 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return localDay(d);
  }, []);

  const expiryLots = useMemo(() => {
    const lots: {
      purchaseId: string;
      number: string;
      supplier: string;
      productId: string;
      name: string;
      code: string;
      qtyUnits: number;
      expiry: string;
    }[] = [];
    for (const pu of purchases) {
      if (pu.status === "anulada") continue;
      for (const it of pu.items ?? []) {
        if (!it.expiry) continue;
        lots.push({
          purchaseId: pu.id,
          number: pu.number,
          supplier: pu.supplier_name,
          productId: it.product_id,
          name: it.name,
          code: it.code,
          qtyUnits: Number(it.packs) * Number(it.units_per_pack),
          expiry: it.expiry,
        });
      }
    }
    return lots.sort((a, b) => a.expiry.localeCompare(b.expiry));
  }, [purchases]);

  const soonExpiringCount = expiryLots.filter((l) => l.expiry <= in30).length;

  const filteredProducts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      const avail = Number(p.stock) - (reserved.get(p.id) ?? 0);
      return (
        (statusFilter === "all" || (statusFilter === "active" ? p.active : !p.active)) &&
        (cat === "all" || p.category_id === cat) &&
        (!onlyLow || avail <= Number(p.min_stock)) &&
        (!s ||
          p.name.toLowerCase().includes(s) ||
          p.code.toLowerCase().includes(s) ||
          (p.meta?.brand?.toLowerCase().includes(s) ?? false) ||
          (p.meta?.barcode?.toLowerCase().includes(s) ?? false))
      );
    });
  }, [products, statusFilter, cat, onlyLow, q, reserved]);

  const filteredMovements = useMemo(() => {
    const s = q.trim().toLowerCase();
    return movements.filter((m) => {
      const p = productById.get(m.product_id);
      return (
        !s ||
        (p && (p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s))) ||
        m.reason.toLowerCase().includes(s) ||
        m.ref.toLowerCase().includes(s)
      );
    });
  }, [movements, productById, q]);

  const dirtyItems = useMemo(() => {
    const list: { product: Product; draft: QuickDraft }[] = [];
    for (const [id, draft] of Object.entries(drafts)) {
      const product = productById.get(id);
      if (!product) continue;
      if (Object.values(draft).some((v) => v !== undefined)) {
        list.push({ product, draft });
      }
    }
    return list;
  }, [drafts, productById]);

  function setDraftField(productId: string, field: keyof QuickDraft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }));
  }

  async function applyBatchSave() {
    if (dirtyItems.length === 0) return;
    try {
      await saveBatch.mutateAsync(dirtyItems);
      setDrafts({});
      toast.success(`Inventario actualizado (${dirtyItems.length} ${dirtyItems.length === 1 ? "producto" : "productos"})`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function openAdjust(p: Product, kind: "ajuste" | "merma" = "ajuste") {
    setAdjusting(p);
    setAdjKind(kind);
    setAdjDir(kind === "merma" ? "sub" : "add");
    setAdjQty("");
    setAdjReason("");
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    const raw = Math.abs(parseAmount(adjQty));
    if (raw <= 0) {
      toast.error("Ingresa una cantidad mayor a cero.");
      return;
    }
    if (!adjReason.trim()) {
      toast.error("Indica el motivo del movimiento.");
      return;
    }
    const signedQty = adjKind === "merma" || adjDir === "sub" ? -raw : raw;
    try {
      await adjust.mutateAsync({
        productId: adjusting.id,
        qty: signedQty,
        kind: adjKind,
        reason: adjReason.trim(),
      });
      toast.success(adjKind === "merma" ? "Merma registrada" : "Stock ajustado");
      setAdjusting(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function exportCsv() {
    downloadCsv(`inventario-${today}.csv`, [
      ["Código", "Producto", "Marca", "Ubicación", "Categoría", "Unidad", "Físico", "Apartado", "Disponible", "Mínimo", "Costo $", "Detal $", "Mayor $", "Valor costo $", "Estado"],
      ...filteredProducts.map((p) => {
        const res = reserved.get(p.id) ?? 0;
        const avail = Number(p.stock) - res;
        return [
          p.code,
          p.name,
          p.meta?.brand ?? "",
          p.meta?.location ?? "",
          catById.get(p.category_id ?? "")?.name ?? "",
          p.unit,
          Number(p.stock),
          res,
          avail,
          Number(p.min_stock),
          Number(p.cost),
          Number(p.price_detal),
          Number(p.price_mayor),
          round2(Number(p.stock) * Number(p.cost)),
          p.active ? "Activo" : "Inactivo",
        ];
      }),
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        subtitle="Carga manual, gestión CRUD de productos, conteo físico, ajustes, mermas y vencimientos."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="accent" onClick={() => setEditingProduct("new")}>
              <Plus className="h-4 w-4" /> Registrar producto
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="panel" label="Inventario a costo" value={fmtUsd(totalCost)} hint={`${activeProducts.length} productos activos`} />
        <StatCard label="Valor venta detal" value={fmtUsd(totalRetail)} hint="Potencial al detal" />
        <StatCard tone={lowCount > 0 ? "danger" : "default"} label="Bajo mínimo" value={String(lowCount)} hint="Productos por reponer" />
        <StatCard
          tone={soonExpiringCount > 0 ? "warning" : "default"}
          label="Vencen en 30 días"
          value={String(soonExpiringCount)}
          hint="Lotes con fecha próxima"
          icon={<CalendarClock className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "existencias", label: `Existencias (${products.length})` },
            { value: "carga", label: "Carga rápida" },
            { value: "movimientos", label: "Movimientos" },
            { value: "vencimientos", label: `Vencimientos (${expiryLots.length})` },
          ]}
        />
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, marca o código de barras…" className="pl-9" />
        </div>
        {(tab === "existencias" || tab === "carga") && (
          <>
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "active", label: "Activos" },
                { value: "inactive", label: "Inactivos" },
                { value: "all", label: "Todos" },
              ]}
            />
            <div className="flex items-center gap-2">
              <Switch id="onlyLow" checked={onlyLow} onCheckedChange={setOnlyLow} />
              <Label htmlFor="onlyLow" className="text-sm">Solo bajo mínimo</Label>
            </div>
          </>
        )}
      </div>

      {tab === "existencias" && (
        <>
          <CategoryChips categories={categories} value={cat} onChange={setCat} />
          {filteredProducts.length === 0 ? (
            <EmptyState icon={<Boxes className="h-8 w-8" />} title="No hay productos que coincidan">
              Prueba otro filtro o registra un nuevo producto.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-4 py-2.5 text-right">Costo / Detal</th>
                    <th className="px-4 py-2.5 text-right">Físico</th>
                    <th className="px-4 py-2.5 text-right">Apartado</th>
                    <th className="px-4 py-2.5 text-right">Disponible</th>
                    <th className="px-4 py-2.5 text-right">Mín.</th>
                    <th className="px-4 py-2.5 text-right">Valor costo</th>
                    <th className="px-4 py-2.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const c = catById.get(p.category_id ?? "");
                    const res = reserved.get(p.id) ?? 0;
                    const avail = Number(p.stock) - res;
                    const low = avail <= Number(p.min_stock);
                    return (
                      <tr key={p.id} className="border-t hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <CategoryImage category={c} className="h-9 w-9 shrink-0 rounded-md" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{p.name}</span>
                                {p.meta?.brand && <Badge variant="muted">{p.meta.brand}</Badge>}
                                {!p.active && <Badge variant="muted">Inactivo</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {p.code} · {c?.name ?? "Sin categoría"}
                                {p.meta?.location ? ` · ${p.meta.location}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">
                          <p className="text-xs text-muted-foreground">{fmtUsd(p.cost)}</p>
                          <p className="font-semibold">{fmtUsd(p.price_detal)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">{stockBreakdown(Number(p.stock), p.unit, p.presentations)}</td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{res > 0 ? `${fmtQty(res)} ${p.unit}` : "—"}</td>
                        <td className={`px-4 py-2.5 text-right font-bold tabular ${low ? "text-destructive" : "text-success"}`}>
                          {fmtQty(avail)} {p.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{fmtQty(p.min_stock)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{fmtUsd(Number(p.stock) * Number(p.cost))}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => openAdjust(p, "ajuste")} title="Ajustar stock o merma">
                              <ArrowDownUp className="h-3.5 w-3.5" /> Ajustar
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setEditingProduct(p)} aria-label="Editar producto" title="Editar producto">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <ConfirmButton
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              title={`¿Eliminar ${p.name}?`}
                              description="Si el producto ya tiene ventas o compras registradas, desactívalo en lugar de eliminarlo."
                              confirmLabel="Eliminar"
                              onConfirm={async () => {
                                try {
                                  await deleteProduct.mutateAsync(p.id);
                                  toast.success("Producto eliminado");
                                } catch (err) {
                                  toast.error("No se puede eliminar porque tiene historial. Edítalo y desactívalo en su lugar.");
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
        </>
      )}

      {tab === "carga" && (
        <div className="space-y-4">
          <CategoryChips categories={categories} value={cat} onChange={setCat} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Edita directamente las cantidades y precios de varios productos a la vez para cargar tu inventario manual más rápido.
            </p>
            <div className="flex items-center gap-2">
              {dirtyItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setDrafts({})}>
                  Descartar
                </Button>
              )}
              <Button variant="accent" size="sm" disabled={dirtyItems.length === 0 || saveBatch.isPending} onClick={applyBatchSave}>
                <Save className="h-4 w-4" />
                {saveBatch.isPending ? "Guardando…" : `Guardar cambios (${dirtyItems.length})`}
              </Button>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState icon={<Boxes className="h-8 w-8" />} title="No hay productos para editar">
              Registra un nuevo producto con el botón de arriba para comenzar a cargar tu inventario.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-3 py-2.5 text-right">Stock físico</th>
                    <th className="px-3 py-2.5 text-right">Mínimo</th>
                    <th className="px-3 py-2.5 text-right">Costo ($)</th>
                    <th className="px-3 py-2.5 text-right">Detal ($)</th>
                    <th className="px-3 py-2.5 text-right">Mayor ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const d = drafts[p.id] ?? {};
                    const modified = Object.values(d).some((v) => v !== undefined);
                    return (
                      <tr key={p.id} className={`border-t ${modified ? "bg-accent/10" : "hover:bg-muted/30"}`}>
                        <td className="px-4 py-2">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.code} · {p.unit}
                            {p.meta?.brand ? ` · ${p.meta.brand}` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            className="ml-auto h-8 w-24 text-right tabular"
                            value={d.stock ?? fmtQty(p.stock)}
                            onChange={(e) => setDraftField(p.id, "stock", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            className="ml-auto h-8 w-20 text-right tabular"
                            value={d.min_stock ?? fmtQty(p.min_stock)}
                            onChange={(e) => setDraftField(p.id, "min_stock", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            className="ml-auto h-8 w-24 text-right tabular"
                            value={d.cost ?? fmtNum(p.cost)}
                            onChange={(e) => setDraftField(p.id, "cost", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            className="ml-auto h-8 w-24 text-right tabular"
                            value={d.price_detal ?? fmtNum(p.price_detal)}
                            onChange={(e) => setDraftField(p.id, "price_detal", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            className="ml-auto h-8 w-24 text-right tabular"
                            value={d.price_mayor ?? fmtNum(p.price_mayor)}
                            onChange={(e) => setDraftField(p.id, "price_mayor", e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "movimientos" && (
        filteredMovements.length === 0 ? (
          <EmptyState icon={<ArrowDownUp className="h-8 w-8" />} title="Sin movimientos registrados" />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5 text-right">Cantidad</th>
                  <th className="px-4 py-2.5">Ref.</th>
                  <th className="px-4 py-2.5">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => {
                  const p = productById.get(m.product_id);
                  const pos = Number(m.qty) >= 0;
                  return (
                    <tr key={m.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular">{fmtDateTime(m.created_at)}</td>
                      <td className="px-4 py-2.5 font-semibold">{p?.name ?? "Producto"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={m.kind === "merma" ? "danger" : m.kind === "compra" ? "success" : "info"} className="capitalize">
                          {m.kind}
                        </Badge>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular ${pos ? "text-success" : "text-destructive"}`}>
                        {pos ? `+${fmtQty(m.qty)}` : fmtQty(m.qty)} {p?.unit ?? ""}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.ref || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.reason || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "vencimientos" && (
        expiryLots.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="Sin fechas de vencimiento registradas">
            Cuando registres compras con fecha de vencimiento, aparecerán aquí ordenadas por urgencia.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Vence</th>
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5">Compra / Proveedor</th>
                  <th className="px-4 py-2.5 text-right">Cantidad lote</th>
                  <th className="px-4 py-2.5 text-right">Estado</th>
                  <th className="px-4 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {expiryLots.map((l, idx) => {
                  const expired = l.expiry < today;
                  const soon = !expired && l.expiry <= in30;
                  const p = productById.get(l.productId);
                  return (
                    <tr key={`${l.purchaseId}-${l.productId}-${idx}`} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-semibold tabular">{fmtDate(l.expiry + "T12:00:00")}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.code}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{l.number} · {l.supplier}</td>
                      <td className="px-4 py-2.5 text-right tabular">{fmtQty(l.qtyUnits)} {p?.unit ?? ""}</td>
                      <td className="px-4 py-2.5 text-right">
                        {expired ? (
                          <Badge variant="danger"><AlertTriangle className="mr-1 h-3 w-3" /> Vencido</Badge>
                        ) : soon ? (
                          <Badge variant="warning">Por vencer</Badge>
                        ) : (
                          <Badge variant="success">Vigente</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => openAdjust(p, "merma")}>
                            Dar de baja
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <ProductFormDialog editing={editingProduct} onClose={() => setEditingProduct(null)} categories={categories} rate={rate} />

      <Dialog open={!!adjusting} onOpenChange={(v) => !v && setAdjusting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="page-title text-3xl">
              {adjKind === "merma" ? "Registrar merma" : "Ajustar inventario"}
            </DialogTitle>
          </DialogHeader>
          {adjusting && (
            <form onSubmit={submitAdjust} className="space-y-4">
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <p className="font-semibold">{adjusting.name}</p>
                <p className="text-xs text-muted-foreground">
                  Stock actual: <b className="tabular">{fmtQty(adjusting.stock)} {adjusting.unit}</b>
                </p>
              </div>

              <Segmented<"ajuste" | "merma">
                value={adjKind}
                onChange={(v) => {
                  setAdjKind(v);
                  if (v === "merma") setAdjDir("sub");
                }}
                options={[
                  { value: "ajuste", label: "Ajuste / conteo" },
                  { value: "merma", label: "Merma / pérdida" },
                ]}
              />

              {adjKind === "ajuste" && (
                <Segmented<"add" | "sub">
                  value={adjDir}
                  onChange={setAdjDir}
                  options={[
                    { value: "add", label: "Sumar (+)" },
                    { value: "sub", label: "Restar (-)" },
                  ]}
                />
              )}

              <div className="space-y-1">
                <Label htmlFor="adjQty">Cantidad ({adjusting.unit})</Label>
                <Input id="adjQty" required inputMode="decimal" placeholder="0" className="tabular" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="adjReason">Motivo</Label>
                <Textarea
                  id="adjReason"
                  required
                  rows={2}
                  placeholder={adjKind === "merma" ? "Ej. Producto vencido, empaque roto…" : "Ej. Conteo físico del almacén"}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAdjusting(null)}>Cancelar</Button>
                <Button type="submit" variant={adjKind === "merma" ? "destructive" : "accent"} disabled={adjust.isPending}>
                  {adjust.isPending ? "Guardando…" : adjKind === "merma" ? "Registrar merma" : "Aplicar ajuste"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
