import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAuthEvent } from "@/lib/developer.functions";
import { Button, Field, Input } from "@/components/ui-kit";

export const Route = createFileRoute("/developer-signin")({
  head: () => ({
    meta: [
      { title: "Developer sign in · MII / MIU platform oversight" },
      {
        name: "description",
        content:
          "Sign in to the MII / MIU developer portal for platform-wide oversight of accounts, security activity and system health.",
      },
      { property: "og:title", content: "Developer sign in · MII / MIU" },
      { property: "og:description", content: "Platform-wide oversight for the attendance system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeveloperSignIn,
});

function DeveloperSignIn() {
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
        data: { email: address, succeeded: false, reason: "Incorrect email or password", portal: "developer" },
      }).catch(() => null);
      setError("Incorrect email or password.");
      setBusy(false);
      return;
    }
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const isDeveloper = (roles ?? []).some((r) => r.role === "developer");
    if (!isDeveloper) {
      await supabase.auth.signOut();
      await recordAuthEvent({
        data: { email: address, succeeded: false, reason: "Not a developer account", portal: "developer" },
      }).catch(() => null);
      setError("This is not a developer account. Please use your institution's sign-in page.");
      setBusy(false);
      return;
    }
    await recordAuthEvent({ data: { email: address, succeeded: true, portal: "developer" } }).catch(() => null);
    navigate({ to: "/developer", replace: true });
    setBusy(false);
  }

  return (
    <div className="dev-portal flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 font-display text-lg font-bold text-primary">
            DEV
          </span>
          <h1 className="font-display text-3xl font-semibold">Developer portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform-wide oversight of MII and MIU. Every action here is recorded.
          </p>
        </div>

        <div className="dev-card animate-rise p-6">
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
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:underline">
              ← Back to the portals
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
