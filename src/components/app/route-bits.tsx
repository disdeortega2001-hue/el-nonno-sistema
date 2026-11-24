import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

/** Prime several queries before a page renders. */
export function ensureAll(qc: QueryClient, queries: readonly { queryKey: readonly unknown[] }[]) {
  return Promise.all(queries.map((q) => qc.ensureQueryData(q as never))).then(() => undefined);
}

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center shadow-card">
      <p className="section-title">No se pudo cargar</p>
      <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      <Button className="mt-4" variant="accent" onClick={() => router.invalidate()}>
        Reintentar
      </Button>
    </div>
  );
}

export function RouteNotFound() {
  return <p className="py-16 text-center text-muted-foreground">No encontramos lo que buscabas.</p>;
}

export function pageHead(title: string, description: string) {
  const t = `${title} — El Nonno`;
  return {
    meta: [
      { title: t },
      { name: "description", content: description },
      { property: "og:title", content: t },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
