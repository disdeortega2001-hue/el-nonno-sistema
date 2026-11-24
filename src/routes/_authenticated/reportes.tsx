import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarChart3, Download, Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel, Segmented, StatCard } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import {
  categoriesQuery,
  paymentsQuery,
  productsQuery,
  purchasesQuery,
  salesDocsQuery,
  settingsQuery,
} from "@/lib/db";
import { fmtBs, fmtDate, fmtQty, fmtUsd, localDay, round2, usdToBs } from "@/lib/format";
import { methodLabel, PAYMENT_METHODS } from "@/lib/pricing";
import { downloadCsv, escapeHtml, printHtml } from "@/lib/print";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => pageHead("Reportes", "Ventas, lo más vendido, inventario y compras."),
  loader: ({ context }) =>
    ensureAll(context.queryClient, [settingsQuery, salesDocsQuery, productsQuery, purchasesQuery, paymentsQuery, categoriesQuery]),
  component: Reportes,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type RangePreset = "hoy" | "7d" | "mes" | "todo";
type Tab = "ventas" | "top" | "inventario" | "compras";

function Reportes() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: purchases } = useSuspenseQuery(purchasesQuery);
  const { data: payments } = useSuspenseQuery(paymentsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const rate = Number(settings.rate);

  const today = localDay();
  const [preset, setPreset] = useState<RangePreset>("mes");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<Tab>("ventas");

  function pickPreset(p: RangePreset) {
    setPreset(p);
    if (p === "hoy") {
      setFrom(today);
      setTo(today);
    } else if (p === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFrom(localDay(d));
      setTo(today);
    } else if (p === "mes") {
      setFrom(today.slice(0, 7) + "-01");
      setTo(today);
    } else {
      setFrom("2000-01-01");
      setTo(today);
    }
  }

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const invoices = useMemo(
    () =>
      docs.filter((d) => {
        if (d.kind !== "factura" || d.status === "anulada") return false;
        const day = localDay(d.created_at);
        return day >= from && day <= to;
      }),
    [docs, from, to],
  );
  const rangePayments = useMemo(
    () =>
      payments.filter((p) => {
        const day = localDay(p.created_at);
        return day >= from && day <= to;
      }),
    [payments, from, to],
  );
  const rangePurchases = useMemo(
    () =>
      purchases.filter((p) => {
        if (p.status === "anulada") return false;
        const day = localDay(p.created_at);
        return day >= from && day <= to;
      }),
    [purchases, from, to],
  );

  const salesUsd = round2(invoices.reduce((s, d) => s + Number(d.total_usd), 0));
  const collectedUsd = round2(rangePayments.reduce((s, p) => s + Number(p.amount_usd), 0));
  const purchasedUsd = round2(rangePurchases.reduce((s, p) => s + Number(p.total_usd), 0));

  const estimatedCost = useMemo(() => {
    let c = 0;
    for (const inv of invoices) {
      for (const it of inv.items) {
        const p = productById.get(it.product_id);
        if (p) c += Number(it.qty) * Number(p.cost);
      }
    }
    return round2(c);
  }, [invoices, productById]);
  const profitUsd = round2(salesUsd - estimatedCost);
  const marginPct = salesUsd > 0 ? round2((profitUsd / salesUsd) * 100) : 0;

  const dailySales = useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of invoices) {
      const d = localDay(inv.created_at);
      m.set(d, round2((m.get(d) ?? 0) + Number(inv.total_usd)));
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, total]) => ({ day: day.slice(5), total }));
  }, [invoices]);

  const methodTotals = useMemo(() => {
    return PAYMENT_METHODS.map((m) => {
      const list = rangePayments.filter((p) => p.method === m.key);
      return {
        label: m.label,
        count: list.length,
        usd: round2(list.reduce((s, p) => s + Number(p.amount_usd), 0)),
        bs: round2(list.reduce((s, p) => s + Number(p.amount_bs), 0)),
      };
    });
  }, [rangePayments]);

  const topProducts = useMemo(() => {
    const m = new Map<string, { name: string; code: string; unit: string; qty: number; revenue: number; cost: number }>();
    for (const inv of invoices) {
      for (const it of inv.items) {
        const p = productById.get(it.product_id);
        const cur = m.get(it.product_id) ?? {
          name: it.name,
          code: it.code,
          unit: it.unit,
          qty: 0,
          revenue: 0,
          cost: 0,
        };
        cur.qty += Number(it.qty);
        cur.revenue = round2(cur.revenue + Number(it.line_total));
        if (p) cur.cost = round2(cur.cost + Number(it.qty) * Number(p.cost));
        m.set(it.product_id, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [invoices, productById]);

  const inventoryByCat = useMemo(() => {
    const m = new Map<string, { name: string; count: number; cost: number; retail: number }>();
    for (const p of products.filter((x) => x.active)) {
      const catName = catById.get(p.category_id ?? "")?.name ?? "Sin categoría";
      const cur = m.get(catName) ?? { name: catName, count: 0, cost: 0, retail: 0 };
      cur.count += 1;
      cur.cost = round2(cur.cost + Number(p.stock) * Number(p.cost));
      cur.retail = round2(cur.retail + Number(p.stock) * Number(p.price_detal));
      m.set(catName, cur);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  }, [products, catById]);

  const purchasesBySupplier = useMemo(() => {
    const m = new Map<string, { name: string; count: number; total: number; paid: number }>();
    for (const pu of rangePurchases) {
      const cur = m.get(pu.supplier_name) ?? { name: pu.supplier_name, count: 0, total: 0, paid: 0 };
      cur.count += 1;
      cur.total = round2(cur.total + Number(pu.total_usd));
      cur.paid = round2(cur.paid + Number(pu.paid_usd));
      m.set(pu.supplier_name, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rangePurchases]);

  function exportCsv() {
    if (tab === "top") {
      downloadCsv(`mas-vendidos-${from}-a-${to}.csv`, [
        ["Código", "Producto", "Unidades", "Ingresos $", "Costo est. $", "Margen $"],
        ...topProducts.map((t) => [t.code, t.name, t.qty, t.revenue, t.cost, round2(t.revenue - t.cost)]),
      ]);
    } else if (tab === "inventario") {
      downloadCsv(`inventario-valorado-${today}.csv`, [
        ["Categoría", "Productos", "Valor costo $", "Valor venta detal $"],
        ...inventoryByCat.map((c) => [c.name, c.count, c.cost, c.retail]),
      ]);
    } else if (tab === "compras") {
      downloadCsv(`compras-${from}-a-${to}.csv`, [
        ["Número", "Fecha", "Proveedor", "Factura", "Estado", "Total $", "Pagado $"],
        ...rangePurchases.map((p) => [p.number, p.invoice_date, p.supplier_name, p.invoice_no, p.status, Number(p.total_usd), Number(p.paid_usd)]),
      ]);
    } else {
      downloadCsv(`ventas-${from}-a-${to}.csv`, [
        ["Número", "Fecha", "Cliente", "Pago", "Estado", "Total $", "Pagado $"],
        ...invoices.map((d) => [d.number, fmtDate(d.created_at), d.client_name, d.payment_type, d.status, Number(d.total_usd), Number(d.paid_usd)]),
      ]);
    }
  }

  function printSummary() {
    const logoUrl = new URL(logo, window.location.origin).href;
    const topRows = topProducts
      .slice(0, 15)
      .map((t) => `<tr><td>${escapeHtml(t.name)}</td><td class="r">${fmtQty(t.qty)} ${escapeHtml(t.unit)}</td><td class="r">${fmtUsd(t.revenue)}</td></tr>`)
      .join("");
    printHtml(
      `Reporte El Nonno (${from} a ${to})`,
      `<div class="head"><img src="${logoUrl}"><div><h1>${escapeHtml(settings.company_name)}</h1>
       <div class="muted">${escapeHtml(settings.rif)}</div></div>
       <div style="margin-left:auto;text-align:right"><h1>Reporte</h1><div>${from} al ${to}</div></div></div>
       <h2>Resumen general</h2>
       <table><tbody>
         <tr><td>Ventas facturadas (${invoices.length} facturas)</td><td class="r"><b>${fmtUsd(salesUsd)}</b></td></tr>
         <tr><td>Ganancia bruta estimada (${marginPct}%)</td><td class="r"><b>${fmtUsd(profitUsd)}</b></td></tr>
         <tr><td>Cobros recibidos</td><td class="r"><b>${fmtUsd(collectedUsd)}</b></td></tr>
         <tr><td>Compras registradas</td><td class="r"><b>${fmtUsd(purchasedUsd)}</b></td></tr>
       </tbody></table>
       <h2>Productos más vendidos</h2>
       <table><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Total</th></tr></thead><tbody>${topRows || '<tr><td colspan="3">Sin ventas en el período</td></tr>'}</tbody></table>`,
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle="Resumen de ventas, ganancia estimada, productos más vendidos, inventario y compras."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="accent" onClick={printSummary}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<RangePreset>
          value={preset}
          onChange={pickPreset}
          options={[
            { value: "hoy", label: "Hoy" },
            { value: "7d", label: "7 días" },
            { value: "mes", label: "Este mes" },
            { value: "todo", label: "Todo" },
          ]}
        />
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-36" />
          <span className="text-muted-foreground">a</span>
          <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-36" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="panel" label="Ventas facturadas" value={fmtUsd(salesUsd)} hint={`${invoices.length} facturas · ${fmtBs(usdToBs(salesUsd, rate))}`} />
        <StatCard tone="success" label="Ganancia bruta est." value={fmtUsd(profitUsd)} hint={`Margen ${marginPct}% · costo ${fmtUsd(estimatedCost)}`} />
        <StatCard label="Cobros recibidos" value={fmtUsd(collectedUsd)} hint={`${rangePayments.length} pagos en caja`} />
        <StatCard label="Compras" value={fmtUsd(purchasedUsd)} hint={`${rangePurchases.length} facturas de compra`} />
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "ventas", label: "Ventas y cobros" },
          { value: "top", label: "Más vendidos" },
          { value: "inventario", label: "Inventario" },
          { value: "compras", label: "Compras" },
        ]}
      />

      {tab === "ventas" && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Ventas por día ($)">
            {dailySales.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="Sin ventas en este período" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(val: number) => fmtUsd(val)} />
                    <Bar dataKey="total" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Cobros por método">
            <ul className="divide-y text-sm">
              {methodTotals.map((m) => (
                <li key={m.label} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.count} operaciones</p>
                  </div>
                  <div className="text-right tabular">
                    <p className="font-bold">{fmtUsd(m.usd)}</p>
                    {m.bs > 0 && <p className="text-xs text-muted-foreground">{fmtBs(m.bs)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === "top" && (
        <Panel title="Ranking de productos más vendidos" description="Ordenado por ingresos generados en facturas válidas">
          {topProducts.length === 0 ? (
            <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="No hay ventas en este rango" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3 text-right">Cantidad</th>
                    <th className="py-2 pr-3 text-right">Ingresos</th>
                    <th className="py-2 text-right">Ganancia est.</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, 30).map((t, idx) => (
                    <tr key={t.code + idx} className="border-t">
                      <td className="py-2.5 pr-3 font-bold text-muted-foreground">{idx + 1}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.code}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular">{fmtQty(t.qty)} {t.unit}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular">{fmtUsd(t.revenue)}</td>
                      <td className="py-2.5 text-right font-semibold text-success tabular">{fmtUsd(round2(t.revenue - t.cost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "inventario" && (
        <Panel title="Valoración de inventario por categoría">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Categoría</th>
                  <th className="py-2 pr-3 text-right">Productos</th>
                  <th className="py-2 pr-3 text-right">Valor a costo</th>
                  <th className="py-2 text-right">Valor venta detal</th>
                </tr>
              </thead>
              <tbody>
                {inventoryByCat.map((c) => (
                  <tr key={c.name} className="border-t">
                    <td className="py-2.5 pr-3 font-semibold">{c.name}</td>
                    <td className="py-2.5 pr-3 text-right tabular">{c.count}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular">{fmtUsd(c.cost)}</td>
                    <td className="py-2.5 text-right tabular text-muted-foreground">{fmtUsd(c.retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "compras" && (
        <Panel title="Compras por proveedor">
          {purchasesBySupplier.length === 0 ? (
            <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="Sin compras en este período" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3 text-right">Facturas</th>
                    <th className="py-2 pr-3 text-right">Total comprado</th>
                    <th className="py-2 text-right">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {purchasesBySupplier.map((s) => (
                    <tr key={s.name} className="border-t">
                      <td className="py-2.5 pr-3 font-semibold">{s.name}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{s.count}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular">{fmtUsd(s.total)}</td>
                      <td className="py-2.5 text-right tabular text-muted-foreground">{fmtUsd(s.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
