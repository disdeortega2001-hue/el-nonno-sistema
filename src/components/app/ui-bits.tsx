import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DOC_STATUS } from "@/lib/db";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** White card used for page sections. */
export function Panel({ title, description, actions, children, className }: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-card", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** KPI tile. `tone="panel"` is the dark navy hero tile with an amber figure. */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "panel" | "success" | "warning" | "danger";
  icon?: ReactNode;
}) {
  const toneCls = {
    default: "bg-card text-card-foreground",
    panel: "bg-gradient-panel text-panel-foreground border-transparent",
    success: "bg-card text-card-foreground",
    warning: "bg-card text-card-foreground",
    danger: "bg-card text-card-foreground",
  }[tone];
  const valueCls = {
    default: "text-foreground",
    panel: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-4 shadow-card", toneCls)}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("eyebrow", tone === "panel" ? "text-panel-muted" : "text-muted-foreground")}>{label}</p>
        {icon && <span className={tone === "panel" ? "text-panel-muted" : "text-muted-foreground"}>{icon}</span>}
      </div>
      <p className={cn("mt-1 font-display text-3xl font-extrabold tabular", valueCls)}>{value}</p>
      {hint && <p className={cn("mt-0.5 text-xs", tone === "panel" ? "text-panel-muted" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = DOC_STATUS[status] ?? { label: status, tone: "muted" as const };
  return <Badge variant={s.tone}>{s.label}</Badge>;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/40 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Segmented control used for tabs/filters (Detal/Mayor, Hoy/Ayer, etc). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
            value === o.value ? "bg-panel text-panel-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
