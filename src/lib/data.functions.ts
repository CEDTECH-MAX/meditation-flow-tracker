import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, audit, internalEmail, type Ctx } from "./data.helpers";

/* ---------------------------------- me ---------------------------------- */

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      c.supabase.from("profiles").select("*, cohort:cohorts(id,name,programme,intake_year)").eq("id", c.userId).maybeSingle(),
      c.supabase.from("user_roles").select("role").eq("user_id", c.userId),
    ]);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    return {
      userId: c.userId,
      email: (c.claims?.["email"] as string) ?? null,
      profile: profile ?? null,
      isAdmin,
    };
  });

/* --------------------------------- blocks -------------------------------- */

export const listBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { data, error } = await c.supabase
      .from("blocks")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const blockInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  start_date: z.string().min(10).max(10),
  end_date: z.string().min(10).max(10),
  weeks: z.number().int().min(1).max(52),
  meditation_days: z.number().int().min(1).max(400),
  status: z.enum(["upcoming", "active", "closed"]),
});

export const saveBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => blockInput.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const payload = { ...data };
    delete (payload as any).id;

    if (data.status === "active") {
      await c.supabase.from("blocks").update({ status: "closed" }).eq("status", "active");
    }

    if (data.id) {
      const { error } = await c.supabase.from("blocks").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(c, "update", "block", data.id, payload);
      return { id: data.id };
    }
    const { data: created, error } = await c.supabase
      .from("blocks")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(c, "create", "block", created.id, payload);
    return { id: created.id as string };
  });

export const setBlockStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["upcoming", "active", "closed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    if (data.status === "active") {
      await c.supabase
        .from("blocks")
        .update({ status: "closed" })
        .eq("status", "active")
        .neq("id", data.id);
    }
    const { error } = await c.supabase
      .from("blocks")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "status_change", "block", data.id, { status: data.status });
    return { ok: true };
  });

export const deleteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { error } = await c.supabase.from("blocks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "delete", "block", data.id, {});
    return { ok: true };
  });

export const resetBlockAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { error } = await c.supabase.from("attendance").delete().eq("block_id", data.block_id);
    if (error) throw new Error(error.message);
    await audit(c, "reset", "attendance", data.block_id, { scope: "block" });
    return { ok: true };
  });

/* --------------------------------- cohorts ------------------------------- */

export const listCohorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { data, error } = await c.supabase
      .from("cohorts")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const cohortInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(60),
  programme: z.string().trim().max(120).or(z.literal("")).optional(),
  intake_year: z.number().int().min(2000).max(2100).nullable().optional(),
});

export const saveCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cohortInput.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const payload = {
      name: data.name,
      programme: data.programme || null,
      intake_year: data.intake_year ?? null,
    };
    if (data.id) {
      const { error } = await c.supabase.from("cohorts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(c, "update", "cohort", data.id, payload);
      return { id: data.id };
    }
    const { data: created, error } = await c.supabase
      .from("cohorts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(c, "create", "cohort", created.id, payload);
    return { id: created.id as string };
  });

export const deleteCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { error } = await c.supabase.from("cohorts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "delete", "cohort", data.id, {});
    return { ok: true };
  });

export const assignCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        student_ids: z.array(z.string().uuid()).min(1).max(2000),
        cohort_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { error } = await c.supabase
      .from("profiles")
      .update({ cohort_id: data.cohort_id })
      .in("id", data.student_ids);
    if (error) throw new Error(error.message);
    await audit(c, "assign_cohort", "student", data.cohort_id, {
      cohort_id: data.cohort_id,
      count: data.student_ids.length,
    });
    return { ok: true };
  });

/* -------------------------------- students ------------------------------- */

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { data: adminRows } = await c.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRows ?? []).map((r: any) => r.user_id));
    const { data, error } = await c.supabase
      .from("profiles")
      .select("*")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).filter((p: any) => !adminIds.has(p.id));
  });

const studentInput = z.object({
  full_name: z.string().trim().min(2).max(120),
  student_number: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  photo_url: z.string().trim().url().max(500).or(z.literal("")).optional(),
  cohort_id: z.string().uuid().nullable().optional(),
  programme: z.string().trim().max(120).or(z.literal("")).optional(),
  intake_year: z.number().int().min(2000).max(2100).nullable().optional(),
});


export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => studentInput.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create account");

    const id = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id,
      full_name: data.full_name,
      student_number: data.student_number,
      email: data.email,
      photo_url: data.photo_url || null,
      cohort_id: data.cohort_id ?? null,
      programme: data.programme || null,
      intake_year: data.intake_year ?? null,
      internal_email: internalEmail(data.student_number),
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error(pErr.message);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "student" });
    await audit(c, "create", "student", id, { email: data.email, student_number: data.student_number });
    return { id };
  });

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        full_name: z.string().trim().min(2).max(120),
        student_number: z.string().trim().min(1).max(40),
        photo_url: z.string().trim().url().max(500).or(z.literal("")).optional(),
        password: z.string().min(8).max(72).or(z.literal("")).optional(),
        cohort_id: z.string().uuid().nullable().optional(),
        programme: z.string().trim().max(120).or(z.literal("")).optional(),
        intake_year: z.number().int().min(2000).max(2100).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { error } = await c.supabase
      .from("profiles")
      .update({
        full_name: data.full_name,
        student_number: data.student_number,
        photo_url: data.photo_url || null,
        cohort_id: data.cohort_id ?? null,
        programme: data.programme || null,
        intake_year: data.intake_year ?? null,
        internal_email: internalEmail(data.student_number),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);


    if (data.password) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        password: data.password,
      });
      if (aErr) throw new Error(aErr.message);
    }
    await audit(c, "update", "student", data.id, {
      full_name: data.full_name,
      student_number: data.student_number,
      password_reset: Boolean(data.password),
    });
    return { ok: true };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    await audit(c, "delete", "student", data.id, {});
    return { ok: true };
  });

/* ------------------------------- attendance ------------------------------ */

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { data: rows, error } = await c.supabase
      .from("attendance")
      .select("*")
      .eq("block_id", data.block_id)
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

export const markAttendance = createServerFn({ method: "POST" })
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
    await assertAdmin(c);

    if (data.points === null) {
      const { error } = await c.supabase
        .from("attendance")
        .delete()
        .eq("block_id", data.block_id)
        .eq("student_id", data.student_id)
        .eq("session_date", data.session_date)
        .eq("slot", data.slot);
      if (error) throw new Error(error.message);
      await audit(c, "clear", "attendance", data.student_id, data as any);
      return { ok: true };
    }

    const status = statusFromPoints(data.points, data.absence_reason ?? null);
    const full = data.points === 2;

    const { error } = await c.supabase.from("attendance").upsert(
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
      },
      { onConflict: "block_id,student_id,session_date,slot" },
    );

    if (error) throw new Error(error.message);
    await audit(c, "mark", "attendance", data.student_id, data as any);
    return { ok: true };
  });

export const markDayForAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: z.string().uuid(),
        session_date: z.string().min(10).max(10),
        slot: z.enum(["morning", "afternoon"]),
        points: POINTS,
        student_ids: z.array(z.string().uuid()).min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const status = statusFromPoints(data.points, null);
    const rows = data.student_ids.map((student_id) => ({
      block_id: data.block_id,
      student_id,
      session_date: data.session_date,
      slot: data.slot,
      points: data.points,
      status,
      recorded_by: c.userId,
    }));
    const { error } = await c.supabase
      .from("attendance")
      .upsert(rows, { onConflict: "block_id,student_id,session_date,slot" });
    if (error) throw new Error(error.message);
    await audit(c, "bulk_mark", "attendance", data.block_id, {
      session_date: data.session_date,
      slot: data.slot,
      points: data.points,
      count: rows.length,
    });
    return { ok: true };
  });


/* --------------------------- student self-service ------------------------ */

export const getMyAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const [{ data: profile }, { data: blocks }, { data: records }] = await Promise.all([
      c.supabase.from("profiles").select("*, cohort:cohorts(id,name,programme,intake_year)").eq("id", c.userId).maybeSingle(),
      c.supabase.from("blocks").select("*").order("start_date", { ascending: false }),
      c.supabase
        .from("attendance")
        .select("*")
        .eq("student_id", c.userId)
        .order("session_date", { ascending: false }),
    ]);
    return {
      profile: profile ?? null,
      blocks: blocks ?? [],
      records: records ?? [],
    };
  });

export const getAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { data, error } = await c.supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
