import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, audit, myInstitution, type Ctx } from "./data.helpers";

const uuid = z.string().uuid();

/* ----------------------------- class sessions ---------------------------- */

export const listClassSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { data: rows, error } = await c.supabase
      .from("class_sessions")
      .select("*")
      .eq("block_id", data.block_id)
      .order("session_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveClassSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        block_id: uuid,
        session_date: z.string().min(10).max(10),
        title: z.string().trim().min(2).max(120),
        lecturer: z.string().trim().max(120).or(z.literal("")).optional(),
        max_points: z.number().min(0.5).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const payload = {
      block_id: data.block_id,
      session_date: data.session_date,
      title: data.title,
      lecturer: data.lecturer || null,
      max_points: data.max_points,
      created_by: c.userId,
    };
    if (data.id) {
      const { error } = await c.supabase.from("class_sessions").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(c, "update", "class_session", data.id, payload);
      return { id: data.id };
    }
    const { data: created, error } = await c.supabase
      .from("class_sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(c, "create", "class_session", created.id, payload);
    return { id: created.id as string };
  });

export const deleteClassSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const { error } = await c.supabase.from("class_sessions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(c, "delete", "class_session", data.id, {});
    return { ok: true };
  });

/* ---------------------------- class attendance --------------------------- */

export const listClassAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { data: sessions, error: sErr } = await c.supabase
      .from("class_sessions")
      .select("id")
      .eq("block_id", data.block_id);
    if (sErr) throw new Error(sErr.message);
    const ids = (sessions ?? []).map((s: any) => s.id);
    if (ids.length === 0) return [];
    const { data: rows, error } = await c.supabase
      .from("class_attendance")
      .select("*")
      .in("session_id", ids);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markClassAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: uuid,
        student_id: uuid,
        points: z.number().min(0).max(20).nullable(),
        mode: z.enum(["online", "physical"]),
        comment: z.string().trim().max(600).or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);

    if (data.points === null) {
      const { error } = await c.supabase
        .from("class_attendance")
        .delete()
        .eq("session_id", data.session_id)
        .eq("student_id", data.student_id);
      if (error) throw new Error(error.message);
      await audit(c, "clear", "class_attendance", data.student_id, data as any);
      return { ok: true };
    }

    const { error } = await c.supabase.from("class_attendance").upsert(
      {
        session_id: data.session_id,
        student_id: data.student_id,
        points: data.points,
        mode: data.mode,
        comment: data.comment || null,
        recorded_by: c.userId,
      },
      { onConflict: "session_id,student_id" },
    );
    if (error) throw new Error(error.message);
    await audit(c, "mark", "class_attendance", data.student_id, data as any);
    return { ok: true };
  });

/* --------------------------- student self-service ------------------------ */

export const getMyClassAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const inst = await myInstitution(c);
    const { data: blocks } = await c.supabase
      .from("blocks")
      .select("*")
      .eq("institution", inst)
      .order("start_date", { ascending: false });

    const blockIds = (blocks ?? []).map((b: any) => b.id);
    if (blockIds.length === 0) return { institution: inst, blocks: [], sessions: [], records: [] };

    const { data: sessions } = await c.supabase
      .from("class_sessions")
      .select("*")
      .in("block_id", blockIds)
      .order("session_date", { ascending: true });

    const { data: records } = await c.supabase
      .from("class_attendance")
      .select("*")
      .eq("student_id", c.userId);

    return {
      institution: inst,
      blocks: blocks ?? [],
      sessions: sessions ?? [],
      records: records ?? [],
    };
  });
