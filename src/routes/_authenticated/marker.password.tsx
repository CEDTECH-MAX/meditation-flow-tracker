import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/marker/password")({
  head: () => ({
    meta: [
      { title: "Marker Password · Attendance Management" },
      {
        name: "description",
        content:
          "Markers replace the temporary password given by the administrator with a password only they know.",
      },
      { property: "og:title", content: "Change your marker password" },
      {
        property: "og:description",
        content: "Update the password on your marker account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarkerPassword,
});

function MarkerPassword() {
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
    <>
      <SectionTitle
        title="Change password"
        subtitle="Replace the temporary password your administrator gave you."
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
    </>
  );
}
