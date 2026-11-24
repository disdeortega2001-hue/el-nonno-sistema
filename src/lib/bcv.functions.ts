import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Official BCV dollar rate (promedio) from DolarApi Venezuela. */
export const fetchBcvRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) return { rate: null as number | null, date: null as string | null, error: "No se pudo consultar el BCV" };
      const j = (await res.json()) as { promedio?: number; fechaActualizacion?: string };
      if (!j.promedio || j.promedio <= 0) return { rate: null, date: null, error: "El BCV no devolvió una tasa" };
      return { rate: Number(j.promedio), date: j.fechaActualizacion ?? null, error: null as string | null };
    } catch (e) {
      console.error("BCV fetch failed", e);
      return { rate: null, date: null, error: "No se pudo consultar el BCV" };
    }
  });
