import {
  MAX_SESSION_POINTS,
  WEEKLY_TARGET_SESSIONS,
  dateKey,
  formatDate,
  sessionKind,
  slotsFor,
} from "./attendance";
import { fetchAllRows } from "./data.helpers";

type Inst = "MII" | "MIU";

const INSTITUTION_NAMES: Record<Inst, string> = {
  MII: "Maharishi Invincibility Institute",
  MIU: "Maharishi Invincibility University",
};

export const PORTAL_URL = "https://meditationflo.lovable.app";
export const WEEKLY_TEMPLATE = "weekly-target-missed";

export type FlaggedStudent = {
  student_id: string;
  full_name: string;
  student_number: string | null;
  cohort_name: string;
  email: string | null;
  can_email: boolean;
  sessions: number;
  points: number;
  required_sessions: number;
  required_points: number;
  excused: number;
  already_sent: boolean;
};

function addDays(key: string, n: number) {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Saturday of a Monday-start week (Sunday does not exist in this system). */
export function weekSaturday(monday: string) {
  return addDays(monday, 5);
}

export function weekPeriodLabel(monday: string) {
  return `${formatDate(monday)} – ${formatDate(weekSaturday(monday))}`;
}

export function weeklySubject(monday: string) {
  return `Notice: Weekly Meditation Target Not Met — ${weekPeriodLabel(monday)}`;
}

/** Real login email (not the internal @mi.local inbox address). */
function usableEmail(email: string | null | undefined) {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (!e.includes("@") || e.endsWith("@mi.local")) return null;
  return e;
}

/**
 * Students of one institution who were marked during the week but did not
 * reach the weekly target (8 sessions = 16 points). Excused sessions reduce
 * the requirement, and a block starting/ending mid-week only requires the
 * compulsory sessions that actually fell in it. Students with no marks at all
 * for the week are skipped (the week was not marked for them).
 */
export async function findFlaggedStudents(db: any, inst: Inst, monday: string) {
  const saturday = weekSaturday(monday);

  const { data: blocks } = await db
    .from("blocks")
    .select("id, cohort_id, start_date, end_date, institution, rounding_dates, status")
    .eq("institution", inst)
    .lte("start_date", saturday)
    .gte("end_date", monday);
  const weekBlocks = (blocks ?? []).filter((b: any) => b.status !== "upcoming");
  if (weekBlocks.length === 0) return { flagged: [] as FlaggedStudent[], notMarked: 0, checked: 0 };

  const [{ data: profiles }, { data: roleRows }, { data: cohorts }] = await Promise.all([
    db
      .from("profiles")
      .select("id, full_name, student_number, email, cohort_id")
      .eq("institution", inst),
    db.from("user_roles").select("user_id, role").neq("role", "student"),
    db.from("cohorts").select("id, name").eq("institution", inst),
  ]);
  const nonStudents = new Set((roleRows ?? []).map((r: any) => r.user_id));
  const cohortName = new Map((cohorts ?? []).map((c: any) => [c.id, c.name as string]));
  const students = (profiles ?? []).filter((p: any) => !nonStudents.has(p.id));

  const blockIds = weekBlocks.map((b: any) => b.id);
  const rows = await fetchAllRows<any>(() =>
    db
      .from("attendance")
      .select("id, student_id, block_id, session_date, slot, points, status")
      .in("block_id", blockIds)
      .gte("session_date", monday)
      .lte("session_date", saturday)
      .order("id", { ascending: true }),
  );
  const byStudent = new Map<string, any[]>();
  for (const r of rows) {
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }

  const { data: sent } = await db
    .from("email_events")
    .select("related_user_id")
    .eq("template", WEEKLY_TEMPLATE)
    .eq("subject", weeklySubject(monday))
    .eq("status", "sent");
  const alreadySent = new Set((sent ?? []).map((s: any) => s.related_user_id));

  const flagged: FlaggedStudent[] = [];
  let notMarked = 0;
  let checked = 0;

  for (const s of students) {
    const block =
      weekBlocks.find((b: any) => s.cohort_id && b.cohort_id === s.cohort_id) ??
      weekBlocks.find((b: any) => !b.cohort_id);
    if (!block) continue;
    const records = byStudent.get(s.id) ?? [];
    if (records.length === 0) {
      notMarked += 1;
      continue;
    }
    checked += 1;

    // Compulsory sessions inside this week and this block.
    let compulsory = 0;
    for (let i = 0; i < 6; i++) {
      const day = addDays(monday, i);
      if (day < block.start_date || day > block.end_date) continue;
      for (const slot of slotsFor(day, block.rounding_dates)) {
        if (sessionKind(day, slot, inst, block.rounding_dates) === "compulsory") compulsory += 1;
      }
    }

    let sessions = 0;
    let points = 0;
    let excused = 0;
    for (const r of records) {
      if (sessionKind(r.session_date, r.slot, inst, block.rounding_dates) === "none") continue;
      const p = Number(r.points ?? 0);
      if (p > 0) {
        sessions += 1;
        points += p;
      } else if (r.status === "excused") {
        excused += 1;
      }
    }

    const requiredSessions = Math.max(0, Math.min(WEEKLY_TARGET_SESSIONS, compulsory) - excused);
    const requiredPoints = requiredSessions * MAX_SESSION_POINTS;
    if (requiredPoints <= 0 || points >= requiredPoints) continue;

    const email = usableEmail(s.email);
    flagged.push({
      student_id: s.id,
      full_name: s.full_name ?? "Student",
      student_number: s.student_number ?? null,
      cohort_name: (s.cohort_id && cohortName.get(s.cohort_id)) || "—",
      email,
      can_email: !!email,
      sessions,
      points: Math.round(points * 10) / 10,
      required_sessions: requiredSessions,
      required_points: requiredPoints,
      excused,
      already_sent: alreadySent.has(s.id),
    });
  }

  flagged.sort((a, b) => a.points - b.points || a.full_name.localeCompare(b.full_name));
  return { flagged, notMarked, checked };
}

/**
 * Sends one personal notice per flagged student into their internal Mail
 * inbox (from the admin who pressed Send) and logs each outcome. External
 * email delivery is paused until the sending domain is verified.
 */
export async function sendWeeklyNotices(
  db: any,
  inst: Inst,
  monday: string,
  senderId: string,
  onlyIds?: string[],
) {
  const { flagged } = await findFlaggedStudents(db, inst, monday);
  const targets = flagged.filter(
    (f) => !f.already_sent && (!onlyIds || onlyIds.includes(f.student_id)),
  );
  const subject = weeklySubject(monday);
  const period = weekPeriodLabel(monday);
  const institutionName = INSTITUTION_NAMES[inst];
  let sent = 0;
  const suppressed = 0;
  let failed = 0;
  let firstError: string | null = null;

  const sendOne = async (f: FlaggedStudent) => {
    let status = "sent";
    let error: string | null = null;
    try {
      const body = `Dear ${f.full_name},

${f.student_number ? `Student Number: ${f.student_number}\n` : ""}Cohort: ${f.cohort_name}
Period: ${period}

This is an official notice that you did not meet the required weekly meditation attendance target for the week indicated above.

Your attendance summary for the week:
• Sessions attended: ${f.sessions} / ${f.required_sessions} required sessions
• Points earned: ${f.points.toFixed(1)} / ${f.required_points.toFixed(1)} points required
• Status: Target missed

All students are required to complete at least 8 sessions (16.0 points) each week. Please ensure full attendance for all upcoming sessions and improve your attendance.

If you were absent due to illness or an approved reason, submit your supporting letter or medical certificate via the student portal: ${PORTAL_URL}

Warm regards,
Consciousness Department
${institutionName}`;
      const { data: msg, error: mErr } = await db
        .from("messages")
        .insert({ sender_id: senderId, subject, body, is_draft: false, sent_at: new Date().toISOString() })
        .select("id")
        .single();
      if (mErr) throw mErr;
      const { error: rErr } = await db
        .from("message_recipients")
        .insert({ message_id: msg.id, recipient_id: f.student_id, kind: "to" });
      if (rErr) throw rErr;
      sent += 1;
    } catch (e: any) {
      status = "failed";
      error = String(e?.message ?? "Unknown error").slice(0, 500);
      firstError ??= error;
      failed += 1;
    }
    await db.from("email_events").insert({
      recipient: f.email ?? `internal:${f.student_id}`,
      subject,
      template: WEEKLY_TEMPLATE,
      status,
      error,
      institution: inst,
      related_user_id: f.student_id,
      attempts: 1,
    });
  };

  for (let i = 0; i < targets.length; i += 10) {
    await Promise.all(targets.slice(i, i + 10).map(sendOne));
  }

  return { attempted: targets.length, sent, suppressed, failed, firstError };
}
