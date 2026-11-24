import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Client } from "@/lib/db";
import { cn } from "@/lib/utils";

export const WALK_IN = "none";

export function ClientSelect({
  clients,
  value,
  onChange,
  className,
  placeholder = "Cliente de contado",
}: {
  clients: Client[];
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Select value={value ?? WALK_IN} onValueChange={(v) => onChange(v === WALK_IN ? null : v)}>
      <SelectTrigger className={cn("h-10", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={WALK_IN}>Cliente de contado (sin registro)</SelectItem>
        {clients
          .filter((c) => c.active || c.id === value)
          .map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name} · {c.kind === "mayor" ? "Mayor" : "Detal"}
              {c.rif ? ` · ${c.rif}` : ""}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel font-display text-sm font-extrabold text-accent", className)}>
      {initials(name) || "?"}
    </span>
  );
}
