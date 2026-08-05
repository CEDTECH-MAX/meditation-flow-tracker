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
};

export type AttendanceRecord = {
  id: string;
  block_id: string;
  student_id: string;
  session_date: string;
  slot: SessionSlot;
  status: AttendanceStatus;
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
 * Percentages scale to the specific block: 100% = every required session in the
 * block attended, regardless of block length. Excused sessions are excluded
 * from the denominator so they never penalise the student.
 */
export function summarise(
  block: Pick<Block, "meditation_days"> | null,
  records: Pick<AttendanceRecord, "slot" | "status">[],
): AttendanceSummary {
  const totalSessions = Math.max(0, (block?.meditation_days ?? 0) * 2);
  const sessionWeight = totalSessions > 0 ? 100 / totalSessions : 0;

  let present = 0;
  let absent = 0;
  let excused = 0;
  let morningPresent = 0;
  let afternoonPresent = 0;

  for (const r of records) {
    if (r.status === "present") {
      present += 1;
      if (r.slot === "morning") morningPresent += 1;
      else afternoonPresent += 1;
    } else if (r.status === "absent") absent += 1;
    else excused += 1;
  }

  const recorded = present + absent + excused;
  const remainingSessions = Math.max(0, totalSessions - recorded);
  const countedSessions = Math.max(0, totalSessions - excused);

  const percentage = countedSessions > 0 ? round1((present / countedSessions) * 100) : 0;
  const maxPossible =
    countedSessions > 0
      ? round1((Math.min(present + remainingSessions, countedSessions) / countedSessions) * 100)
      : 0;

  const percentageNeeded = round1(Math.max(0, PASS_MARK - percentage));
  const sessionsNeeded = Math.max(
    0,
    Math.ceil((PASS_MARK / 100) * countedSessions - present - 1e-9),
  );

  const status = percentage >= PASS_MARK ? "met" : percentage >= 70 ? "warning" : "risk";

  return {
    totalSessions,
    sessionWeight: round1(sessionWeight),
    present,
    absent,
    excused,
    recorded,
    remainingSessions,
    countedSessions,
    percentage,
    maxPossible,
    percentageNeeded,
    sessionsNeeded,
    met: percentage >= PASS_MARK,
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
