export type Ctx = { supabase: any; userId: string; claims: Record<string, any> };

export async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: administrators only");
}

export async function audit(
  context: Ctx,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await context.supabase.from("audit_logs").insert({
    actor_id: context.userId,
    actor_email: (context.claims?.["email"] as string) ?? null,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

/** Internal institute inbox address derived from the student number. */
export function internalEmail(studentNumber: string) {
  const slug = studentNumber.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  return `${slug || "student"}@mi.local`;
}

/**
 * Attendance is recorded as points (0 – 2.0 per session). The legacy status
 * column is derived so historical reports and RLS-facing queries stay valid.
 */
export function statusFromPoints(
  points: number,
  reason?: string | null,
): "present" | "absent" | "excused" {
  if (points > 0) return "present";
  return reason === "sick_leave" || reason === "approved_leave" ? "excused" : "absent";
}


/** The institution (MII / MIU) the signed-in account belongs to. */
export async function myInstitution(context: Ctx): Promise<"MII" | "MIU"> {
  const { data } = await context.supabase
    .from("profiles")
    .select("institution")
    .eq("id", context.userId)
    .maybeSingle();
  return (data?.institution as "MII" | "MIU") ?? "MII";
}

/**
 * Emergency control: the platform developer can pause all marking.
 * Checked server-side so pausing cannot be bypassed from the browser.
 */
export async function assertMarkingEnabled(_c: Ctx) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_controls")
    .select("enabled")
    .eq("key", "disable_marking")
    .maybeSingle();
  if (data?.enabled) {
    throw new Error("Marking is temporarily paused. Please try again later.");
  }
}

/**
 * Corrects the sign-in email of an account inside the administrator's own
 * institution. Updates both the sign-in account and the profile.
 */
export async function changeAccountEmail(c: Ctx, userId: string, email: string | undefined) {
  if (!email) return false;
  const next = email.trim().toLowerCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const inst = await myInstitution(c);
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, institution")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.institution !== inst)
    throw new Error("That account is outside your institution.");
  if ((profile.email ?? "").toLowerCase() === next) return false;
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: next,
    email_confirm: true,
  });
  if (error)
    throw new Error(
      /already|registered|exists/i.test(error.message)
        ? "That email address already has an account."
        : error.message,
    );
  await supabaseAdmin.from("profiles").update({ email: next }).eq("id", userId);
  await audit(c, "change_email", "account", userId, { from: profile.email, to: next });
  return true;
}
