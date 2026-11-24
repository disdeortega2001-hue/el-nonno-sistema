import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva clave — El Nonno" },
      { name: "description", content: "Crea una nueva clave para entrar a El Nonno." },
      { property: "og:title", content: "Nueva clave — El Nonno" },
      { property: "og:description", content: "Crea una nueva clave para entrar a El Nonno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("No se pudo cambiar la clave. Pide otro enlace.");
      return;
    }
    toast.success("Clave actualizada");
    navigate({ to: "/inicio", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="page-title">Nueva clave</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Escribe tu nueva clave</Label>
          <Input id="pw" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" variant="accent" size="xl" className="w-full" disabled={busy}>
          Guardar clave
        </Button>
      </form>
    </div>
  );
}
