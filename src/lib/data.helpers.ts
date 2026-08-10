export type Ctx = { supabase: any; userId: string; claims: Record<string, any> };

export async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  // A failed lookup is not the same as a denied role: report it as such so an
  // outage is not reported to the administrator as a permission problem.
  if (error) throw new Error(`Could not verify your permissions: ${error.message}`);
  if (!data) throw new Error("Forbidden: administrators only");
}

/**
 * Writes the audit trail entry for a change that has already been committed.
 * The write cannot be rolled back, so a logging failure is reported to the
 * server log with full context instead of failing the caller's request.
 */
export async function audit(
  context: Ctx,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  const { error } = await context.supabase.from("audit_logs").insert({
    actor_id: context.userId,
    actor_email: (context.claims?.["email"] as string) ?? null,
    action,
    entity,
    entity_id: entityId,
    details,
  });
  if (error) {
    console.error(
      new Error(
        `Audit log write failed for ${action} on ${entity} ${entityId ?? "(no id)"} by ${context.userId}: ${error.message}`,
        { cause: error },
      ),
    );
  }
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

