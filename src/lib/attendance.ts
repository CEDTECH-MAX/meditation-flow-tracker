export type AttendanceStatus = "present" | "absent" | "excused";
export type SessionSlot = "morning" | "afternoon";
export type BlockStatus = "upcoming" | "active" | "closed";
export type AbsenceReason =
  | "sick_leave"
  | "approved_leave"
  | "late_arrival"
  | "unexcused"
  | "other";

export const PASS_MARK = 80;

/** Points a single session can be worth. A full day (AM + PM) is 4.0. */
export const MAX_SESSION_POINTS = 2;

export const POINT_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 2, label: "2.0", hint: "Full programme attended" },
  { value: 1.5, label: "1.5", hint: "Arrived late" },
  { value: 1, label: "1.0", hint: "Did not do Asanas" },
  { value: 0.5, label: "0.5", hint: "Left within the last 10 minutes" },
  { value: 0, label: "0", hint: "Did not attend" },
];

export function pointsLabel(points: number | null | undefined) {
  if (points === null || points === undefined) return "—";
  return points.toFixed(1);
}


export const REASONS: { value: AbsenceReason; label: string }[] = [
  { value: "sick_leave", label: "Sick leave" },
  { value: "approved_leave", label: "Approved leave" },
  { value: "late_arrival", label: "Late arrival" },
  { value: "unexcused", label: "Unexcused" },
  { value: "other", label: "Other" },
];

export function reasonLabel(reason: AbsenceReason | null | undefined) {
  return REASONS.find((r) => r.value === reason)?.label ?? "—";
}

export type Cohort = {
  id: string;
  name: string;
  programme: string | null;
  intake_year: number | null;
};

export type Block = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  weeks: number;
  meditation_days: number;
  status: BlockStatus;
  cohort_id?: string | null;
  /* admin-entered official calculation values */
  session_point_value?: number | null;
  weekly_required_points?: number | null;
  standard_attendance_points?: number | null;
  standard_attendance_percentage?: number | null;
  max_attendance_points?: number | null;
  max_attendance_percentage?: number | null;
  rounding_day?: boolean | null;
  rounding_day_points?: number | null;
};

/**
 * The official calculation rules for a block. These are entered manually by an
 * admin from the traditional spreadsheet — nothing here is inferred. When a
 * value has not been captured yet we fall back to the legacy derivation so old
 * blocks keep working.
 */
export type BlockRules = {
  sessionPointValue: number;
  weeklyRequiredPoints: number;
  standardPoints: number;
  standardPercentage: number;
  maxPoints: number;
  maxPercentage: number;
  roundingDay: boolean;
  roundingDayPoints: number;
};

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function blockRules(
  block: Partial<Block> | null | undefined,
): BlockRules {
  const sessionPointValue = num(block?.session_point_value, MAX_SESSION_POINTS);
  const legacyMax = Math.max(0, (block?.meditation_days ?? 0) * 2) * sessionPointValue;
  const maxPoints = num(block?.max_attendance_points, legacyMax);
  const maxPercentage = num(block?.max_attendance_percentage, 100);
  const standardPoints = num(block?.standard_attendance_points, (PASS_MARK / 100) * maxPoints);
  const standardPercentage = num(block?.standard_attendance_percentage, PASS_MARK);
  const weeks = Math.max(1, block?.weeks ?? 1);
  const weeklyRequiredPoints = num(block?.weekly_required_points, standardPoints / weeks);
  const roundingDay = Boolean(block?.rounding_day);
  return {
    sessionPointValue,
    weeklyRequiredPoints,
    standardPoints,
    standardPercentage,
    maxPoints,
    maxPercentage,
    roundingDay,
    roundingDayPoints: roundingDay ? num(block?.rounding_day_points, 0) : 0,
  };
}


export type AttendanceRecord = {
  id: string;
  block_id: string;
  student_id: string;
  session_date: string;
  slot: SessionSlot;
  status: AttendanceStatus;
  points: number;
  absence_reason?: AbsenceReason | null;
  absence_note?: string | null;
  updated_at?: string;
};


export type AttendanceSummary = {
  totalSessions: number;
  sessionWeight: number;
  present: number;
  absent: number;
  excused: number;
  recorded: number;
  remainingSessions: number;
  countedSessions: number;
  pointsEarned: number;
  pointsPossible: number;
  pointsNeeded: number;
  percentage: number;
  maxPossible: number;
  percentageNeeded: number;
  sessionsNeeded: number;
  met: boolean;
  morningPresent: number;
  afternoonPresent: number;
  status: "met" | "warning" | "risk";
  statusLabel: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Points-based scoring driven entirely by the admin-entered block rules
 * (points per session, standard/maximum points and percentages, rounding day).
 * Nothing is assumed: the numbers captured on the block are the official
 * calculation rules. Excused sessions shrink the denominator so they never
 * penalise the student.
 */
export function summarise(
  block: Partial<Block> | null,
  records: Pick<AttendanceRecord, "slot" | "status" | "points">[],
): AttendanceSummary {
  const rules = blockRules(block);
  const totalSessions = Math.max(0, (block?.meditation_days ?? 0) * 2);
  const sessionWeight =
    rules.maxPoints > 0 ? (rules.sessionPointValue / rules.maxPoints) * rules.maxPercentage : 0;

  let present = 0;
  let absent = 0;
  let excused = 0;
  let morningPresent = 0;
  let afternoonPresent = 0;
  let pointsEarned = 0;

  for (const r of records) {
    const pts = Number(r.points ?? 0);
    if (r.status === "excused") {
      excused += 1;
      continue;
    }
    pointsEarned += pts;
    if (pts > 0) {
      present += 1;
      if (r.slot === "morning") morningPresent += 1;
      else afternoonPresent += 1;
    } else absent += 1;
  }

  pointsEarned = round1(pointsEarned + rules.roundingDayPoints);
  const recorded = present + absent + excused;
  const remainingSessions = Math.max(0, totalSessions - recorded);
  const countedSessions = Math.max(0, totalSessions - excused);
  const pointsPossible = round1(
    Math.max(0, rules.maxPoints - excused * rules.sessionPointValue),
  );
  const scale = rules.maxPoints > 0 ? pointsPossible / rules.maxPoints : 0;
  const requiredPoints = round1(rules.standardPoints * scale);

  const percentage =
    pointsPossible > 0 ? round1((pointsEarned / pointsPossible) * rules.maxPercentage) : 0;
  const maxPossible =
    pointsPossible > 0
      ? round1(
          (Math.min(
            pointsEarned + remainingSessions * rules.sessionPointValue,
            pointsPossible,
          ) /
            pointsPossible) *
            rules.maxPercentage,
        )
      : 0;

  const pass = rules.standardPercentage;
  const percentageNeeded = round1(Math.max(0, pass - percentage));
  const pointsNeeded = round1(Math.max(0, requiredPoints - pointsEarned));
  const sessionsNeeded = Math.max(
    0,
    Math.ceil(pointsNeeded / Math.max(0.1, rules.sessionPointValue) - 1e-9),
  );

  const status =
    percentage >= pass ? "met" : percentage >= pass * 0.875 ? "warning" : "risk";

  return {
    totalSessions,
    sessionWeight: round1(sessionWeight),
    present,
    absent,
    excused,
    recorded,
    remainingSessions,
    countedSessions,
    pointsEarned,
    pointsPossible,
    pointsNeeded,
    requiredPoints,
    percentage,
    maxPossible,
    percentageNeeded,
    sessionsNeeded,
    passPercentage: pass,
    rules,
    met: percentage >= pass,
    morningPresent,
    afternoonPresent,
    status,
    statusLabel:
      status === "met" ? "Requirement Met" : status === "warning" ? "Warning" : "At Risk",
  };

}


export function statusTone(status: AttendanceSummary["status"]) {
  if (status === "met")
    return { text: "text-success", bg: "bg-success/12", ring: "ring-success/30", stroke: "var(--success)" };
  if (status === "warning")
    return { text: "text-warning-foreground", bg: "bg-warning/18", ring: "ring-warning/40", stroke: "var(--warning)" };
  return { text: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/30", stroke: "var(--destructive)" };
}

export function formatDate(value: string) {
  const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function blockProgress(block: Block) {
  const start = new Date(block.start_date + "T00:00:00").getTime();
  const end = new Date(block.end_date + "T00:00:00").getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end || block.status === "closed") return 100;
  return Math.round(((now - start) / Math.max(1, end - start)) * 100);
}

/** Sundays do not exist in this system — no meditation sessions are ever held. */
export function isSunday(date: string) {
  return new Date(date + "T00:00:00").getDay() === 0;
}

/** The next non-Sunday date on or after the given date. */
export function skipSunday(date: string) {
  if (!isSunday(date)) return date;
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Every session date inside a block, inclusive, excluding Sundays. */
export function blockDates(block: Pick<Block, "start_date" | "end_date">) {
  const out: string[] = [];
  const cur = new Date(block.start_date + "T00:00:00");
  const end = new Date(block.end_date + "T00:00:00");
  while (cur <= end && out.length < 400) {
    if (cur.getDay() !== 0) out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}


export type DayCell = {
  date: string;
  morning: AttendanceStatus | null;
  afternoon: AttendanceStatus | null;
  future: boolean;
};

export function buildCalendar(
  block: Pick<Block, "start_date" | "end_date"> | null,
  records: AttendanceRecord[],
): DayCell[] {
  if (!block) return [];
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, AttendanceRecord>();
  for (const r of records) map.set(`${r.session_date}:${r.slot}`, r);
  return blockDates(block).map((date) => ({
    date,
    morning: map.get(`${date}:morning`)?.status ?? null,
    afternoon: map.get(`${date}:afternoon`)?.status ?? null,
    future: date > today,
  }));
}

/* ------------------------- gender & classification ------------------------ */

export type Gender = "male" | "female";
export type Classification = "meditator" | "rising_siddha" | "siddha";

export const CLASSIFICATIONS: { value: Classification; label: string }[] = [
  { value: "meditator", label: "Meditator" },
  { value: "rising_siddha", label: "Rising Siddha" },
  { value: "siddha", label: "Siddha" },
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function classificationLabel(value: Classification | null | undefined) {
  return CLASSIFICATIONS.find((c) => c.value === value)?.label ?? "—";
}

export function genderLabel(value: Gender | null | undefined) {
  return GENDERS.find((g) => g.value === value)?.label ?? "—";
}
