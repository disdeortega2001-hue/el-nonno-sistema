import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/app/GoogleButton";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — El Nonno" },
      { name: "description", content: "Entra al sistema de ventas de Inversiones El Nonno, C.A." },
      { property: "og:title", content: "Entrar — El Nonno" },
      { property: "og:description", content: "Entra al sistema de ventas de Inversiones El Nonno, C.A." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/inicio", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) setSent("Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego entra aquí.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("Te enviamos un correo con el enlace para crear una nueva clave.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Algo salió mal";
      toast.error(
        /invalid login/i.test(msg)
          ? "Correo o clave incorrectos"
          : /already registered/i.test(msg)
            ? "Ese correo ya tiene cuenta. Entra con tu clave."
            : /email not confirmed/i.test(msg)
              ? "Primero confirma tu correo con el enlace que te enviamos."
              : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("No se pudo entrar. Intenta de nuevo.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/inicio", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="h-12 w-12 rounded-full" />
          <div>
            <p className="font-display text-2xl font-extrabold uppercase leading-none text-sidebar-primary">El Nonno</p>
            <p className="text-xs text-sidebar-muted">Todo para surtir tu negocio</p>
          </div>
        </div>
        <div>
          <img src={logo} alt="El Nonno" className="mb-8 h-56 w-56 rounded-full shadow-pop" />
          <h1 className="font-display text-6xl font-extrabold uppercase leading-[0.95]">
            Charcutería,
            <br />
            panadería, envases
            <br />
            <span className="text-sidebar-primary">y víveres.</span>
          </h1>
          <p className="mt-4 max-w-md text-sidebar-muted">
            Vende, cobra, controla tu inventario y cuadra la caja del día desde cualquier equipo.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">Inversiones El Nonno, C.A.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-pop-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={logo} alt="" className="h-12 w-12 rounded-full" />
            <p className="font-display text-3xl font-extrabold uppercase">El Nonno</p>
          </div>
          <h2 className="page-title">
            {mode === "login" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Recuperar clave"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Después de crearla, el administrador debe aprobar tu acceso."
              : mode === "forgot"
                ? "Escribe tu correo y te enviamos un enlace."
                : "Usa tu correo y clave de El Nonno."}
          </p>

          {sent ? (
            <div className="mt-6 rounded-lg border bg-success-soft p-4 text-sm text-success">
              {sent}
              <Button variant="link" className="mt-2 h-auto p-0" onClick={() => { setSent(null); setMode("login"); }}>
                Volver a entrar
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Tu nombre</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ana Rodríguez" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Clave</Label>
                      {mode === "login" && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode("forgot")}>
                          ¿Olvidaste tu clave?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" variant="accent" size="xl" className="w-full" disabled={busy}>
                  {busy ? "Un momento…" : mode === "login" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Enviar enlace"}
                </Button>
              </form>

              {mode !== "forgot" && (
                <>
                  <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" /> o <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-2">
                    <GoogleButton onClick={() => oauth("google")} />
                    <Button type="button" variant="outline" className="h-10 w-full" onClick={() => oauth("lovable")}>
                      <LovableMark />
                      Continue with Lovable
                    </Button>
                  </div>
                </>
              )}

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    ¿Eres nuevo?{" "}
                    <button className="font-semibold text-foreground underline-offset-4 hover:underline" onClick={() => setMode("signup")}>
                      Crea tu cuenta
                    </button>
                  </>
                ) : (
                  <button className="font-semibold text-foreground underline-offset-4 hover:underline" onClick={() => setMode("login")}>
                    Ya tengo cuenta
                  </button>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
