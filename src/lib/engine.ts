/**
 * ============================================================================
 *  THE SINGLE AUTHORITATIVE MEDITATION ATTENDANCE CALCULATION ENGINE
 * ============================================================================
 *
 * Every attendance number shown anywhere in this system — student dashboard,
 * admin tables, reports, the Excel register and the PDF register — MUST come
 * out of `computeAttendance()` in this file. No other module may re-derive
 * points, weekly targets or percentages.
 *
 * Rules encoded here:
 *  - A block's schedule comes from `block.schedule` when a spreadsheet has been
 *    uploaded, otherwise it is derived from the block dates + configuration.
 *  - Sundays never exist. Monday–Thursday AM+PM are compulsory.
 *  - Friday AM is always compulsory; Friday PM is compulsory only when the
 *    block says so (`friday_pm_compulsory`).
 *  - Saturday follows `saturday_mode`: "none" | "optional" | "compulsory".
 *  - Optional sessions still earn points, so a student can exceed the weekly
 *    requirement and the block reference — attendance is NEVER capped at 100%.
 *  - Earned points and attendance percentage are separate quantities.
 *  - Full floating point precision is kept internally; `precision_digits` only
 *    affects presentation via `round()`.
 */

import type { AbsenceReason, AttendanceStatus, SessionSlot } from "@/lib/attendance";

/* ------------------------------- block config ----------------------------- */

export type SaturdayMode = "none" | "optional" | "compulsory";

export type BlockConfig = {
  id?: string;
  name?: string;
  start_date: string;
  end_date: string;
  weeks: number;
  meditation_days?: number;
  session_point_value?: number | null;
  weekly_required_points?: number | null;
  weekly_reference_points?: number | null;
  friday_pm_compulsory?: boolean | null;
  saturday_mode?: string | null;
  precision_digits?: number | null;
  schedule?: BlockSchedule | null;
  schedule_source?: string | null;
};

/** Persisted (jsonb) schedule — produced by the spreadsheet importer. */
export type BlockSchedule = {
  weeks: ScheduleWeek[];
  source?: string | null;
};

export type ScheduleWeek = {
  label: string;
  required_points?: number | null;
  reference_points?: number | null;
  days: ScheduleDay[];
};

export type ScheduleDay = {
  date: string;
  sessions: ScheduleSession[];
};

export type ScheduleSession = {
  slot: SessionSlot;
  compulsory: boolean;
  point_value: number;
};

/* --------------------------------- defaults ------------------------------- */

export const DEFAULT_SESSION_POINT_VALUE = 2;
export const DEFAULT_WEEKLY_REQUIRED_POINTS = 16;
export const DEFAULT_WEEKLY_REFERENCE_POINTS = 18;
export const DEFAULT_PRECISION_DIGITS = 2;
export const DEFAULT_SATURDAY_MODE: SaturdayMode = "optional";

export const SATURDAY_MODES: { value: SaturdayMode; label: string }[] = [
  { value: "none", label: "No Saturday sessions" },
  { value: "optional", label: "Saturday optional (extra points)" },
  { value: "compulsory", label: "Saturday compulsory" },
];

export function resolveConfig(block: BlockConfig) {
  const mode = (block.saturday_mode ?? DEFAULT_SATURDAY_MODE) as SaturdayMode;
  return {
    sessionPointValue: num(block.session_point_value, DEFAULT_SESSION_POINT_VALUE),
    weeklyRequiredPoints: num(block.weekly_required_points, DEFAULT_WEEKLY_REQUIRED_POINTS),
    weeklyReferencePoints: num(block.weekly_reference_points, DEFAULT_WEEKLY_REFERENCE_POINTS),
    fridayPmCompulsory: Boolean(block.friday_pm_compulsory),
    saturdayMode: (["none", "optional", "compulsory"] as string[]).includes(mode)
      ? mode
      : DEFAULT_SATURDAY_MODE,
    precisionDigits: Math.max(0, Math.trunc(num(block.precision_digits, DEFAULT_PRECISION_DIGITS))),
  };
}

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Presentation-only rounding. Internal maths always uses full precision. */
export function round(value: number, digits = DEFAULT_PRECISION_DIGITS) {
  const f = 10 ** Math.max(0, digits);
  return Math.round(value * f + Number.EPSILON) / f;
}

/* -------------------------------- schedule -------------------------------- */

const iso = (d: Date) => {
  const c = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return c.toISOString().slice(0, 10);
};

/** Monday of the week containing `startDate`, offset by whole weeks. */
export function weekMonday(startDate: string, weekIndex: number) {
  const d = new Date(startDate + "T00:00:00");
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + weekIndex * 7);
  return d;
}

/**
 * The schedule the engine計 works from. Uses the uploaded spreadsheet schedule
 * when one exists, otherwise derives Mon–Sat weeks from the block dates.
 * Works for any block length (2, 4, 6+ weeks).
 */
export function buildSchedule(block: BlockConfig): ScheduleWeek[] {
  const stored = block.schedule?.weeks;
  if (Array.isArray(stored) && stored.length > 0) return stored;

  const cfg = resolveConfig(block);
  const weeks = Math.max(1, Math.trunc(Number(block.weeks) || 1));
  const out: ScheduleWeek[] = [];

  for (let w = 0; w < weeks; w += 1) {
    const monday = weekMonday(block.start_date, w);
    const days: ScheduleDay[] = [];
    for (let d = 0; d < 6; d += 1) {
      // d: 0=Mon … 5=Sat. Sunday is never generated.
      const date = new Date(monday);
      date.setDate(date.getDate() + d);
      const sessions: ScheduleSession[] = [];

      if (d <= 3) {
        sessions.push(session("morning", true, cfg.sessionPointValue));
        sessions.push(session("afternoon", true, cfg.sessionPointValue));
      } else if (d === 4) {
        sessions.push(session("morning", true, cfg.sessionPointValue));
        sessions.push(session("afternoon", cfg.fridayPmCompulsory, cfg.sessionPointValue));
      } else if (cfg.saturdayMode !== "none") {
        const compulsory = cfg.saturdayMode === "compulsory";
        sessions.push(session("morning", compulsory, cfg.sessionPointValue));
        sessions.push(session("afternoon", compulsory, cfg.sessionPointValue));
      }

      days.push({ date: iso(date), sessions });
    }
    out.push({
      label: `Week ${w + 1}`,
      required_points: cfg.weeklyRequiredPoints,
      reference_points: cfg.weeklyReferencePoints,
      days,
    });
  }
  return out;
}

function session(slot: SessionSlot, compulsory: boolean, point_value: number): ScheduleSession {
  return { slot, compulsory, point_value };
}

/* --------------------------------- records -------------------------------- */

export type EngineRecord = {
  student_id?: string;
  session_date: string;
  slot: SessionSlot;
  status?: AttendanceStatus | null;
  points?: number | null;
  absence_reason?: AbsenceReason | null;
  absence_note?: string | null;
  recorded_by?: string | null;
  marked_at?: string | null;
};

/* --------------------------------- results -------------------------------- */

export type SessionResult = {
  date: string;
  slot: SessionSlot;
  weekIndex: number;
  compulsory: boolean;
  maxPoints: number;
  points: number;
  recorded: boolean;
  excused: boolean;
  status: AttendanceStatus | null;
  reason: AbsenceReason | null;
  future: boolean;
};

export type WeekResult = {
  index: number;
  label: string;
  dates: string[];
  sessions: SessionResult[];
  requiredPoints: number;
  referencePoints: number;
  earnedPoints: number;
  compulsoryPoints: number;
  optionalPoints: number;
  additionalPoints: number;
  shortfallPoints: number;
  percentage: number;
  met: boolean;
  cumulativeEarned: number;
  cumulativeRequired: number;
  cumulativeMet: boolean;
};

export type EngineResult = {
  precisionDigits: number;
  sessionPointValue: number;
  weeklyRequiredPoints: number;
  weeklyReferencePoints: number;
  weeks: WeekResult[];

  totalSessions: number;
  compulsorySessions: number;
  optionalSessions: number;

  earnedPoints: number;
  compulsoryPoints: number;
  optionalPoints: number;
  requiredPoints: number;
  referencePoints: number;
  maxAchievablePoints: number;

  /** earned ÷ block reference points × 100 — uncapped, may exceed 100. */
  percentage: number;
  /** earned ÷ block requirement × 100 — uncapped, may exceed 100. */
  requirementPercentage: number;
  additionalPoints: number;
  shortfallPoints: number;
  met: boolean;

  recordedSessions: number;
  attendedSessions: number;
  missedSessions: number;
  excusedSessions: number;
  remainingSessions: number;
  remainingPoints: number;
  sessionsNeeded: number;
  projectedPoints: number;
  projectedPercentage: number;

  morningAttended: number;
  afternoonAttended: number;

  status: "met" | "warning" | "risk";
  statusLabel: string;
  band: "platinum" | "gold" | "green" | "red";
};

/**
 * THE calculation. Everything else in the app reads from this.
 */
export function computeAttendance(
  block: BlockConfig | null | undefined,
  records: EngineRecord[],
  options?: { today?: string },
): EngineResult {
  const cfg = block
    ? resolveConfig(block)
    : {
        sessionPointValue: DEFAULT_SESSION_POINT_VALUE,
        weeklyRequiredPoints: DEFAULT_WEEKLY_REQUIRED_POINTS,
        weeklyReferencePoints: DEFAULT_WEEKLY_REFERENCE_POINTS,
        fridayPmCompulsory: false,
        saturdayMode: DEFAULT_SATURDAY_MODE,
        precisionDigits: DEFAULT_PRECISION_DIGITS,
      };
  const today = options?.today ?? new Date().toISOString().slice(0, 10);
  const schedule = block ? buildSchedule(block) : [];

  const byKey = new Map<string, EngineRecord>();
  for (const r of records) byKey.set(`${r.session_date}:${r.slot}`, r);

  const weeks: WeekResult[] = [];
  let cumulativeEarned = 0;
  let cumulativeRequired = 0;

  let totalSessions = 0;
  let compulsorySessions = 0;
  let optionalSessions = 0;
  let earnedPoints = 0;
  let compulsoryPoints = 0;
  let optionalPoints = 0;
  let recordedSessions = 0;
  let attendedSessions = 0;
  let missedSessions = 0;
  let excusedSessions = 0;
  let remainingCompulsoryPoints = 0;
  let remainingSessions = 0;
  let morningAttended = 0;
  let afternoonAttended = 0;

  schedule.forEach((week, wIndex) => {
    const required = num(week.required_points, cfg.weeklyRequiredPoints);
    const reference = num(week.reference_points, cfg.weeklyReferencePoints);
    const sessions: SessionResult[] = [];
    let weekEarned = 0;
    let weekCompulsory = 0;
    let weekOptional = 0;

    for (const day of week.days) {
      for (const slotDef of day.sessions) {
        const record = byKey.get(`${day.date}:${slotDef.slot}`);
        const excused = record?.status === "excused";
        const pts = record && !excused ? num(record.points, 0) : 0;
        const maxPoints = num(slotDef.point_value, cfg.sessionPointValue);
        const future = day.date > today;

        totalSessions += 1;
        if (slotDef.compulsory) compulsorySessions += 1;
        else optionalSessions += 1;

        if (record) {
          recordedSessions += 1;
          if (excused) excusedSessions += 1;
          else if (pts > 0) {
            attendedSessions += 1;
            if (slotDef.slot === "morning") morningAttended += 1;
            else afternoonAttended += 1;
          } else missedSessions += 1;
        } else {
          remainingSessions += 1;
          if (slotDef.compulsory) remainingCompulsoryPoints += maxPoints;
        }

        weekEarned += pts;
        if (slotDef.compulsory) weekCompulsory += pts;
        else weekOptional += pts;

        sessions.push({
          date: day.date,
          slot: slotDef.slot,
          weekIndex: wIndex,
          compulsory: slotDef.compulsory,
          maxPoints,
          points: pts,
          recorded: Boolean(record),
          excused,
          status: record?.status ?? null,
          reason: record?.absence_reason ?? null,
          future,
        });
      }
    }

    earnedPoints += weekEarned;
    compulsoryPoints += weekCompulsory;
    optionalPoints += weekOptional;
    cumulativeEarned += weekEarned;
    cumulativeRequired += required;

    weeks.push({
      index: wIndex,
      label: week.label || `Week ${wIndex + 1}`,
      dates: week.days.map((d) => d.date),
      sessions,
      requiredPoints: required,
      referencePoints: reference,
      earnedPoints: weekEarned,
      compulsoryPoints: weekCompulsory,
      optionalPoints: weekOptional,
      additionalPoints: Math.max(0, weekEarned - required),
      shortfallPoints: Math.max(0, required - weekEarned),
      percentage: reference > 0 ? (weekEarned / reference) * 100 : 0,
      met: weekEarned >= required,
      cumulativeEarned,
      cumulativeRequired,
      cumulativeMet: cumulativeEarned >= cumulativeRequired,
    });
  });

  const requiredPoints = weeks.reduce((a, w) => a + w.requiredPoints, 0);
  const referencePoints = weeks.reduce((a, w) => a + w.referencePoints, 0);
  const maxAchievablePoints = weeks.reduce(
    (a, w) => a + w.sessions.reduce((b, s) => b + s.maxPoints, 0),
    0,
  );

  const percentage = referencePoints > 0 ? (earnedPoints / referencePoints) * 100 : 0;
  const requirementPercentage = requiredPoints > 0 ? (earnedPoints / requiredPoints) * 100 : 0;
  const shortfallPoints = Math.max(0, requiredPoints - earnedPoints);
  const met = requiredPoints > 0 ? earnedPoints >= requiredPoints : earnedPoints > 0;
  const sessionsNeeded =
    cfg.sessionPointValue > 0 ? Math.ceil(shortfallPoints / cfg.sessionPointValue - 1e-9) : 0;
  const projectedPoints = earnedPoints + remainingCompulsoryPoints;
  const projectedPercentage = referencePoints > 0 ? (projectedPoints / referencePoints) * 100 : 0;

  const status: EngineResult["status"] = met
    ? "met"
    : requirementPercentage >= 87.5
      ? "warning"
      : "risk";

  const band: EngineResult["band"] =
    percentage >= 100 ? "platinum" : percentage >= 90 ? "gold" : percentage >= 80 ? "green" : "red";

  return {
    precisionDigits: cfg.precisionDigits,
    sessionPointValue: cfg.sessionPointValue,
    weeklyRequiredPoints: cfg.weeklyRequiredPoints,
    weeklyReferencePoints: cfg.weeklyReferencePoints,
    weeks,
    totalSessions,
    compulsorySessions,
    optionalSessions,
    earnedPoints,
    compulsoryPoints,
    optionalPoints,
    requiredPoints,
    referencePoints,
    maxAchievablePoints,
    percentage,
    requirementPercentage,
    additionalPoints: Math.max(0, earnedPoints - requiredPoints),
    shortfallPoints,
    met,
    recordedSessions,
    attendedSessions,
    missedSessions,
    excusedSessions,
    remainingSessions,
    remainingPoints: remainingCompulsoryPoints,
    sessionsNeeded,
    projectedPoints,
    projectedPercentage,
    morningAttended,
    afternoonAttended,
    status,
    statusLabel: met ? "Requirement met" : status === "warning" ? "Close — keep going" : "At risk",
    band,
  };
}

export const BAND_LABEL: Record<EngineResult["band"], string> = {
  platinum: "Platinum (over 100%)",
  gold: "Gold (90% – 99.9%)",
  green: "Green — Pass (80% – 89.9%)",
  red: "Red — No pass (below 80%)",
};
