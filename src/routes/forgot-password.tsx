import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui-kit";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Password · Maharishi Institute Meditation Attendance" },
      {
        name: "description",
        content:
          "Request a password reset link for your Maharishi Institute meditation attendance account, sent to your registered school email.",
      },
      { property: "og:title", content: "Reset Your Password" },
      {
        property: "og:description",
        content: "Send a secure password reset link to the school email you registered with.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (err) setError(err.message);
    else setSent(true);
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center font-display text-3xl font-semibold text-gradient-green">
          Forgot password
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          We&apos;ll email a secure reset link to the address you registered with.
        </p>
        <Card className="animate-rise">
          {sent ? (
            <p className="rounded-xl bg-success/12 px-3 py-3 text-sm text-success">
              Check your inbox — a reset link is on its way to {email}.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="REGISTERED EMAIL">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@maharishi.edu"
                />
              </Field>
              {error ? (
                <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
