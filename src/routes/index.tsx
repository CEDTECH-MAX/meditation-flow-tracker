import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui-kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign In · Maharishi Institute Meditation Attendance" },
      {
        name: "description",
        content:
          "Secure sign-in for the Maharishi Institute meditation attendance system. Students track their block attendance; administrators record sessions.",
      },
      { property: "og:title", content: "Maharishi Institute Meditation Attendance" },
      {
        property: "og:description",
        content:
          "Track meditation attendance across academic blocks with automatic percentage calculation and an 80% requirement.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      await routeByRole(data.session.user.id, navigate);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError || !data.user) {
      setError("Incorrect email or password.");
      setBusy(false);
      return;
    }
    await routeByRole(data.user.id, navigate);
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-soft">
            MI
          </span>
          <h1 className="font-display text-3xl font-semibold text-gradient-green">
            Maharishi Institute
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Meditation Attendance Management System
          </p>
        </div>

        <Card className="animate-rise">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="EMAIL ADDRESS">
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="PASSWORD">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 flex flex-col items-center gap-1 text-sm">
            <Link to="/forgot-password" className="text-muted-foreground hover:underline">
              Forgot password?
            </Link>
            <p className="text-center text-xs text-muted-foreground">
              Accounts are created by the administrator. Ask them for your sign-in details, then
              change your password once you are signed in.
            </p>
          </div>

        </Card>


        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <div className="glass-muted rounded-xl px-2 py-3">Secure sign-in</div>
          <div className="glass-muted rounded-xl px-2 py-3">80% requirement</div>
          <div className="glass-muted rounded-xl px-2 py-3">Live percentages</div>
        </div>
      </div>
    </div>
  );
}

async function routeByRole(userId: string, navigate: ReturnType<typeof useNavigate>) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r) => r.role === "admin");
  navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
}
