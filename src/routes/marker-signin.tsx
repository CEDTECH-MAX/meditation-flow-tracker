import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAuthEvent } from "@/lib/developer.functions";
import { Button, Card, Field, Input } from "@/components/ui-kit";


export const Route = createFileRoute("/marker-signin")({
  head: () => ({
    meta: [
      { title: "Marker Sign In · Attendance Management" },
      {
        name: "description",
        content:
          "Markers sign in with their email and password. The system automatically loads the institution and cohort the administrator assigned to them.",
      },
      { property: "og:title", content: "Marker Sign In" },
      {
        property: "og:description",
        content: "Sign in to mark attendance for your assigned cohort.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarkerSignIn,
});

function MarkerSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const address = email.trim();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: address,
      password,
    });
    if (authError || !data.user) {
      await recordAuthEvent({
        data: { email: address, succeeded: false, reason: "Incorrect email or password", portal: "marker" },
      }).catch(() => null);
      setError("Incorrect email or password.");
      setBusy(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isMarker = (roles ?? []).some((r) => r.role === "marker");
    if (!isMarker) {
      await supabase.auth.signOut();
      await recordAuthEvent({
        data: { email: address, succeeded: false, reason: "Not a marker account", portal: "marker" },
      }).catch(() => null);
      setError("This is not a marker account. Please use your institution's sign-in page.");
      setBusy(false);
      return;
    }
    await recordAuthEvent({ data: { email: address, succeeded: true, portal: "marker" } }).catch(() => null);
    navigate({ to: "/marker", replace: true });
    setBusy(false);
  }


  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold font-display text-lg font-bold text-gold-foreground shadow-soft">
            M
          </span>
          <h1 className="font-display text-3xl font-semibold text-gradient-green">Marker sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your cohort loads automatically once you sign in.
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
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
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
              Marker accounts are created by the administrator. Change your password once you are
              signed in.
            </p>
            <Link to="/" className="mt-2 text-xs text-muted-foreground hover:underline">
              ← Back to the portals
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
