import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui-kit";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set New Password · Maharishi Institute Meditation Attendance" },
      {
        name: "description",
        content:
          "Choose a new password for your Maharishi Institute meditation attendance account after requesting a reset link.",
      },
      { property: "og:title", content: "Set a New Password" },
      {
        property: "og:description",
        content: "Complete your password reset and get back to tracking your meditation attendance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const recovery = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => setReady(recovery || Boolean(data.session)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center font-display text-3xl font-semibold text-gradient-green">
          Set a new password
        </h1>
        <Card className="animate-rise">
          {ready ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="NEW PASSWORD">
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </Field>
              <Field label="CONFIRM PASSWORD">
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                />
              </Field>
              {error ? (
                <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the{" "}
              <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                forgot password
              </Link>{" "}
              page.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
