import { z } from "zod";

export type Ctx = { supabase: any; userId: string; claims: Record<string, any> };

/** The server-fn `context` typed as the Supabase auth context. */
export function ctx(context: unknown): Ctx {
  return context as Ctx;
}

/** Throws the Supabase error, if any, otherwise returns the rows. */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Service-role client, imported lazily so it never reaches the browser bundle. */
export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Profile row joined with its cohort — the shape both dashboards expect. */
export const PROFILE_WITH_COHORT = "*, cohort:cohorts(id,name,programme,intake_year)";

export const uuid = z.string().uuid();
export const idInput = z.object({ id: uuid });
export const blockIdInput = z.object({ block_id: uuid });
export const isoDate = z.string().min(10).max(10);
export const slotInput = z.enum(["morning", "afternoon"]);
export const blockStatusInput = z.enum(["upcoming", "active", "closed"]);
export const classificationInput = z.enum(["meditator", "rising_siddha", "siddha"]);
export const genderInput = z.enum(["male", "female"]);
export const absenceReasonInput = z.enum([
  "sick_leave",
  "approved_leave",
  "late_arrival",
  "unexcused",
  "other",
]);
export const studentIdsInput = z.array(uuid).min(1).max(2000);
export const optionalText = (max: number) =>
  z.string().trim().max(max).or(z.literal("")).optional();
export const intakeYear = z.number().int().min(2000).max(2100).nullable().optional();

/** Fields shared by the create-student and update-student payloads. */
export const studentProfileInput = {
  full_name: z.string().trim().min(2).max(120),
  student_number: z.string().trim().min(1).max(40),
  cohort_id: uuid.nullable().optional(),
  programme: optionalText(120),
  intake_year: intakeYear,
  classification: classificationInput.nullable().optional(),
  gender: genderInput.nullable().optional(),
};

type StudentProfileFields = z.infer<z.ZodObject<typeof studentProfileInput>>;

/** The `profiles` columns written on both create and update. */
export function studentProfileRow(data: StudentProfileFields) {
  return {
    full_name: data.full_name,
    student_number: data.student_number,
    cohort_id: data.cohort_id ?? null,
    programme: data.programme || null,
    intake_year: data.intake_year ?? null,
    classification: data.classification ?? null,
    gender: data.gender ?? null,
    internal_email: internalEmail(data.student_number),
  };
}

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
  const slug = studentNumber
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
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
