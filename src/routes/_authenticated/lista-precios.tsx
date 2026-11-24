import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, MessageCircle, Printer, Search, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, Panel, Segmented } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { CategoryChips } from "@/components/app/ProductPicker";
import { CategoryImage } from "@/components/app/CategoryImage";
import { categoriesQuery, productsQuery, settingsQuery, type Category, type Product } from "@/lib/db";
import { fmtBs, fmtDate, fmtQty, fmtRate, fmtUsd, usdToBs, whatsappUrl } from "@/lib/format";
import { presentationPrice, unitPrice, type PriceKind } from "@/lib/pricing";
import { escapeHtml, printHtml } from "@/lib/print";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/_authenticated/lista-precios")({
  head: () => pageHead("Lista de precios", "Lista para mandar por WhatsApp, copiar o imprimir en PDF."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, productsQuery, categoriesQuery]),
  component: ListaPrecios,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function ListaPrecios() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const rate = Number(settings.rate);

  const [kind, setKind] = useState<PriceKind>("mayor");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [onlyStock, setOnlyStock] = useState(true);
  const [showBs, setShowBs] = useState(true);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.active &&
        (!onlyStock || Number(p.stock) > 0) &&
        (cat === "all" || p.category_id === cat) &&
        (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)),
    );
  }, [products, onlyStock, cat, q]);

  const groups = useMemo(() => {
    const out: { category: Category | null; items: Product[] }[] = [];
    for (const c of categories) {
      const items = filtered.filter((p) => p.category_id === c.id);
      if (items.length > 0) out.push({ category: c, items });
    }
    const uncat = filtered.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id));
    if (uncat.length > 0) out.push({ category: null, items: uncat });
    return out;
  }, [categories, filtered]);

  const listText = useMemo(() => {
    const lines = [
      `*${settings.company_name}*`,
      `Lista de precios al *${kind === "mayor" ? "MAYOR" : "DETAL"}* · ${fmtDate(new Date())}`,
      `Tasa BCV: ${fmtRate(rate)}`,
      "",
    ];
    for (const g of groups) {
      lines.push(`*${(g.category?.name ?? "Otros").toUpperCase()}*`);
      for (const p of g.items) {
        const u = unitPrice(p, kind);
        const bs = showBs ? ` (${fmtBs(usdToBs(u, rate))})` : "";
        lines.push(`• ${p.name} (${p.unit}): *${fmtUsd(u)}*${bs}`);
        for (const pr of p.presentations) {
          const pu = presentationPrice(pr, kind);
          const pbs = showBs ? ` (${fmtBs(usdToBs(pu, rate))})` : "";
          lines.push(`   ↳ ${pr.name} x${fmtQty(pr.qty)}: *${fmtUsd(pu)}*${pbs}`);
        }
      }
      lines.push("");
    }
    if (settings.price_list_note) lines.push(settings.price_list_note);
    return lines.join("\n").trim();
  }, [groups, settings, kind, rate, showBs]);

  async function copyList() {
    try {
      await navigator.clipboard.writeText(listText);
      toast.success("Lista copiada al portapapeles");
    } catch {
      toast.error("No se pudo copiar automáticamente.");
    }
  }

  function printList() {
    const logoUrl = new URL(logo, window.location.origin).href;
    const sections = groups
      .map((g) => {
        const rows = g.items
          .map((p) => {
            const u = unitPrice(p, kind);
            const pres = p.presentations
              .map((pr) => `${escapeHtml(pr.name)} x${fmtQty(pr.qty)}: <b>${fmtUsd(presentationPrice(pr, kind))}</b>`)
              .join(" · ");
            return `<tr>
              <td>${escapeHtml(p.code)}</td>
              <td><b>${escapeHtml(p.name)}</b>${pres ? `<div class="muted">${pres}</div>` : ""}</td>
              <td>${escapeHtml(p.unit)}</td>
              <td class="r"><b>${fmtUsd(u)}</b></td>
              ${showBs ? `<td class="r">${fmtBs(usdToBs(u, rate))}</td>` : ""}
            </tr>`;
          })
          .join("");
        return `<h2>${escapeHtml(g.category?.name ?? "Otros")}</h2>
          <table><thead><tr><th>Código</th><th>Producto</th><th>Und</th><th class="r">USD</th>${showBs ? '<th class="r">Bs</th>' : ""}</tr></thead><tbody>${rows}</tbody></table>`;
      })
      .join("");

    printHtml(
      `Lista de precios ${kind} — ${settings.company_name}`,
      `<div class="head"><img src="${logoUrl}"><div><h1>${escapeHtml(settings.company_name)}</h1>
       <div class="muted">${escapeHtml(settings.rif)} · ${escapeHtml(settings.phone)} · ${escapeHtml(settings.address)}</div></div>
       <div style="margin-left:auto;text-align:right"><h1>Lista ${kind === "mayor" ? "Al Mayor" : "Al Detal"}</h1><div>${fmtDate(new Date())}</div><div class="muted">${fmtRate(rate)}</div></div></div>
       ${sections}
       ${settings.price_list_note ? `<p style="margin-top:16px"><b>Nota:</b> ${escapeHtml(settings.price_list_note)}</p>` : ""}`,
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lista de precios"
        subtitle={`Precios actualizados al ${fmtDate(new Date())} · ${fmtRate(rate)}`}
        actions={
          <>
            <Button variant="outline" onClick={copyList} disabled={filtered.length === 0}>
              <Copy className="h-4 w-4" /> Copiar texto
            </Button>
            <Button variant="outline" asChild>
              <a href={whatsappUrl("", listText)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Enviar WhatsApp
              </a>
            </Button>
            <Button variant="accent" onClick={printList} disabled={filtered.length === 0}>
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Segmented<PriceKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "mayor", label: "Lista al mayor" },
            { value: "detal", label: "Lista al detal" },
          ]}
        />
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar producto…" className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="onlyStock" checked={onlyStock} onCheckedChange={setOnlyStock} />
          <Label htmlFor="onlyStock" className="text-sm">Solo con existencia</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="showBs" checked={showBs} onCheckedChange={setShowBs} />
          <Label htmlFor="showBs" className="text-sm">Mostrar Bs</Label>
        </div>
      </div>

      <CategoryChips categories={categories} value={cat} onChange={setCat} />

      {groups.length === 0 ? (
        <EmptyState icon={<Tags className="h-8 w-8" />} title="No hay productos para mostrar">
          Prueba desactivar "Solo con existencia" o cambiar la categoría.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Panel
              key={g.category?.id ?? "other"}
              title={g.category?.name ?? "Otros productos"}
              actions={
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CategoryImage category={g.category} className="h-7 w-7 rounded" />
                  <span>{g.items.length} productos</span>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Código</th>
                      <th className="py-2 pr-3">Producto</th>
                      <th className="py-2 pr-3">Presentaciones</th>
                      <th className="py-2 text-right">Precio $</th>
                      {showBs && <th className="py-2 pl-4 text-right">Precio Bs</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((p) => {
                      const u = unitPrice(p, kind);
                      return (
                        <tr key={p.id} className="border-t last:border-b-0">
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">{p.code}</td>
                          <td className="py-2.5 pr-3 font-semibold">
                            {p.name} <span className="text-xs font-normal text-muted-foreground">/ {p.unit}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                            {p.presentations.length === 0
                              ? "—"
                              : p.presentations
                                  .map((pr) => `${pr.name} x${fmtQty(pr.qty)}: ${fmtUsd(presentationPrice(pr, kind))}`)
                                  .join(" · ")}
                          </td>
                          <td className="py-2.5 text-right font-bold tabular">{fmtUsd(u)}</td>
                          {showBs && <td className="py-2.5 pl-4 text-right text-muted-foreground tabular">{fmtBs(usdToBs(u, rate))}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {settings.price_list_note && (
        <p className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <b>Nota al pie:</b> {settings.price_list_note}
        </p>
      )}
    </div>
  );
}
