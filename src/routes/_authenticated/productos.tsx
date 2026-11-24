import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Segmented, StatCard } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { CategoryChips } from "@/components/app/ProductPicker";
import { CategoryImage } from "@/components/app/CategoryImage";
import { ConfirmButton } from "@/components/app/ConfirmButton";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import {
  api,
  categoriesQuery,
  productsQuery,
  salesDocsQuery,
  settingsQuery,
  useDbMutation,
  type Product,
} from "@/lib/db";
import { fmtBs, fmtQty, fmtUsd, usdToBs } from "@/lib/format";
import { reservedByProduct, stockBreakdown } from "@/lib/pricing";
import { downloadCsv } from "@/lib/print";

export const Route = createFileRoute("/_authenticated/productos")({
  head: () => pageHead("Productos", "Catálogo con precios al detal y al mayor, costos y presentaciones."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, productsQuery, categoriesQuery, salesDocsQuery]),
  component: Productos,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function Productos() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const rate = Number(settings.rate);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const deleteProduct = useDbMutation((id: string) => api.remove("products", id));

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const reserved = useMemo(() => reservedByProduct(docs), [docs]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (statusFilter === "all" || (statusFilter === "active" ? p.active : !p.active)) &&
        (cat === "all" || p.category_id === cat) &&
        (!s ||
          p.name.toLowerCase().includes(s) ||
          p.code.toLowerCase().includes(s) ||
          (p.meta?.brand?.toLowerCase().includes(s) ?? false) ||
          (p.meta?.barcode?.toLowerCase().includes(s) ?? false)),
    );
  }, [products, q, cat, statusFilter]);

  const lowCount = products.filter((p) => p.active && Number(p.stock) - (reserved.get(p.id) ?? 0) <= Number(p.min_stock)).length;

  function exportCsv() {
    downloadCsv("productos-el-nonno.csv", [
      ["Código", "Nombre", "Marca", "Código barras", "Ubicación", "Categoría", "Unidad", "Costo $", "Detal $", "Mayor $", "Stock", "Mínimo", "Activo"],
      ...list.map((p) => [
        p.code,
        p.name,
        p.meta?.brand ?? "",
        p.meta?.barcode ?? "",
        p.meta?.location ?? "",
        catById.get(p.category_id ?? "")?.name ?? "",
        p.unit,
        Number(p.cost),
        Number(p.price_detal),
        Number(p.price_mayor),
        Number(p.stock),
        Number(p.min_stock),
        p.active ? "Sí" : "No",
      ]),
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Productos"
        subtitle="Catálogo de mercancía, presentaciones por caja/bulto y precios en dólares."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="accent" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="panel" label="Productos activos" value={String(products.filter((p) => p.active).length)} hint={`de ${products.length} totales`} />
        <StatCard label="Categorías" value={String(categories.length)} />
        <StatCard tone={lowCount > 0 ? "danger" : "default"} label="Por reponer" value={String(lowCount)} hint="Stock igual o debajo del mínimo" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, marca o código de barras…" className="pl-9" />
        </div>
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "active", label: "Activos" },
            { value: "inactive", label: "Inactivos" },
            { value: "all", label: "Todos" },
          ]}
        />
      </div>

      <CategoryChips categories={categories} value={cat} onChange={setCat} />

      {list.length === 0 ? (
        <EmptyState icon={<Package className="h-8 w-8" />} title="No hay productos aquí">
          Prueba otro filtro o crea el primer producto.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Producto</th>
                <th className="px-4 py-2.5">Categoría</th>
                <th className="px-4 py-2.5 text-right">Costo</th>
                <th className="px-4 py-2.5 text-right">Detal</th>
                <th className="px-4 py-2.5 text-right">Mayor</th>
                <th className="px-4 py-2.5 text-right">Existencia</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const c = catById.get(p.category_id ?? "");
                const avail = Number(p.stock) - (reserved.get(p.id) ?? 0);
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
                            {p.code} · {p.unit}
                            {p.meta?.location && ` · ${p.meta.location}`}
                            {p.presentations.length > 0 && ` · ${p.presentations.map((pr) => `${pr.name} x${fmtQty(pr.qty)}`).join(", ")}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{fmtUsd(p.cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      <p className="font-semibold">{fmtUsd(p.price_detal)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtBs(usdToBs(Number(p.price_detal), rate))}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      <p className="font-semibold">{fmtUsd(p.price_mayor)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtBs(usdToBs(Number(p.price_mayor), rate))}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      <p className={low ? "font-bold text-destructive" : "font-semibold"}>{stockBreakdown(Number(p.stock), p.unit, p.presentations)}</p>
                      {(reserved.get(p.id) ?? 0) > 0 && (
                        <p className="text-[11px] text-warning">{fmtQty(reserved.get(p.id))} apartado</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label="Editar">
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
                              toast.error("No se puede eliminar porque tiene historial. Desactívalo en su lugar.");
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

      <ProductFormDialog editing={editing} onClose={() => setEditing(null)} categories={categories} rate={rate} />
    </div>
  );
}
