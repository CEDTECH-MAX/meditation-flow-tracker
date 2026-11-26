import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui-kit";
import { recordAuthEvent } from "@/lib/developer.functions";
import { loginDestination } from "@/lib/login-destination";

async function accountDestination(userId: string) {
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("institution").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (profileResult.error || rolesResult.error) {
    throw new Error("Your sign-in succeeded, but your account details could not be loaded. Please try again.");
  }
  return loginDestination((rolesResult.data ?? []).map((row) => row.role), profileResult.data?.institution);
}

export function SignInPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    async function restoreAccount() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active || !data.user) return;
        const destination = await accountDestination(data.user.id);
        if (active) await navigate({ to: destination, replace: true });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load your account. Please try again.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void restoreAccount();
    return () => { active = false; };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || checking) return;
    setBusy(true);
    setError(null);
    const address = email.trim().toLowerCase();
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: address, password });
      if (authError || !data.user || !data.session) {
        const offline = Boolean(authError && (authError.status === 0 || /fetch|network/i.test(authError.message)));
        void recordAuthEvent({ data: { email: address, succeeded: false, reason: offline ? "Sign-in service unreachable" : "Sign-in rejected", portal: "unified" } }).catch(() => null);
        setError(offline
          ? "Can't connect to the sign-in service right now. Your password was not checked — please try again later."
          : authError?.code === "email_not_confirmed"
            ? "Please confirm your email before signing in."
            : "Incorrect email or password.");
        return;
      }
      const destination = await accountDestination(data.user.id);
      void recordAuthEvent({ data: { email: address, succeeded: true, portal: destination.slice(1) } }).catch(() => null);
      await queryClient.cancelQueries();
      queryClient.clear();
      await navigate({ to: destination, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-soft">MI</span>
          <h1 className="font-display text-3xl font-semibold text-gradient-green">Maharishi Invincibility</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in</p>
        </div>
        <Card className="animate-rise">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="EMAIL ADDRESS">
              <Input aria-label="Email address" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={busy} />
            </Field>
            <Field label="PASSWORD">
              <Input aria-label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={busy} />
            </Field>
            {error ? <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy || checking}>
              {busy ? "Signing in…" : checking ? "Checking session…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link to="/forgot-password" className="text-muted-foreground hover:underline">Forgot password?</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
