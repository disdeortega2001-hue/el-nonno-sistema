import { useMemo, useState } from "react";
import { LayoutGrid, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CategoryImage } from "./CategoryImage";
import type { Category, Product } from "@/lib/db";
import { fmtQty, fmtUsd } from "@/lib/format";
import { presentationPrice, unitPrice, type PriceKind, type Presentation } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Category chips: "Todas" + each category with its picture. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip active={value === "all"} onClick={() => onChange("all")}>
        <LayoutGrid className="h-4 w-4" /> Todas
      </Chip>
      {categories.map((c) => (
        <Chip key={c.id} active={value === c.id} onClick={() => onChange(c.id)}>
          <CategoryImage category={c} className="h-5 w-5" /> {c.name}
        </Chip>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
        active ? "border-accent bg-accent text-accent-foreground shadow-sm" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Showcase of products ("la vitrina"). Tap a tile to add one unit; tap a
 * presentation pill to add a whole pack (caja, bulto...).
 */
export function ProductPicker({
  products,
  categories,
  kind,
  available,
  onPick,
  compact = false,
}: {
  products: Product[];
  categories: Category[];
  kind: PriceKind;
  /** Units still available for a product (stock - reserved - in cart). */
  available: (p: Product) => number;
  onPick: (p: Product, pres: Presentation | null) => void;
  compact?: boolean;
}) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.active &&
        (cat === "all" || p.category_id === cat) &&
        (!s ||
          p.name.toLowerCase().includes(s) ||
          p.code.toLowerCase().includes(s) ||
          (p.meta?.brand?.toLowerCase().includes(s) ?? false) ||
          (p.meta?.barcode?.toLowerCase().includes(s) ?? false)),
    );
  }, [products, cat, q]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, código, marca o código de barras…"
          className="h-11 pl-9"
        />
      </div>
      <CategoryChips categories={categories} value={cat} onChange={setCat} />
      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No hay productos con ese nombre.</p>
      ) : (
        <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4")}>
          {list.map((p) => {
            const avail = available(p);
            const out = avail <= 0;
            return (
              <div
                key={p.id}
                className={cn(
                  "group flex flex-col rounded-xl border bg-card p-3 text-left shadow-card transition-all",
                  out ? "opacity-55" : "hover:-translate-y-0.5 hover:border-accent hover:shadow-md",
                )}
              >
                <button
                  type="button"
                  disabled={out}
                  onClick={() => onPick(p, null)}
                  className="flex flex-1 flex-col text-left disabled:cursor-not-allowed"
                >
                  <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-secondary/60">
                    <CategoryImage category={catById.get(p.category_id ?? "")} className="h-16 w-16" />
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</p>
                  {p.meta?.brand && <p className="truncate text-[11px] text-muted-foreground">{p.meta.brand}</p>}
                  <p className="mt-1 font-display text-xl font-extrabold tabular">
                    {fmtUsd(unitPrice(p, kind))}
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">/{p.unit}</span>
                  </p>
                  <p className={cn("text-[11px]", out ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {out ? "Agotado" : `Hay ${fmtQty(avail)} ${p.unit}`}
                  </p>
                </button>
                {p.presentations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.presentations.map((pr) => (
                      <button
                        key={pr.name}
                        type="button"
                        disabled={avail < pr.qty}
                        onClick={() => onPick(p, pr)}
                        className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-foreground hover:bg-accent disabled:opacity-40"
                      >
                        + {pr.name} x{fmtQty(pr.qty)} {fmtUsd(presentationPrice(pr, kind))}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
