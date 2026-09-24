import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, audit, statusFromPoints, type Ctx } from "./data.helpers";

/**
 * Markers are staff accounts that may only ever mark the students of the
 * cohort(s) an administrator assigned to them, inside their own institution.
 *
 * Every function in this file re-derives the marker's institution and cohorts
 * from their own account on the server. Nothing the browser sends can widen
 * that scope: cohort ids, block ids and student ids coming from the client are
 * always validated against the scope before anything is read or written.
 */

type MarkerScope = {
  markerId: string;
  institution: "MII" | "MIU";
  cohortIds: string[];
};

async function markerScope(c: Ctx): Promise<MarkerScope> {
  const { data: isMarker } = await c.supabase.rpc("has_role_text", {
    _user_id: c.userId,
    _role: "marker",
  });
  if (!isMarker) throw new Error("Forbidden: markers only");

  const { data: profile } = await c.supabase
    .from("profiles")
    .select("institution, is_active")
    .eq("id", c.userId)
    .maybeSingle();
  if (!profile || profile.is_active === false) throw new Error("This marker account is inactive");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: assignments } = await supabaseAdmin
    .from("marker_assignments")
    .select("cohort_id")
    .eq("marker_id", c.userId)
    .eq("is_active", true);

  const cohortIds = [
    ...new Set((assignments ?? []).map((a: any) => a.cohort_id).filter(Boolean) as string[]),
  ];
  if (cohortIds.length === 0) throw new Error("No cohort has been assigned to this marker yet");

  return {
    markerId: c.userId,
    institution: (profile.institution as "MII" | "MIU") ?? "MII",
    cohortIds,
  };
}

/**
 * Blocks the marker is allowed to work in: own institution, and either one of
 * their assigned cohorts or an institution-wide block (no cohort attached).
 */
async function scopedBlocks(scope: MarkerScope) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cohortList = `(${scope.cohortIds.join(",")})`;
  const { data } = await supabaseAdmin
    .from("blocks")
    .select("*")
    .eq("institution", scope.institution)
    .or(`cohort_id.is.null,cohort_id.in.${cohortList}`)
    .order("start_date", { ascending: false });
  return data ?? [];
}

async function touchPresence(
  c: Ctx,
  activity: string,
  blockId: string | null,
  cohortId: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("marker_presence").upsert(
    {
      marker_id: c.userId,
      activity,
      current_block_id: blockId,
      current_cohort_id: cohortId,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "marker_id" },
  );
}

/** Today's date in the institutions' timezone (South Africa). */
function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Past days are locked for markers. An administrator may unlock a specific day
 * for a marker (or their whole cohort); those grants live in marking_unlocks.
 */
async function unlockedDates(scope: MarkerScope, blockId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("marking_unlocks")
    .select("session_date, marker_id, cohort_id, expires_at")
    .eq("block_id", blockId);
  return [
    ...new Set(
      (data ?? [])
        .filter((u: any) => !u.expires_at || u.expires_at > nowIso)
        .filter(
          (u: any) =>
            u.marker_id === scope.markerId ||
            (u.cohort_id && scope.cohortIds.includes(u.cohort_id)) ||
            (!u.marker_id && !u.cohort_id),
        )
        .map((u: any) => u.session_date as string),
    ),
  ];
}

/** Which session dates this marker may still write to, for one block. */
export const getMarkerDayAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const scope = await markerScope(c);
    const blocks = await scopedBlocks(scope);
    if (!blocks.some((b: any) => b.id === data.block_id))
      throw new Error("Forbidden: this block is outside your assigned cohort");
    return { today: localToday(), unlocked: await unlockedDates(scope, data.block_id) };
  });

/* ------------------------------ marker portal ----------------------------- */

export const getMarkerScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const scope = await markerScope(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile }, { data: cohorts }, blocks] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, email, staff_id").eq("id", c.userId).maybeSingle(),
      supabaseAdmin.from("cohorts").select("id, name, programme, intake_year").in("id", scope.cohortIds),
      scopedBlocks(scope),
    ]);

    const { data: students } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, student_number, cohort_id, gender, classification")
      .eq("institution", scope.institution)
      .in("cohort_id", scope.cohortIds)
      .order("full_name", { ascending: true });

    await touchPresence(c, "opened portal", null, scope.cohortIds[0] ?? null);

    return {
      markerId: scope.markerId,
      name: (profile as any)?.full_name ?? "",
      email: (profile as any)?.email ?? null,
      institution: scope.institution,
      cohorts: cohorts ?? [],
      blocks,
      students: students ?? [],
    };
  });

export const listMarkerAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const scope = await markerScope(c);
    const blocks = await scopedBlocks(scope);
    if (!blocks.some((b: any) => b.id === data.block_id))
      throw new Error("Forbidden: this block is outside your assigned cohort");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: studentRows } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("institution", scope.institution)
      .in("cohort_id", scope.cohortIds);
    const ids = (studentRows ?? []).map((s: any) => s.id);
    if (ids.length === 0) return [];

    const { data: rows, error } = await supabaseAdmin
      .from("attendance")
      .select("*")
      .eq("block_id", data.block_id)
      .in("student_id", ids)
      .order("session_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const POINTS = z.union([
  z.literal(0),
  z.literal(0.5),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
]);

export const markAsMarker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: z.string().uuid(),
        student_id: z.string().uuid(),
        session_date: z.string().min(10).max(10),
        slot: z.enum(["morning", "afternoon"]),
        points: POINTS.nullable(),
        absence_reason: z
          .enum(["sick_leave", "approved_leave", "late_arrival", "unexcused", "other"])
          .nullable()
          .optional(),
        absence_note: z.string().trim().max(400).or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pause } = await supabaseAdmin
      .from("system_controls")
      .select("enabled")
      .eq("key", "disable_marking")
      .maybeSingle();
    if (pause?.enabled) {
      throw new Error("Marking is temporarily paused. Please try again later.");
    }
    const scope = await markerScope(c);


    const blocks = await scopedBlocks(scope);
    const block = blocks.find((b: any) => b.id === data.block_id);
    if (!block) {
      await audit(c, "denied", "attendance", data.student_id, {
        reason: "block outside marker scope",
        block_id: data.block_id,
      });
      throw new Error("Forbidden: this block is outside your assigned cohort");
    }
    if ((block as any).status === "closed") throw new Error("This block is closed");

    const today = localToday();
    if (data.session_date !== today) {
      const open = await unlockedDates(scope, data.block_id);
      if (!open.includes(data.session_date)) {
        await audit(c, "denied", "attendance", data.student_id, {
          reason: data.session_date > today ? "future day" : "day locked",
          block_id: data.block_id,
          session_date: data.session_date,
        });
        throw new Error(
          data.session_date > today
            ? "You can only mark today's sessions."
            : "That day is closed. Ask your administrator to unlock it before marking again.",
        );
      }
    }

    const { data: allowed } = await c.supabase.rpc("marker_can_mark_student", {
      _marker_id: c.userId,
      _student_id: data.student_id,
      _block_id: data.block_id,
    });
    if (!allowed) {
      await audit(c, "denied", "attendance", data.student_id, {
        reason: "student outside marker scope",
        block_id: data.block_id,
      });
      throw new Error("Forbidden: this student is outside your assigned cohort");
    }


    if (data.points === null) {
      const { error } = await supabaseAdmin
        .from("attendance")
        .delete()
        .eq("block_id", data.block_id)
        .eq("student_id", data.student_id)
        .eq("session_date", data.session_date)
        .eq("slot", data.slot);
      if (error) throw new Error(error.message);
      await audit(c, "clear", "attendance", data.student_id, data as any);
      await touchPresence(c, "marking", data.block_id, (block as any).cohort_id ?? null);
      return { ok: true };
    }

    const status = statusFromPoints(data.points, data.absence_reason ?? null);
    const full = data.points === 2;

    const { error } = await supabaseAdmin.from("attendance").upsert(
      {
        block_id: data.block_id,
        student_id: data.student_id,
        session_date: data.session_date,
        slot: data.slot,
        points: data.points,
        status,
        absence_reason: full ? null : (data.absence_reason ?? null),
        absence_note: full ? null : data.absence_note || null,
        recorded_by: c.userId,
        marked_at: new Date().toISOString(),
      },
      { onConflict: "block_id,student_id,session_date,slot" },
    );
    if (error) throw new Error(error.message);

    await audit(c, "mark", "attendance", data.student_id, data as any);
    await touchPresence(c, "marking", data.block_id, (block as any).cohort_id ?? null);
    return { ok: true };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(c.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- admin side ------------------------------ */

export const listAllCohorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("cohorts")
      .select("id, name, institution")
      .order("name", { ascending: true });
    return data ?? [];
  });

export const listMarkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "marker");
    const ids = (roleRows ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];

    const [{ data: profiles }, { data: assignments }, { data: presence }, { data: cohorts }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, institution, is_active, job_title, staff_id")
          .in("id", ids),
        supabaseAdmin.from("marker_assignments").select("*").in("marker_id", ids),
        supabaseAdmin.from("marker_presence").select("*").in("marker_id", ids),
        supabaseAdmin.from("cohorts").select("id, name, institution"),
      ]);

    const cohortName = new Map((cohorts ?? []).map((x: any) => [x.id, x.name]));

    return (profiles ?? [])
      .map((p: any) => {
        const mine = (assignments ?? []).filter((a: any) => a.marker_id === p.id && a.is_active);
        const seen = (presence ?? []).find((x: any) => x.marker_id === p.id);
        return {
          id: p.id as string,
          full_name: p.full_name as string,
          email: (p.email as string | null) ?? null,
          institution: (p.institution as "MII" | "MIU") ?? "MII",
          is_active: p.is_active !== false,
          cohort_ids: mine.map((a: any) => a.cohort_id).filter(Boolean) as string[],
          cohort_names: mine
            .map((a: any) => cohortName.get(a.cohort_id))
            .filter(Boolean) as string[],
          last_seen_at: (seen?.last_seen_at as string | null) ?? null,
          activity: (seen?.activity as string | null) ?? null,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  });

const markerInput = z.object({
  first_name: z.string().trim().min(1).max(60),
  surname: z.string().trim().min(1).max(60),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email("Please enter a complete email address, for example rifumo@example.com"),
  password: z.string().min(8).max(72),
  institution: z.enum(["MII", "MIU"]),
  cohort_id: z.string().uuid(),
});

export const createMarker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markerInput.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cohort } = await supabaseAdmin
      .from("cohorts")
      .select("id, institution")
      .eq("id", data.cohort_id)
      .maybeSingle();
    if (!cohort || (cohort as any).institution !== data.institution)
      throw new Error("That cohort does not belong to the chosen institution");

    const full_name = `${data.first_name} ${data.surname}`.trim();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create account");
    const id = created.user.id;

    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id,
      full_name,
      email: data.email,
      institution: data.institution,
      cohort_id: data.cohort_id,
      job_title: "Marker",
      is_active: true,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error(pErr.message);
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "marker" });
    await supabaseAdmin.from("marker_assignments").insert({
      marker_id: id,
      cohort_id: data.cohort_id,
      is_active: true,
    });

    await audit(c, "create", "marker", id, {
      email: data.email,
      institution: data.institution,
      cohort_id: data.cohort_id,
    });
    return { id };
  });

export const updateMarker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        first_name: z.string().trim().min(1).max(60),
        surname: z.string().trim().min(1).max(60),
        cohort_id: z.string().uuid(),
        email: z.string().trim().toLowerCase().max(255).email("Please enter a complete email address, for example name@example.com").optional(),
        password: z.string().min(8).max(72).or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: marker } = await supabaseAdmin
      .from("profiles")
      .select("institution")
      .eq("id", data.id)
      .maybeSingle();
    const { data: cohort } = await supabaseAdmin
      .from("cohorts")
      .select("institution")
      .eq("id", data.cohort_id)
      .maybeSingle();
    if (!marker || !cohort || (marker as any).institution !== (cohort as any).institution)
      throw new Error("That cohort does not belong to this marker's institution");

    const full_name = `${data.first_name} ${data.surname}`.trim();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name, cohort_id: data.cohort_id })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("marker_assignments").delete().eq("marker_id", data.id);
    await supabaseAdmin
      .from("marker_assignments")
      .insert({ marker_id: data.id, cohort_id: data.cohort_id, is_active: true });
    await changeAccountEmail(c, data.id, data.email);

    if (data.password) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        password: data.password,
      });
      if (aErr) throw new Error(aErr.message);
    }

    await audit(c, "update", "marker", data.id, {
      full_name,
      cohort_id: data.cohort_id,
      password_reset: Boolean(data.password),
    });
    return { ok: true };
  });

export const setMarkerActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ is_active: data.is_active }).eq("id", data.id);
    await supabaseAdmin
      .from("marker_assignments")
      .update({ is_active: data.is_active })
      .eq("marker_id", data.id);
    await audit(c, "status_change", "marker", data.id, { is_active: data.is_active });
    return { ok: true };
  });

export const deleteMarker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    await audit(c, "delete", "marker", data.id, {});
    return { ok: true };
  });

/** Marking progress per marker for one session (block + date + slot). */
export const markerProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: z.string().uuid(),
        session_date: z.string().min(10).max(10),
        slot: z.enum(["morning", "afternoon"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "marker");
    const markerIds = (roleRows ?? []).map((r: any) => r.user_id);
    if (markerIds.length === 0) return [];

    const [{ data: assignments }, { data: markerProfiles }, { data: attendance }] = await Promise.all([
      supabaseAdmin
        .from("marker_assignments")
        .select("marker_id, cohort_id")
        .eq("is_active", true)
        .in("marker_id", markerIds),
      supabaseAdmin.from("profiles").select("id, institution").in("id", markerIds),
      supabaseAdmin
        .from("attendance")
        .select("student_id, recorded_by, marked_at")
        .eq("block_id", data.block_id)
        .eq("session_date", data.session_date)
        .eq("slot", data.slot),
    ]);

    const instOf = new Map((markerProfiles ?? []).map((p: any) => [p.id, p.institution]));
    const cohortIdsByMarker = new Map<string, string[]>();
    for (const a of assignments ?? []) {
      if (!a.cohort_id) continue;
      const list = cohortIdsByMarker.get(a.marker_id) ?? [];
      list.push(a.cohort_id);
      cohortIdsByMarker.set(a.marker_id, list);
    }

    const allCohortIds = [...new Set([...cohortIdsByMarker.values()].flat())];
    const { data: students } = allCohortIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, cohort_id, institution")
          .in("cohort_id", allCohortIds)
      : { data: [] as any[] };

    const markedIds = new Set((attendance ?? []).map((r: any) => r.student_id));

    return markerIds.map((markerId: string) => {
      const cohortIds = cohortIdsByMarker.get(markerId) ?? [];
      const inst = instOf.get(markerId);
      const assigned = (students ?? []).filter(
        (s: any) => cohortIds.includes(s.cohort_id) && s.institution === inst,
      );
      const marked = assigned.filter((s: any) => markedIds.has(s.id)).length;
      const lastMark = (attendance ?? [])
        .filter((r: any) => r.recorded_by === markerId)
        .map((r: any) => r.marked_at as string | null)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        marker_id: markerId,
        assigned: assigned.length,
        marked,
        remaining: Math.max(0, assigned.length - marked),
        last_marked_at: (lastMark as string | undefined) ?? null,
      };
    });
  });

/* --------------------------- admin: day unlocking -------------------------- */

export const listMarkingUnlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("marking_unlocks")
      .select("id, session_date, marker_id, cohort_id, expires_at, note, created_at")
      .eq("block_id", data.block_id)
      .order("session_date", { ascending: false });
    if (error) throw new Error(error.message);

    const markerIds = [...new Set((rows ?? []).map((r: any) => r.marker_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (markerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", markerIds as string[]);
      for (const p of profiles ?? []) names.set((p as any).id, (p as any).full_name);
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      marker_name: r.marker_id ? (names.get(r.marker_id) ?? "Marker") : null,
      expired: Boolean(r.expires_at && r.expires_at < new Date().toISOString()),
    }));
  });

export const grantMarkingUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: z.string().uuid(),
        session_date: z.string().min(10).max(10),
        marker_id: z.string().uuid().nullable().optional(),
        hours: z.number().int().min(1).max(168).default(24),
        note: z.string().trim().max(300).or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expires = new Date(Date.now() + data.hours * 3600_000).toISOString();
    const { error } = await supabaseAdmin.from("marking_unlocks").insert({
      block_id: data.block_id,
      session_date: data.session_date,
      marker_id: data.marker_id ?? null,
      expires_at: expires,
      note: data.note || null,
      granted_by: c.userId,
    });
    if (error) throw new Error(error.message);
    await audit(c, "unlock", "attendance", data.block_id, data as any);
    return { ok: true, expires_at: expires };
  });

export const revokeMarkingUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("marking_unlocks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "lock", "attendance", data.id, {});
    return { ok: true };
  });
