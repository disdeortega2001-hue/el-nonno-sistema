import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "El Nonno — Sistema de ventas" },
      { name: "description", content: "Sistema de ventas, inventario y caja de Inversiones El Nonno, C.A." },
      { property: "og:title", content: "El Nonno — Sistema de ventas" },
      { property: "og:description", content: "Sistema de ventas, inventario y caja de Inversiones El Nonno, C.A." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/inicio" : "/auth", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-sidebar text-sidebar-foreground">
      <img src={logo} alt="El Nonno" className="h-24 w-24 animate-pulse rounded-full" />
      <p className="font-display text-3xl font-extrabold uppercase tracking-wide text-sidebar-primary">El Nonno</p>
    </div>
  );
}
