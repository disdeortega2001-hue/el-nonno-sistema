import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { fmtQty, fmtUsd } from "@/lib/format";
import type { DocItem } from "@/lib/pricing";
import { cn } from "@/lib/utils";

function QtyInput({
  value,
  onCommit,
  dark,
}: {
  value: number;
  onCommit: (n: number) => void;
  dark: boolean;
}) {
  const [draft, setDraft] = useState(String(value).replace(".", ","));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value).replace(".", ","));
  }, [value, focused]);

  return (
    <input
      inputMode="decimal"
      value={focused ? draft : String(value).replace(".", ",")}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value).replace(".", ","));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw.replace(",", "."));
        if (Number.isFinite(n) && n > 0 && !raw.endsWith(",") && !raw.endsWith(".")) {
          onCommit(n);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(draft.replace(",", "."));
        if (Number.isFinite(n) && n > 0) onCommit(n);
        else setDraft(String(value).replace(".", ","));
      }}
      className={cn(
        "h-7 w-14 rounded-md border text-center text-sm font-bold tabular",
        dark ? "border-panel-foreground/20 bg-transparent" : "bg-background",
      )}
    />
  );
}

/** Lines of a ticket / order with +/- buttons. `dark` matches the navy ticket panel. */
export function CartLines({
  lines,
  onCount,
  onRemove,
  dark = false,
  empty = "Toca un producto para agregarlo.",
}: {
  lines: DocItem[];
  onCount: (index: number, count: number) => void;
  onRemove: (index: number) => void;
  dark?: boolean;
  empty?: string;
}) {
  if (lines.length === 0)
    return <p className={cn("py-8 text-center text-sm", dark ? "text-panel-muted" : "text-muted-foreground")}>{empty}</p>;
  return (
    <ul className={cn("divide-y", dark ? "divide-panel-foreground/10" : "")}>
      {lines.map((l, i) => {
        const step = l.presentation ? 1 : l.unit === "kg" ? 0.25 : 1;
        return (
          <li key={l.product_id + (l.presentation ?? "")} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{l.name}</p>
              <p className={cn("text-[11px] tabular", dark ? "text-panel-muted" : "text-muted-foreground")}>
                {l.presentation ? `${l.presentation} x${fmtQty(l.pres_qty)} · ` : ""}
                {fmtUsd(l.price)} c/u
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Menos"
                onClick={() => (l.count - step <= 0 ? onRemove(i) : onCount(i, Math.round((l.count - step) * 1000) / 1000))}
                className={cn("flex h-7 w-7 items-center justify-center rounded-md", dark ? "bg-panel-foreground/10 hover:bg-panel-foreground/20" : "bg-muted hover:bg-secondary")}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <QtyInput value={l.count} onCommit={(n) => onCount(i, n)} dark={dark} />
              <button
                type="button"
                aria-label="Más"
                onClick={() => onCount(i, Math.round((l.count + step) * 1000) / 1000)}
                className={cn("flex h-7 w-7 items-center justify-center rounded-md", dark ? "bg-panel-foreground/10 hover:bg-panel-foreground/20" : "bg-muted hover:bg-secondary")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="w-20 text-right text-sm font-bold tabular">{fmtUsd(l.line_total)}</p>
            <button type="button" aria-label="Quitar" onClick={() => onRemove(i)} className={cn("p-1", dark ? "text-panel-muted hover:text-panel-foreground" : "text-muted-foreground hover:text-destructive")}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
