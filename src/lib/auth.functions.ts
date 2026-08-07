import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { internalEmail } from "./data.helpers";

/** Public: cohort options shown on the sign-up form. */
export const listSignupCohorts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("cohorts")
    .select("id, name, programme, intake_year")
    .order("name", { ascending: true });
  return data ?? [];
});

const signupInput = z.object({
  full_name: z.string().trim().min(2).max(120),
  student_number: z.string().trim().min(1).max(40),
  cohort_id: z.string().uuid(),
  classification: z.enum(["meditator", "rising_siddha", "siddha"]),
  gender: z.enum(["male", "female"]),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

/**
 * Public student self-registration. Creates the account, the profile and the
 * student role so the new student appears for administrators immediately,
 * already grouped by cohort, classification and gender.
 */
export const signUpStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signupInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.toLowerCase();

    const { data: cohort } = await supabaseAdmin
      .from("cohorts")
      .select("id, name, programme, intake_year")
      .eq("id", data.cohort_id)
      .maybeSingle();
    if (!cohort) throw new Error("Please choose a valid cohort.");

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("student_number", data.student_number)
      .maybeSingle();
    if (taken) throw new Error("That student number is already registered.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) {
      throw new Error(
        /already/i.test(error?.message ?? "")
          ? "An account with that email already exists."
          : (error?.message ?? "Could not create your account."),
      );
    }

    const id = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id,
      full_name: data.full_name,
      student_number: data.student_number,
      email,
      cohort_id: cohort.id,
      classification: data.classification,
      gender: data.gender,
      programme: cohort.programme,
      intake_year: cohort.intake_year,
      internal_email: internalEmail(data.student_number),
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error(pErr.message);
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "student" });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: id,
      actor_email: email,
      action: "signup",
      entity: "student",
      entity_id: id,
      details: {
        cohort: cohort.name,
        classification: data.classification,
        gender: data.gender,
        student_number: data.student_number,
      },
    });

    return { ok: true };
  });
