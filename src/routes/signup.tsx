import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listSignupCohorts, signUpStudent } from "@/lib/auth.functions";
import { Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { CLASSIFICATIONS, GENDERS } from "@/lib/attendance";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Student Sign Up · Maharishi Institute Meditation Attendance" },
      {
        name: "description",
        content:
          "Register for the Maharishi Institute meditation attendance system: choose your cohort, classification and gender to be grouped automatically.",
      },
      { property: "og:title", content: "Student Sign Up · Meditation Attendance" },
      {
        property: "og:description",
        content: "Create your student account to track meditation attendance against the 80% requirement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();
  const cohortsFn = useServerFn(listSignupCohorts);
  const { data: cohorts } = useQuery({
    queryKey: ["signup-cohorts"],
    queryFn: () => cohortsFn() as Promise<{ id: string; name: string }[]>,
  });
  const signUpFn = useServerFn(signUpStudent);

  const [form, setForm] = useState({
    full_name: "",
    student_number: "",
    cohort_id: "",
    classification: "",
    gender: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUpFn({
        data: {
          full_name: form.full_name,
          student_number: form.student_number,
          cohort_id: form.cohort_id,
          classification: form.classification as "meditator",
          gender: form.gender as "male",
          email: form.email,
          password: form.password,
        },
      });
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (authError) throw new Error("Account created. Please sign in.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete sign up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-soft">
            MI
          </span>
          <h1 className="font-display text-3xl font-semibold text-gradient-green">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Register as a meditation student — your details reach the administrator automatically.
          </p>
        </div>

        <Card className="animate-rise">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="FULL NAMES" className="sm:col-span-2">
              <Input required value={form.full_name} onChange={set("full_name")} placeholder="Name and surname" />
            </Field>
            <Field label="STUDENT NUMBER">
              <Input required value={form.student_number} onChange={set("student_number")} placeholder="e.g. MI21-0421" />
            </Field>
            <Field label="COHORT">
              <Select required value={form.cohort_id} onChange={set("cohort_id")}>
                <option value="">Select cohort</option>
                {(cohorts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="CLASSIFICATION">
              <Select required value={form.classification} onChange={set("classification")}>
                <option value="">Select classification</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GENDER">
              <Select required value={form.gender} onChange={set("gender")}>
                <option value="">Select gender</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="SCHOOL EMAIL" className="sm:col-span-2">
              <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@maharishi.edu" />
            </Field>
            <Field label="PASSWORD" className="sm:col-span-2">
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
                placeholder="At least 8 characters"
              />
            </Field>

            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p>
            ) : null}

            <Button type="submit" size="lg" className="w-full sm:col-span-2" disabled={busy}>
              {busy ? "Creating account…" : "Sign up"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
