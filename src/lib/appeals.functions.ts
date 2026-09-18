import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, audit, myInstitution, type Ctx } from "./data.helpers";

/**
 * Attendance appeals and post-session reviews.
 *
 * Appeals flow: student submits → assigned marker reviews and responds
 * (accept / reject / refer to admin) → administrator records a decision.
 * NOTHING here writes to the attendance table: an approved appeal only
 * authorises an administrator to use the existing, audited correction tools.
 *
 * Reviews: the student relationship is stored (one review per session, and
 * only for sessions the student actually attended) but the admin-facing
 * functions read anonymous aggregates through security-definer SQL functions,
 * so no student identity ever reaches an administrator's browser.
 */

const uuid = z.string().uuid();
const dateStr = z.string().min(10).max(10);
const slot = z.enum(["morning", "afternoon"]);

type Slot = "morning" | "afternoon";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------- student side ----------------------------- */

export const listMyAppeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { data, error } = await c.supabase
      .from("attendance_appeals")
      .select("*")
      .eq("student_id", c.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: uuid,
        session_date: dateStr,
        slot,
        register: z.enum(["meditation", "class"]).default("meditation"),
        reason: z.string().trim().min(3).max(160),
        comment: z.string().trim().max(1500).or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const sb = await admin();

    const { data: profile } = await sb
      .from("profiles")
      .select("id, institution, cohort_id, is_active")
      .eq("id", c.userId)
      .maybeSingle();
    if (!profile || profile.is_active === false) throw new Error("This account is not active");

    const { data: block } = await sb
      .from("blocks")
      .select("id, institution, cohort_id")
      .eq("id", data.block_id)
      .maybeSingle();
    if (!block || block.institution !== profile.institution)
      throw new Error("That block does not belong to your institution");

    // Only one open appeal per session.
    const { data: existing } = await sb
      .from("attendance_appeals")
      .select("id, status")
      .eq("student_id", c.userId)
      .eq("block_id", data.block_id)
      .eq("session_date", data.session_date)
      .eq("slot", data.slot)
      .maybeSingle();
    if (existing && existing.status !== "resolved")
      throw new Error("You already have an appeal open for this session.");

    // Route the appeal to the marker assigned to this student's cohort.
    let markerId: string | null = null;
    if (profile.cohort_id) {
      const { data: assignment } = await sb
        .from("marker_assignments")
        .select("marker_id")
        .eq("is_active", true)
        .eq("cohort_id", profile.cohort_id)
        .limit(1)
        .maybeSingle();
      markerId = (assignment as any)?.marker_id ?? null;
    }

    const { data: created, error } = await sb
      .from("attendance_appeals")
      .insert({
        student_id: c.userId,
        block_id: data.block_id,
        cohort_id: profile.cohort_id,
        institution: profile.institution,
        session_date: data.session_date,
        slot: data.slot,
        register: data.register,
        reason: data.reason,
        comment: data.comment || null,
        marker_id: markerId,
        status: "submitted",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await audit(c, "submit", "attendance_appeal", created.id as string, {
      session_date: data.session_date,
      slot: data.slot,
      reason: data.reason,
    });
    return { id: created.id as string, marker_assigned: Boolean(markerId) };
  });

export const listMySessionReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { data, error } = await c.supabase
      .from("session_reviews")
      .select("id, block_id, session_date, slot, rating, comment, created_at")
      .eq("student_id", c.userId)
      .order("session_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitSessionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: uuid,
        session_date: dateStr,
        slot,
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const sb = await admin();

    const { data: profile } = await sb
      .from("profiles")
      .select("institution, cohort_id, is_active")
      .eq("id", c.userId)
      .maybeSingle();
    if (!profile || profile.is_active === false) throw new Error("This account is not active");

    // Only a student who was marked present for the session may review it.
    const { data: record } = await sb
      .from("attendance")
      .select("id, points")
      .eq("student_id", c.userId)
      .eq("block_id", data.block_id)
      .eq("session_date", data.session_date)
      .eq("slot", data.slot)
      .maybeSingle();
    if (!record)
      throw new Error("You can review this session once your attendance has been marked.");
    if (Number(record.points) <= 0)
      throw new Error("Only students who attended the session can review it.");

    const { error } = await sb.from("session_reviews").upsert(
      {
        student_id: c.userId,
        block_id: data.block_id,
        cohort_id: profile.cohort_id,
        institution: profile.institution,
        session_date: data.session_date,
        slot: data.slot,
        rating: data.rating,
        comment: data.comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,block_id,session_date,slot" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- marker side ----------------------------- */

async function markerCohorts(c: Ctx) {
  const sb = await admin();
  const { data: isMarker } = await c.supabase.rpc("has_role_text", {
    _user_id: c.userId,
    _role: "marker",
  });
  if (!isMarker) throw new Error("Forbidden: markers only");
  const { data: profile } = await sb
    .from("profiles")
    .select("institution, is_active")
    .eq("id", c.userId)
    .maybeSingle();
  if (!profile || profile.is_active === false) throw new Error("This marker account is inactive");
  const { data: assignments } = await sb
    .from("marker_assignments")
    .select("cohort_id")
    .eq("marker_id", c.userId)
    .eq("is_active", true);
  const cohortIds = [
    ...new Set((assignments ?? []).map((a: any) => a.cohort_id).filter(Boolean) as string[]),
  ];
  if (cohortIds.length === 0) throw new Error("No cohort has been assigned to this marker yet");
  return { institution: profile.institution as "MII" | "MIU", cohortIds };
}

export const listMarkerAppeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const scope = await markerCohorts(c);
    const sb = await admin();
    const { data, error } = await sb
      .from("attendance_appeals")
      .select("*, student:profiles!attendance_appeals_student_id_fkey(full_name, student_number)")
      .eq("institution", scope.institution)
      .in("cohort_id", scope.cohortIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const respondToAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        decision: z.enum(["accepted", "rejected", "referred"]),
        response: z.string().trim().min(3).max(1500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const scope = await markerCohorts(c);
    const sb = await admin();

    const { data: appeal } = await sb
      .from("attendance_appeals")
      .select("id, cohort_id, institution, student_id")
      .eq("id", data.id)
      .maybeSingle();
    if (
      !appeal ||
      appeal.institution !== scope.institution ||
      !appeal.cohort_id ||
      !scope.cohortIds.includes(appeal.cohort_id)
    ) {
      await audit(c, "denied", "attendance_appeal", data.id, { reason: "outside marker scope" });
      throw new Error("You may only review appeals from your own cohort.");
    }

    const status = data.decision === "referred" ? "referred" : data.decision;
    const { error } = await sb
      .from("attendance_appeals")
      .update({
        marker_id: c.userId,
        marker_decision: data.decision,
        marker_response: data.response,
        marker_reviewed_at: new Date().toISOString(),
        status,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "review", "attendance_appeal", data.id, { decision: data.decision });
    return { ok: true };
  });

/* --------------------------------- admin side ---------------------------- */

export const listAppeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const sb = await admin();

    const { data: appeals, error } = await sb
      .from("attendance_appeals")
      .select("*")
      .eq("institution", inst)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = appeals ?? [];
    const peopleIds = [
      ...new Set([
        ...rows.map((r: any) => r.student_id),
        ...rows.map((r: any) => r.marker_id).filter(Boolean),
        ...rows.map((r: any) => r.admin_id).filter(Boolean),
      ]),
    ] as string[];
    const [{ data: people }, { data: cohorts }, { data: blocks }] = await Promise.all([
      peopleIds.length
        ? sb.from("profiles").select("id, full_name, student_number").in("id", peopleIds)
        : Promise.resolve({ data: [] as any[] }),
      sb.from("cohorts").select("id, name").eq("institution", inst),
      sb.from("blocks").select("id, name").eq("institution", inst),
    ]);
    const nameOf = new Map((people ?? []).map((p: any) => [p.id, p]));
    const cohortOf = new Map((cohorts ?? []).map((x: any) => [x.id, x.name]));
    const blockOf = new Map((blocks ?? []).map((x: any) => [x.id, x.name]));

    return rows.map((r: any) => ({
      ...r,
      student_name: nameOf.get(r.student_id)?.full_name ?? "Unknown",
      student_number: nameOf.get(r.student_id)?.student_number ?? null,
      marker_name: r.marker_id ? (nameOf.get(r.marker_id)?.full_name ?? "Unknown") : null,
      admin_name: r.admin_id ? (nameOf.get(r.admin_id)?.full_name ?? null) : null,
      cohort_name: r.cohort_id ? (cohortOf.get(r.cohort_id) ?? null) : null,
      block_name: blockOf.get(r.block_id) ?? null,
    }));
  });

export const decideAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        decision: z.enum(["approved", "declined", "pending"]),
        response: z.string().trim().min(3).max(1500),
        close: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const sb = await admin();

    const { data: appeal } = await sb
      .from("attendance_appeals")
      .select("id, institution, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!appeal || appeal.institution !== inst) throw new Error("Appeal not found");

    // Deliberately does NOT touch the attendance record. An approved appeal
    // only authorises the administrator to make the correction through the
    // existing, audited register tools.
    const { error } = await sb
      .from("attendance_appeals")
      .update({
        admin_id: c.userId,
        admin_decision: data.decision,
        admin_response: data.response,
        admin_reviewed_at: new Date().toISOString(),
        status: data.close ? "resolved" : "reviewed",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "decide", "attendance_appeal", data.id, {
      decision: data.decision,
      attendance_changed: false,
    });
    return { ok: true };
  });

/**
 * Anonymous session feedback for administrators. Reads go through the
 * security-definer aggregate functions, which never return student_id, so the
 * identity is not merely hidden in the interface — it never leaves the server.
 */
export const getSessionFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);

    const [{ data: summary, error: sErr }, { data: comments, error: cErr }] = await Promise.all([
      c.supabase.rpc("session_review_summary", { _institution: inst }),
      c.supabase.rpc("session_review_comments", { _institution: inst }),
    ]);
    if (sErr) throw new Error(sErr.message);
    if (cErr) throw new Error(cErr.message);

    const sb = await admin();
    const [{ data: cohorts }, { data: blocks }] = await Promise.all([
      sb.from("cohorts").select("id, name").eq("institution", inst),
      sb.from("blocks").select("id, name").eq("institution", inst),
    ]);
    const cohortOf = new Map((cohorts ?? []).map((x: any) => [x.id, x.name]));
    const blockOf = new Map((blocks ?? []).map((x: any) => [x.id, x.name]));

    const decorate = (r: any) => ({
      ...r,
      cohort_name: r.cohort_id ? (cohortOf.get(r.cohort_id) ?? "—") : "—",
      block_name: blockOf.get(r.block_id) ?? "—",
    });

    return {
      institution: inst,
      sessions: ((summary ?? []) as any[]).map(decorate),
      comments: ((comments ?? []) as any[]).map(decorate),
    };
  });

export type AppealStatus =
  | "submitted"
  | "reviewed"
  | "accepted"
  | "rejected"
  | "referred"
  | "resolved";

export type AppealRow = {
  id: string;
  student_id: string;
  block_id: string;
  cohort_id: string | null;
  session_date: string;
  slot: Slot;
  register: string;
  reason: string;
  comment: string | null;
  status: AppealStatus;
  marker_id: string | null;
  marker_response: string | null;
  marker_decision: string | null;
  marker_reviewed_at: string | null;
  admin_response: string | null;
  admin_decision: string | null;
  admin_reviewed_at: string | null;
  created_at: string;
};
