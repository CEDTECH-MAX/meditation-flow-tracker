import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SESSION_POINTS,
  PASS_MARK,
  blockDates,
  blockProgress,
  buildCalendar,
  classificationLabel,
  formatDate,
  genderLabel,
  isSunday,
  pointsLabel,
  reasonLabel,
  skipSunday,
  statusTone,
  summarise,
  type AttendanceRecord,
  type Block,
} from "./attendance";

type SessionInput = Pick<AttendanceRecord, "slot" | "status" | "points">;

const session = (
  slot: SessionInput["slot"],
  status: SessionInput["status"],
  points: number,
): SessionInput => ({ slot, status, points });

const day = (morning: number, afternoon: number): SessionInput[] => [
  session("morning", morning > 0 ? "present" : "absent", morning),
  session("afternoon", afternoon > 0 ? "present" : "absent", afternoon),
];

const block = (overrides: Partial<Block> = {}): Block => ({
  id: "block-1",
  name: "Block 1",
  start_date: "2025-01-06",
  end_date: "2025-01-17",
  weeks: 2,
  meditation_days: 10,
  status: "active",
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pointsLabel", () => {
  it("renders one decimal place", () => {
    expect(pointsLabel(2)).toBe("2.0");
    expect(pointsLabel(1.5)).toBe("1.5");
    expect(pointsLabel(0)).toBe("0.0");
  });

  it("renders a dash when there is no value", () => {
    expect(pointsLabel(null)).toBe("—");
    expect(pointsLabel(undefined)).toBe("—");
  });
});

describe("reasonLabel", () => {
  it("maps known reasons to their label", () => {
    expect(reasonLabel("sick_leave")).toBe("Sick leave");
    expect(reasonLabel("unexcused")).toBe("Unexcused");
  });

  it("falls back to a dash for missing reasons", () => {
    expect(reasonLabel(null)).toBe("—");
    expect(reasonLabel(undefined)).toBe("—");
  });
});

describe("summarise", () => {
  it("returns an empty summary when there is no block", () => {
    const s = summarise(null, []);
    expect(s.totalSessions).toBe(0);
    expect(s.sessionWeight).toBe(0);
    expect(s.pointsPossible).toBe(0);
    expect(s.percentage).toBe(0);
    expect(s.maxPossible).toBe(0);
    expect(s.met).toBe(false);
    expect(s.status).toBe("risk");
  });

  it("scales the session weight to the length of the block", () => {
    expect(summarise({ meditation_days: 10 }, []).sessionWeight).toBe(5);
    expect(summarise({ meditation_days: 20 }, []).sessionWeight).toBe(2.5);
  });

  it("treats negative meditation days as an empty block", () => {
    expect(summarise({ meditation_days: -5 }, []).totalSessions).toBe(0);
  });

  it("awards a full 100% for a perfect block", () => {
    const records = Array.from({ length: 10 }, () => day(2, 2)).flat();
    const s = summarise({ meditation_days: 10 }, records);
    expect(s.present).toBe(20);
    expect(s.absent).toBe(0);
    expect(s.pointsEarned).toBe(40);
    expect(s.pointsPossible).toBe(40);
    expect(s.percentage).toBe(100);
    expect(s.percentageNeeded).toBe(0);
    expect(s.pointsNeeded).toBe(0);
    expect(s.sessionsNeeded).toBe(0);
    expect(s.met).toBe(true);
    expect(s.statusLabel).toBe("Requirement Met");
  });

  it("counts partial points as present and splits morning from afternoon", () => {
    const s = summarise({ meditation_days: 2 }, [...day(1.5, 0), ...day(0.5, 1)]);
    expect(s.present).toBe(3);
    expect(s.absent).toBe(1);
    expect(s.morningPresent).toBe(2);
    expect(s.afternoonPresent).toBe(1);
    expect(s.pointsEarned).toBe(3);
    expect(s.pointsPossible).toBe(8);
    expect(s.percentage).toBe(37.5);
  });

  it("excludes excused sessions from the denominator", () => {
    const records = [
      ...Array.from({ length: 4 }, () => day(2, 2)).flat(),
      session("morning", "excused", 0),
      session("afternoon", "excused", 0),
    ];
    const s = summarise({ meditation_days: 5 }, records);
    expect(s.excused).toBe(2);
    expect(s.countedSessions).toBe(8);
    expect(s.pointsPossible).toBe(16);
    expect(s.pointsEarned).toBe(16);
    expect(s.percentage).toBe(100);
  });

  it("ignores points recorded against an excused session", () => {
    const s = summarise({ meditation_days: 1 }, [
      session("morning", "excused", 2),
      session("afternoon", "present", 2),
    ]);
    expect(s.pointsEarned).toBe(2);
    expect(s.excused).toBe(1);
    expect(s.percentage).toBe(100);
  });

  it("coerces missing points to zero", () => {
    const s = summarise({ meditation_days: 1 }, [
      { slot: "morning", status: "absent", points: null as unknown as number },
    ]);
    expect(s.pointsEarned).toBe(0);
    expect(s.absent).toBe(1);
  });

  it("caps the best achievable percentage at 100", () => {
    const s = summarise({ meditation_days: 10 }, day(2, 2));
    expect(s.recorded).toBe(2);
    expect(s.remainingSessions).toBe(18);
    expect(s.maxPossible).toBe(100);
  });

  it("reports a best achievable below 100 once the pass mark is out of reach", () => {
    const records = Array.from({ length: 8 }, () => day(0, 0)).flat();
    const s = summarise({ meditation_days: 10 }, records);
    expect(s.percentage).toBe(0);
    expect(s.remainingSessions).toBe(4);
    expect(s.maxPossible).toBe(20);
    expect(s.met).toBe(false);
  });

  it("never reports negative remaining sessions when over-recorded", () => {
    const records = Array.from({ length: 3 }, () => day(2, 2)).flat();
    const s = summarise({ meditation_days: 2 }, records);
    expect(s.recorded).toBe(6);
    expect(s.remainingSessions).toBe(0);
  });

  it("computes the points and sessions still needed to pass", () => {
    const records = [...Array.from({ length: 3 }, () => day(2, 2)).flat(), ...day(0, 0)];
    const s = summarise({ meditation_days: 5 }, records);
    expect(s.pointsEarned).toBe(12);
    expect(s.pointsPossible).toBe(20);
    expect(s.percentage).toBe(60);
    expect(s.percentageNeeded).toBe(20);
    expect(s.pointsNeeded).toBe(4);
    expect(s.sessionsNeeded).toBe(s.pointsNeeded / MAX_SESSION_POINTS);
  });

  it("rounds sessionsNeeded up for a partial session", () => {
    const s = summarise({ meditation_days: 1 }, [session("morning", "present", 1)]);
    expect(s.pointsEarned).toBe(1);
    expect(s.pointsPossible).toBe(4);
    expect(s.pointsNeeded).toBe(2.2);
    expect(s.sessionsNeeded).toBe(2);
  });

  it("classifies the status bands around the pass mark", () => {
    const at = (points: number, days: number) =>
      summarise({ meditation_days: days }, [{ slot: "morning", status: "present", points }]).status;
    // one recorded session, denominator is the whole block
    expect(summarise({ meditation_days: 1 }, day(2, 2)).status).toBe("met");
    expect(at(2, 1)).toBe("risk");

    const warning = summarise({ meditation_days: 5 }, [
      ...Array.from({ length: 3 }, () => day(2, 2)).flat(),
      ...day(2, 1),
    ]);
    expect(warning.percentage).toBe(75);
    expect(warning.status).toBe("warning");
    expect(warning.statusLabel).toBe("Warning");

    const risk = summarise({ meditation_days: 5 }, [
      ...Array.from({ length: 3 }, () => day(2, 2)).flat(),
    ]);
    expect(risk.percentage).toBe(60);
    expect(risk.status).toBe("risk");
    expect(risk.statusLabel).toBe("At Risk");
  });

  it("treats exactly the pass mark as met", () => {
    const records = [...Array.from({ length: 4 }, () => day(2, 2)).flat(), ...day(0, 0)];
    const s = summarise({ meditation_days: 5 }, records);
    expect(s.percentage).toBe(PASS_MARK);
    expect(s.met).toBe(true);
    expect(s.status).toBe("met");
  });
});

describe("statusTone", () => {
  it("returns a distinct palette per status", () => {
    expect(statusTone("met").stroke).toBe("var(--success)");
    expect(statusTone("warning").stroke).toBe("var(--warning)");
    expect(statusTone("risk").stroke).toBe("var(--destructive)");
  });
});

describe("formatDate", () => {
  it("formats a date-only string without shifting the day", () => {
    const formatted = formatDate("2025-01-06");
    expect(formatted).toContain("06");
    expect(formatted).toContain("Jan");
    expect(formatted).toContain("2025");
  });

  it("accepts a full timestamp", () => {
    expect(formatDate("2025-01-06T10:30:00Z")).toContain("2025");
  });
});

describe("blockProgress", () => {
  it("is 0 before the block starts", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
    expect(blockProgress(block())).toBe(0);
  });

  it("is 100 after the block ends", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-02-01T00:00:00Z"));
    expect(blockProgress(block())).toBe(100);
  });

  it("is 100 for a closed block regardless of the date", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-08T00:00:00Z"));
    expect(blockProgress(block({ status: "closed" }))).toBe(100);
  });

  it("interpolates while the block is running", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-12T00:00:00Z"));
    expect(blockProgress(block())).toBe(55);
  });
});

describe("isSunday / skipSunday", () => {
  it("detects Sundays", () => {
    expect(isSunday("2025-01-05")).toBe(true);
    expect(isSunday("2025-01-06")).toBe(false);
  });

  it("moves Sundays forward to Monday and leaves other days alone", () => {
    expect(skipSunday("2025-01-05")).toBe("2025-01-06");
    expect(skipSunday("2025-01-06")).toBe("2025-01-06");
  });
});

describe("blockDates", () => {
  it("lists every day of the block except Sundays", () => {
    const dates = blockDates({ start_date: "2025-01-03", end_date: "2025-01-07" });
    expect(dates).toEqual(["2025-01-03", "2025-01-04", "2025-01-06", "2025-01-07"]);
  });

  it("returns a single day for a one-day block", () => {
    expect(blockDates({ start_date: "2025-01-06", end_date: "2025-01-06" })).toEqual([
      "2025-01-06",
    ]);
  });

  it("returns nothing when the end precedes the start", () => {
    expect(blockDates({ start_date: "2025-01-10", end_date: "2025-01-01" })).toEqual([]);
  });

  it("caps runaway ranges at 400 dates", () => {
    expect(blockDates({ start_date: "2020-01-01", end_date: "2030-01-01" })).toHaveLength(400);
  });
});

describe("buildCalendar", () => {
  const record = (
    session_date: string,
    slot: AttendanceRecord["slot"],
    status: AttendanceRecord["status"],
  ): AttendanceRecord => ({
    id: `${session_date}-${slot}`,
    block_id: "block-1",
    student_id: "student-1",
    session_date,
    slot,
    status,
    points: status === "present" ? 2 : 0,
  });

  it("returns nothing without a block", () => {
    expect(buildCalendar(null, [])).toEqual([]);
  });

  it("maps records onto their day and slot", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-07T12:00:00Z"));
    const cells = buildCalendar({ start_date: "2025-01-06", end_date: "2025-01-08" }, [
      record("2025-01-06", "morning", "present"),
      record("2025-01-06", "afternoon", "excused"),
      record("2025-01-07", "morning", "absent"),
    ]);
    expect(cells).toEqual([
      { date: "2025-01-06", morning: "present", afternoon: "excused", future: false },
      { date: "2025-01-07", morning: "absent", afternoon: null, future: false },
      { date: "2025-01-08", morning: null, afternoon: null, future: true },
    ]);
  });

  it("keeps the last record when a slot is recorded twice", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-06T12:00:00Z"));
    const cells = buildCalendar({ start_date: "2025-01-06", end_date: "2025-01-06" }, [
      record("2025-01-06", "morning", "absent"),
      record("2025-01-06", "morning", "present"),
    ]);
    expect(cells[0]?.morning).toBe("present");
  });
});

describe("classificationLabel / genderLabel", () => {
  it("maps known values", () => {
    expect(classificationLabel("rising_siddha")).toBe("Rising Siddha");
    expect(genderLabel("female")).toBe("Female");
  });

  it("falls back to a dash", () => {
    expect(classificationLabel(null)).toBe("—");
    expect(genderLabel(undefined)).toBe("—");
  });
});
