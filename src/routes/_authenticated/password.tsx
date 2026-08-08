import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/password")({
  head: () => ({
    meta: [
      { title: "Change Password · Meditation Attendance" },
      {
        name: "description",
        content:
          "Change the password for your Maharishi Institute meditation attendance account after signing in with the details your administrator gave you.",
      },
      { property: "og:title", content: "Change your password" },
      {
        property: "og:description",
        content: "Update the password on your meditation attendance account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangePassword;
});

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("The new passwords do not match.");
      return;
    }
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (verifyError) {
      setBusy(false);
      toast.error("Your current password is incorrect.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Your password has been changed.");
  }

  return (
    <AppShell>
      <SectionTitle
        title="Change password"
        subtitle="Replace the temporary password your administrator gave you with one only you know."
      />
      <Card className="max-w-md">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="CURRENT PASSWORD">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="NEW PASSWORD">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="CONFIRM NEW PASSWORD">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
