import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Ctx } from "./data.helpers";

/**
 * Developer / super-admin oversight.
 *
 * Every function here re-checks on the server that the caller holds the
 * `developer` role before touching anything, and writes an immutable audit
 * event for any action that changes state. Platform-wide (MII + MIU) reads use
 * the service-role client *after* that check, so no existing RLS policy or
 * institution isolation is weakened for any other role.
 *
 * Passwords, tokens and session secrets are never written to audit or event
 * records.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

type Dev = { userId: string; email: string | null };

async function requireDeveloper(context: unknown): Promise<Dev> {
  const c = context as unknown as Ctx;
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", c.userId)
    .eq("role", "developer")
    .maybeSingle();
  const email = (c.claims?.["email"] as string) ?? null;
  if (!data) {
    await db.from("security_events").insert({
      user_id: c.userId,
      email,
      kind: "permission_denied",
      severity: "warning",
      detail: "Attempted to use a developer-only function without the developer role.",
    });
    throw new Error("Forbidden: developer access only");
  }
  return { userId: c.userId, email };
}

async function devAudit(
  dev: Dev,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  const db = await admin();
  await db.from("audit_logs").insert({
    actor_id: dev.userId,
    actor_email: dev.email,
    action: `developer:${action}`,
    entity,
    entity_id: entityId,
    details,
  });
}

async function authAdminFetch(path: string, init: RequestInit = {}) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("The backend is not configured for administrative actions.");
  const res = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Authentication service error (${res.status})`);
  return res.status === 204 ? null : await res.json().catch(() => null);
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const sinceIso = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

/* --------------------------------- who am I -------------------------------- */

export const getDeveloperMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const db = await admin();
    const { data } = await db.from("user_roles").select("role").eq("user_id", c.userId);
    const roles = (data ?? []).map((r: any) => String(r.role));
    return {
      userId: c.userId,
      email: (c.claims?.["email"] as string) ?? null,
      isDeveloper: roles.includes("developer"),
      roles,
    };
  });

/* --------------------------------- overview -------------------------------- */

export const devOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const [profiles, roles, attendanceToday, classToday, failed, appeals, emails, errors, presence, controls] =
      await Promise.all([
        db.from("profiles").select("id, institution, is_active"),
        db.from("user_roles").select("user_id, role"),
        db.from("attendance").select("id", { count: "exact", head: true }).eq("session_date", todayIso()),
        db.from("class_attendance").select("id", { count: "exact", head: true }).gte("created_at", sinceIso(24)),
        db
          .from("auth_events")
          .select("id", { count: "exact", head: true })
          .eq("succeeded", false)
          .gte("created_at", sinceIso(24)),
        db.from("attendance_appeals").select("status"),
        db.from("email_events").select("status"),
        db
          .from("security_events")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null),
        db.from("marker_presence").select("marker_id, last_seen_at").gte("last_seen_at", sinceIso(1)),
        db.from("system_controls").select("*").order("label"),
      ]);

    const roleOf = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      const list = roleOf.get(r.user_id) ?? [];
      list.push(String(r.role));
      roleOf.set(r.user_id, list);
    }
    const count = (inst: string | null, role?: string) =>
      (profiles.data ?? []).filter(
        (p: any) =>
          (inst === null || p.institution === inst) &&
          (!role || (roleOf.get(p.id) ?? []).includes(role)),
      ).length;

    const appealRows = appeals.data ?? [];
    const emailRows = emails.data ?? [];
    const tally = (rows: any[], key: string, value: string) =>
      rows.filter((r) => r[key] === value).length;

    return {
      users: {
        total: count(null),
        mii: count("MII"),
        miu: count("MIU"),
        students: count(null, "student"),
        admins: count(null, "admin"),
        markers: count(null, "marker"),
        staff: count(null, "staff"),
        inactive: (profiles.data ?? []).filter((p: any) => p.is_active === false).length,
      },
      activity: {
        attendanceToday: attendanceToday.count ?? 0,
        classMarks24h: classToday.count ?? 0,
        activeMarkers: (presence.data ?? []).length,
        failedLogins24h: failed.count ?? 0,
      },
      appeals: {
        total: appealRows.length,
        open: appealRows.filter((a: any) => ["submitted", "reviewed", "referred"].includes(a.status)).length,
      },
      emails: {
        total: emailRows.length,
        failed: tally(emailRows, "status", "failed") + tally(emailRows, "status", "bounced"),
        pending: tally(emailRows, "status", "pending"),
      },
      openSecurityEvents: errors.count ?? 0,
      controls: controls.data ?? [],
    };
  });

/* -------------------------------- global search ---------------------------- */

export const devSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const like = `%${data.q}%`;
    const [people, cohorts, blocks, appeals, audits, attendance] = await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, email, student_number, staff_id, institution, is_active, cohort:cohorts(name)")
        .or(
          `full_name.ilike.${like},email.ilike.${like},student_number.ilike.${like},staff_id.ilike.${like}`,
        )
        .limit(25),
      db.from("cohorts").select("id, name, programme, intake_year, institution").ilike("name", like).limit(15),
      db.from("blocks").select("id, name, start_date, end_date, status, institution").ilike("name", like).limit(15),
      db
        .from("attendance_appeals")
        .select("id, session_date, slot, status, reason, institution, student:profiles!attendance_appeals_student_id_fkey(full_name)")
        .or(`reason.ilike.${like},comment.ilike.${like}`)
        .limit(15),
      db
        .from("audit_logs")
        .select("id, action, entity, entity_id, actor_email, created_at")
        .or(`action.ilike.${like},entity.ilike.${like},actor_email.ilike.${like},entity_id.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(25),
      db
        .from("attendance")
        .select("id, session_date, slot, points, status, student:profiles(full_name, institution)")
        .limit(0),
    ]);
    return {
      people: people.data ?? [],
      cohorts: cohorts.data ?? [],
      blocks: blocks.data ?? [],
      appeals: appeals.data ?? [],
      audits: audits.data ?? [],
      attendance: attendance.data ?? [],
    };
  });

/* ------------------------------ users & accounts --------------------------- */

export const devUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().max(120).optional(),
        institution: z.enum(["MII", "MIU", "all"]).default("all"),
        role: z.string().max(30).default("all"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireDeveloper(context);
    const db = await admin();
    let query = db
      .from("profiles")
      .select("id, full_name, email, student_number, staff_id, institution, is_active, job_title, cohort:cohorts(id,name)")
      .order("full_name")
      .limit(300);
    if (data.institution !== "all") query = query.eq("institution", data.institution);
    if (data.q) {
      const like = `%${data.q}%`;
      query = query.or(`full_name.ilike.${like},email.ilike.${like},student_number.ilike.${like}`);
    }
    const [{ data: people }, { data: roles }, { data: events }] = await Promise.all([
      query,
      db.from("user_roles").select("user_id, role"),
      db
        .from("auth_events")
        .select("user_id, email, succeeded, created_at")
        .gte("created_at", sinceIso(24 * 30))
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const roleOf = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = roleOf.get(r.user_id) ?? [];
      list.push(String(r.role));
      roleOf.set(r.user_id, list);
    }
    const lastLogin = new Map<string, string>();
    const failedCount = new Map<string, number>();
    for (const e of events ?? []) {
      const key = (e.user_id as string) ?? (e.email as string) ?? "";
      if (!key) continue;
      if (e.succeeded && !lastLogin.has(key)) lastLogin.set(key, e.created_at);
      if (!e.succeeded) failedCount.set(key, (failedCount.get(key) ?? 0) + 1);
    }

    const rows = (people ?? [])
      .map((p: any) => ({
        ...p,
        roles: roleOf.get(p.id) ?? [],
        last_login: lastLogin.get(p.id) ?? lastLogin.get(p.email) ?? null,
        failed_logins: failedCount.get(p.id) ?? failedCount.get(p.email) ?? 0,
      }))
      .filter((p: any) => (data.role === "all" ? true : p.roles.includes(data.role)));
    return rows;
  });

export const devUserAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        action: z.enum(["activate", "deactivate", "force_logout", "reset_password"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: before } = await db
      .from("profiles")
      .select("id, full_name, email, is_active, institution")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!before) throw new Error("That account no longer exists.");

    let result = "";
    let tempPassword: string | null = null;

    if (data.action === "activate" || data.action === "deactivate") {
      const is_active = data.action === "activate";
      const { error } = await db.from("profiles").update({ is_active }).eq("id", data.user_id);
      if (error) throw new Error(error.message);
      result = is_active ? "Account activated" : "Account deactivated";
    }

    if (data.action === "force_logout") {
      await authAdminFetch(`/admin/users/${data.user_id}/sessions`, { method: "DELETE" });
      result = "All sessions revoked";
    }

    if (data.action === "reset_password") {
      tempPassword = `MI-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
      await authAdminFetch(`/admin/users/${data.user_id}`, {
        method: "PUT",
        body: JSON.stringify({ password: tempPassword }),
      });
      await authAdminFetch(`/admin/users/${data.user_id}/sessions`, { method: "DELETE" }).catch(() => null);
      result = "Temporary password set";
    }

    // Never log the password itself.
    await devAudit(dev, data.action, "account", data.user_id, {
      person: before.full_name,
      email: before.email,
      institution: before.institution,
      before: { is_active: before.is_active },
      result,
      reason: data.reason ?? null,
    });
    return { result, tempPassword };
  });

/* ------------------------------ security centre ---------------------------- */

export const devSecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const [{ data: failures }, { data: events }] = await Promise.all([
      db
        .from("auth_events")
        .select("*")
        .eq("succeeded", false)
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("security_events").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    const byEmail = new Map<string, number>();
    for (const f of failures ?? []) {
      const key = String(f.email ?? "unknown").toLowerCase();
      byEmail.set(key, (byEmail.get(key) ?? 0) + 1);
    }
    const lockouts = [...byEmail.entries()]
      .filter(([, n]) => n >= 5)
      .map(([email, attempts]) => ({ email, attempts }))
      .sort((a, b) => b.attempts - a.attempts);
    return { failures: failures ?? [], events: events ?? [], lockouts };
  });

export const devResolveSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    await db.from("security_events").update({ resolved_at: new Date().toISOString() }).eq("id", data.id);
    await devAudit(dev, "resolve_security_event", "security_event", data.id, {});
    return { ok: true };
  });

/* --------------------------------- audit log ------------------------------- */

export const devAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().max(120).optional(), limit: z.number().int().min(10).max(500).default(200) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireDeveloper(context);
    const db = await admin();
    let query = db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.q) {
      const like = `%${data.q}%`;
      query = query.or(`action.ilike.${like},entity.ilike.${like},actor_email.ilike.${like},entity_id.ilike.${like}`);
    }
    const [{ data: logs }, { data: signIns }] = await Promise.all([
      query,
      db.from("auth_events").select("*").order("created_at", { ascending: false }).limit(data.limit),
    ]);
    return { logs: logs ?? [], signIns: signIns ?? [] };
  });

/* --------------------------- permission inspector -------------------------- */

export const devPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const [{ data: profile }, { data: roles }, { data: assignments }] = await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, email, institution, is_active, job_title, cohort:cohorts(id,name)")
        .eq("id", data.user_id)
        .maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", data.user_id),
      db
        .from("marker_assignments")
        .select("id, is_active, classification, gender, cohort:cohorts(id,name), block:blocks(id,name)")
        .eq("marker_id", data.user_id),
    ]);
    if (!profile) throw new Error("That account no longer exists.");
    const roleList = (roles ?? []).map((r: any) => String(r.role));
    const institution = profile.institution as string;

    const cohortIds = [
      ...new Set(
        (assignments ?? [])
          .filter((a: any) => a.is_active)
          .map((a: any) => a.cohort?.id)
          .filter(Boolean),
      ),
    ] as string[];

    const scopeCohorts = roleList.includes("admin")
      ? (await db.from("cohorts").select("id,name").eq("institution", institution)).data ?? []
      : roleList.includes("marker")
        ? (assignments ?? []).filter((a: any) => a.is_active && a.cohort).map((a: any) => a.cohort)
        : profile.cohort
          ? [profile.cohort]
          : [];

    let blocks: any[] = [];
    if (roleList.includes("admin")) {
      blocks = (await db.from("blocks").select("id,name,status").eq("institution", institution)).data ?? [];
    } else if (cohortIds.length) {
      blocks =
        (
          await db
            .from("blocks")
            .select("id,name,status")
            .eq("institution", institution)
            .or(`cohort_id.is.null,cohort_id.in.(${cohortIds.join(",")})`)
        ).data ?? [];
    } else if (profile.cohort?.id) {
      blocks =
        (
          await db
            .from("blocks")
            .select("id,name,status")
            .eq("institution", institution)
            .or(`cohort_id.is.null,cohort_id.eq.${profile.cohort.id}`)
        ).data ?? [];
    }

    let studentCount = 0;
    if (roleList.includes("admin")) {
      const { count } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("institution", institution);
      studentCount = count ?? 0;
    } else if (cohortIds.length) {
      const { count } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("institution", institution)
        .in("cohort_id", cohortIds);
      studentCount = count ?? 0;
    } else {
      studentCount = 1;
    }

    const abilities = [
      roleList.includes("developer") && "Platform-wide oversight of MII and MIU (developer portal)",
      roleList.includes("admin") && `Full administration inside ${institution} only`,
      roleList.includes("marker") && "Mark today's meditation sessions for assigned cohorts only",
      roleList.includes("student") && "View own attendance, appeal a session, review a session",
      roleList.includes("staff") && "Internal mail and own password only",
      "Internal mail inside own institution",
    ].filter(Boolean) as string[];

    return {
      profile,
      roles: roleList,
      institution,
      assignments: assignments ?? [],
      cohorts: scopeCohorts,
      blocks,
      studentCount,
      abilities,
    };
  });

/* -------------------------------- support view ----------------------------- */

export const devStartSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        reason: z.string().trim().min(5).max(300),
        minutes: z.number().int().min(5).max(240).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const expires_at = new Date(Date.now() + data.minutes * 60_000).toISOString();
    const { data: row, error } = await db
      .from("support_sessions")
      .insert({
        developer_id: dev.userId,
        target_user_id: data.user_id,
        reason: data.reason,
        read_only: true,
        expires_at,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await devAudit(dev, "support_session_start", "account", data.user_id, {
      reason: data.reason,
      minutes: data.minutes,
      read_only: true,
    });
    return row;
  });

export const devEndSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    await db.from("support_sessions").update({ ended_at: new Date().toISOString() }).eq("id", data.id);
    await devAudit(dev, "support_session_end", "support_session", data.id, {});
    return { ok: true };
  });

export const devSupportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: session } = await db
      .from("support_sessions")
      .select("*")
      .eq("id", data.session_id)
      .eq("developer_id", dev.userId)
      .maybeSingle();
    if (!session) throw new Error("That support session does not exist.");
    if (session.ended_at) throw new Error("That support session has been closed.");
    if (new Date(session.expires_at).getTime() < Date.now())
      throw new Error("That support session has expired. Start a new one if you still need it.");

    const [{ data: profile }, { data: roles }, { data: attendance }, { data: classMarks }, { data: appeals }] =
      await Promise.all([
        db
          .from("profiles")
          .select("id, full_name, email, internal_email, student_number, institution, is_active, cohort:cohorts(id,name)")
          .eq("id", session.target_user_id)
          .maybeSingle(),
        db.from("user_roles").select("role").eq("user_id", session.target_user_id),
        db
          .from("attendance")
          .select("session_date, slot, points, status, absence_reason, block:blocks(name)")
          .eq("student_id", session.target_user_id)
          .order("session_date", { ascending: false })
          .limit(60),
        db
          .from("class_attendance")
          .select("points, mode, comment, session:class_sessions(session_date, title)")
          .eq("student_id", session.target_user_id)
          .limit(60),
        db
          .from("attendance_appeals")
          .select("session_date, slot, status, reason, marker_decision, admin_decision")
          .eq("student_id", session.target_user_id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    await devAudit(dev, "support_view_read", "account", session.target_user_id, {
      support_session: session.id,
      read_only: true,
    });

    return {
      session,
      profile: profile ?? null,
      roles: (roles ?? []).map((r: any) => String(r.role)),
      attendance: attendance ?? [],
      classMarks: classMarks ?? [],
      appeals: appeals ?? [],
    };
  });

export const devSupportSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data } = await db
      .from("support_sessions")
      .select("*, target:profiles!support_sessions_target_user_id_fkey(full_name, email)")
      .eq("developer_id", dev.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  });

/* ------------------------------- data integrity ---------------------------- */

export const devIntegrity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const [profiles, roles, cohorts, blocks, attendance, assignments, classSessions, classMarks] =
      await Promise.all([
        db.from("profiles").select("id, full_name, email, institution, cohort_id, is_active"),
        db.from("user_roles").select("user_id, role"),
        db.from("cohorts").select("id, name, institution"),
        db.from("blocks").select("id, name, institution, cohort_id, start_date, end_date"),
        db.from("attendance").select("id, student_id, block_id, session_date, slot").limit(20000),
        db.from("marker_assignments").select("id, marker_id, cohort_id, classification, gender, is_active"),
        db.from("class_sessions").select("id, block_id, session_date"),
        db.from("class_attendance").select("id, session_id, student_id").limit(20000),
      ]);

    const roleOf = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      const list = roleOf.get(r.user_id) ?? [];
      list.push(String(r.role));
      roleOf.set(r.user_id, list);
    }
    const cohortById = new Map<string, any>((cohorts.data ?? []).map((c: any) => [c.id, c]));
    const blockById = new Map<string, any>((blocks.data ?? []).map((b: any) => [b.id, b]));
    const profileById = new Map<string, any>((profiles.data ?? []).map((p: any) => [p.id, p]));
    const sessionById = new Map<string, any>((classSessions.data ?? []).map((s: any) => [s.id, s]));

    const issues: { kind: string; severity: "error" | "warning"; label: string; items: string[] }[] = [];
    const push = (kind: string, severity: "error" | "warning", label: string, items: string[]) => {
      if (items.length) issues.push({ kind, severity, label, items: items.slice(0, 50) });
    };

    push(
      "no_role",
      "warning",
      "Accounts with no role assigned",
      (profiles.data ?? [])
        .filter((p: any) => (roleOf.get(p.id) ?? []).length === 0)
        .map((p: any) => `${p.full_name} · ${p.email ?? "no email"}`),
    );
    push(
      "no_institution",
      "error",
      "Accounts with a missing institution",
      (profiles.data ?? [])
        .filter((p: any) => p.institution !== "MII" && p.institution !== "MIU")
        .map((p: any) => `${p.full_name}`),
    );
    push(
      "student_no_cohort",
      "warning",
      "Students not linked to a cohort",
      (profiles.data ?? [])
        .filter((p: any) => (roleOf.get(p.id) ?? []).includes("student") && !p.cohort_id)
        .map((p: any) => `${p.full_name} · ${p.institution}`),
    );
    push(
      "cohort_cross_institution",
      "error",
      "People linked to a cohort from the other institution",
      (profiles.data ?? [])
        .filter((p: any) => p.cohort_id && cohortById.get(p.cohort_id)?.institution !== p.institution)
        .map((p: any) => `${p.full_name} · ${p.institution} → ${cohortById.get(p.cohort_id)?.name ?? "unknown"}`),
    );
    push(
      "block_cross_institution",
      "error",
      "Blocks attached to a cohort from the other institution",
      (blocks.data ?? [])
        .filter((b: any) => b.cohort_id && cohortById.get(b.cohort_id)?.institution !== b.institution)
        .map((b: any) => `${b.name} · ${b.institution}`),
    );
    push(
      "marker_scope",
      "error",
      "Marker assignments with no cohort, classification or gender (would match everyone)",
      (assignments.data ?? [])
        .filter((a: any) => a.is_active && !a.cohort_id && !a.classification && !a.gender)
        .map((a: any) => `${profileById.get(a.marker_id)?.full_name ?? a.marker_id}`),
    );
    push(
      "marker_cross_institution",
      "error",
      "Marker assigned to a cohort outside their institution",
      (assignments.data ?? [])
        .filter(
          (a: any) =>
            a.cohort_id &&
            profileById.get(a.marker_id) &&
            cohortById.get(a.cohort_id)?.institution !== profileById.get(a.marker_id)?.institution,
        )
        .map((a: any) => `${profileById.get(a.marker_id)?.full_name ?? a.marker_id}`),
    );

    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of attendance.data ?? []) {
      const key = `${r.student_id}|${r.block_id}|${r.session_date}|${r.slot}`;
      if (seen.has(key)) dupes.push(`${profileById.get(r.student_id)?.full_name ?? r.student_id} · ${r.session_date} ${r.slot}`);
      else seen.add(key);
    }
    push("duplicate_attendance", "error", "Duplicate meditation marks for the same session", dupes);

    push(
      "orphan_attendance",
      "error",
      "Meditation marks pointing at a missing student or block",
      (attendance.data ?? [])
        .filter((r: any) => !profileById.has(r.student_id) || !blockById.has(r.block_id))
        .map((r: any) => `${r.session_date} ${r.slot}`),
    );
    push(
      "attendance_cross_institution",
      "error",
      "Meditation marks where the student and block belong to different institutions",
      (attendance.data ?? [])
        .filter(
          (r: any) =>
            profileById.get(r.student_id) &&
            blockById.get(r.block_id) &&
            profileById.get(r.student_id)!.institution !== blockById.get(r.block_id)!.institution,
        )
        .map((r: any) => `${profileById.get(r.student_id)?.full_name} · ${r.session_date} ${r.slot}`),
    );
    push(
      "attendance_out_of_block",
      "warning",
      "Meditation marks dated outside their block",
      (attendance.data ?? [])
        .filter((r: any) => {
          const b = blockById.get(r.block_id);
          return b && (r.session_date < b.start_date || r.session_date > b.end_date);
        })
        .map((r: any) => `${profileById.get(r.student_id)?.full_name ?? r.student_id} · ${r.session_date}`),
    );
    push(
      "orphan_class_marks",
      "error",
      "Class marks pointing at a missing class or student",
      (classMarks.data ?? [])
        .filter((r: any) => !sessionById.has(r.session_id) || !profileById.has(r.student_id))
        .map((r: any) => `${r.id}`),
    );
    push(
      "orphan_class_session",
      "error",
      "Classes attached to a missing block",
      (classSessions.data ?? []).filter((s: any) => !blockById.has(s.block_id)).map((s: any) => `${s.session_date}`),
    );

    return {
      checked: {
        people: (profiles.data ?? []).length,
        attendance: (attendance.data ?? []).length,
        classMarks: (classMarks.data ?? []).length,
        blocks: (blocks.data ?? []).length,
      },
      issues,
    };
  });

/* --------------------------------- email centre ---------------------------- */

export const devEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const { data } = await db.from("email_events").select("*").order("created_at", { ascending: false }).limit(300);
    return data ?? [];
  });

export const devRetryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: row } = await db.from("email_events").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("That email record no longer exists.");
    await db
      .from("email_events")
      .update({ status: "pending", error: null, attempts: (row.attempts ?? 0) + 1 })
      .eq("id", data.id);
    await devAudit(dev, "retry_email", "email_event", data.id, { recipient: row.recipient, subject: row.subject });
    return { ok: true };
  });

/* -------------------------------- system health ---------------------------- */

export const devHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const started = Date.now();
    const { error: dbError } = await db.from("profiles").select("id", { count: "exact", head: true });
    const dbMs = Date.now() - started;

    let authOk = true;
    try {
      await authAdminFetch("/admin/users?page=1&per_page=1", { method: "GET" });
    } catch {
      authOk = false;
    }

    const { data: buckets, error: storageError } = await db.storage.listBuckets();
    const { data: recentErrors } = await db
      .from("security_events")
      .select("id, kind, detail, created_at")
      .in("kind", ["system_error", "permission_denied"])
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: pendingEmails } = await db
      .from("email_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    return {
      database: { ok: !dbError, ms: dbMs, message: dbError?.message ?? "Responding normally" },
      auth: { ok: authOk, message: authOk ? "Responding normally" : "Administrative API unreachable" },
      storage: {
        ok: !storageError,
        buckets: (buckets ?? []).map((b: any) => b.name),
        message: storageError?.message ?? "Responding normally",
      },
      email: { ok: true, configured: false, message: "No sending domain verified yet — emails are queued." },
      pendingEmails: (pendingEmails as any)?.length ?? 0,
      recentErrors: recentErrors ?? [],
      version: "MI Attendance Platform · build " + new Date().toISOString().slice(0, 10),
    };
  });

/* -------------------------------- feature flags ---------------------------- */

export const devFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const { data } = await db.from("feature_flags").select("*").order("label").order("institution");
    return data ?? [];
  });

export const devSetFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: before } = await db.from("feature_flags").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("That feature no longer exists.");
    await db
      .from("feature_flags")
      .update({ enabled: data.enabled, updated_by: dev.userId })
      .eq("id", data.id);
    await devAudit(dev, "set_feature_flag", "feature_flag", data.id, {
      key: before.key,
      institution: before.institution,
      before: { enabled: before.enabled },
      after: { enabled: data.enabled },
    });
    return { ok: true };
  });

/* ----------------------------- emergency controls -------------------------- */

export const devControls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context);
    const db = await admin();
    const { data } = await db.from("system_controls").select("*").order("label");
    return data ?? [];
  });

export const devSetControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().min(2).max(60),
        enabled: z.boolean(),
        note: z.string().trim().max(300).optional(),
        confirm: z.literal("CONFIRM"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: before } = await db.from("system_controls").select("*").eq("key", data.key).maybeSingle();
    if (!before) throw new Error("That control does not exist.");
    await db
      .from("system_controls")
      .update({ enabled: data.enabled, note: data.note ?? null, updated_by: dev.userId })
      .eq("key", data.key);
    await devAudit(dev, "set_system_control", "system_control", data.key, {
      label: before.label,
      before: { enabled: before.enabled },
      after: { enabled: data.enabled },
      note: data.note ?? null,
    });
    return { ok: true };
  });

/* ------------------------------ developer tools ---------------------------- */

export const devRevokeAllSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("CONFIRM") }).parse(d))
  .handler(async ({ context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: people } = await db.from("profiles").select("id").neq("id", dev.userId).limit(1000);
    let revoked = 0;
    for (const p of people ?? []) {
      try {
        await authAdminFetch(`/admin/users/${p.id}/sessions`, { method: "DELETE" });
        revoked += 1;
      } catch {
        /* keep going */
      }
    }
    await devAudit(dev, "revoke_all_sessions", "platform", null, { revoked });
    return { revoked };
  });

export const devRecalculateBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ block_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: block } = await db.from("blocks").select("*").eq("id", data.block_id).maybeSingle();
    if (!block) throw new Error("That block no longer exists.");
    const { data: rows } = await db
      .from("attendance")
      .select("id, points, status, absence_reason, session_point_value")
      .eq("block_id", data.block_id);

    // Repairs only derived bookkeeping fields; the attendance rules and the
    // recorded points themselves are never changed.
    let repaired = 0;
    for (const r of rows ?? []) {
      const points = Number(r.points ?? 0);
      const status =
        points > 0
          ? "present"
          : r.absence_reason === "sick_leave" || r.absence_reason === "approved_leave"
            ? "excused"
            : "absent";
      const expectedValue = Number(block.session_point_value ?? 2);
      if (r.status !== status || Number(r.session_point_value ?? 0) !== expectedValue) {
        await db
          .from("attendance")
          .update({ status, session_point_value: expectedValue })
          .eq("id", r.id);
        repaired += 1;
      }
    }
    await devAudit(dev, "recalculate_block", "block", data.block_id, {
      block: block.name,
      rows: (rows ?? []).length,
      repaired,
    });
    return { rows: (rows ?? []).length, repaired };
  });

export const devRepairAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["student", "marker", "admin", "staff"]).optional(),
        cohort_id: z.string().uuid().nullable().optional(),
        institution: z.enum(["MII", "MIU"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const dev = await requireDeveloper(context);
    const db = await admin();
    const { data: before } = await db
      .from("profiles")
      .select("id, full_name, institution, cohort_id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!before) throw new Error("That account no longer exists.");

    const patch: Record<string, unknown> = {};
    if (data.institution) patch["institution"] = data.institution;
    if (data.cohort_id !== undefined) patch["cohort_id"] = data.cohort_id;
    if (Object.keys(patch).length) await db.from("profiles").update(patch).eq("id", data.user_id);
    if (data.role) {
      await db.from("user_roles").insert({ user_id: data.user_id, role: data.role }).select().maybeSingle();
    }
    await devAudit(dev, "repair_account", "account", data.user_id, {
      person: before.full_name,
      before: { institution: before.institution, cohort_id: before.cohort_id },
      after: patch,
      role_added: data.role ?? null,
    });
    return { ok: true };
  });

/* ---------------------- sign-in activity (all accounts) -------------------- */

/**
 * Called by the sign-in pages so failed and successful attempts are visible in
 * the developer portal. Accepts only an email address and an outcome — never a
 * password, token or session value.
 */
export const recordAuthEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().max(255),
        succeeded: z.boolean(),
        reason: z.string().trim().max(200).optional(),
        portal: z.string().trim().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const db = await admin();
    const email = data.email.toLowerCase();
    const { data: profile } = await db
      .from("profiles")
      .select("id, institution")
      .ilike("email", email)
      .maybeSingle();
    await db.from("auth_events").insert({
      user_id: profile?.id ?? null,
      email,
      event: data.succeeded ? "sign_in" : "sign_in_failed",
      succeeded: data.succeeded,
      reason: data.reason ?? null,
      institution: profile?.institution ?? null,
      role: data.portal ?? null,
      ip: getRequestHeader("x-forwarded-for") ?? null,
      user_agent: getRequestHeader("user-agent") ?? null,
    });
    return { ok: true };
  });

/** Platform switches the app reads (maintenance notice, marking pause). */
export const getSystemControls = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("system_controls").select("key, label, enabled, note");
  return data ?? [];
});
