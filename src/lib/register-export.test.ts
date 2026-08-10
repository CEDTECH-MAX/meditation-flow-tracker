import { describe, expect, it } from "vitest";
import type { AttendanceRecord, Block } from "@/lib/attendance";
import {
  REGISTER_WEEK_TARGET_100,
  REGISTER_WEEK_TARGET_80,
  buildRegisterRows,
  colLetter,
  type RegisterStudent,
} from "./register-export";

const student: RegisterStudent = {
  id: "student-1",
  full_name: "Thandiwe Mokoena",
  student_number: "MI-001",
  email: "thandiwe@example.com",
};

const block = (overrides: Partial<Block> = {}): Block => ({
  id: "block-1",
  name: "Block 1",
  // Monday
  start_date: "2025-01-06",
  end_date: "2025-01-18",
  weeks: 2,
  meditation_days: 12,
  status: "active",
  ...overrides,
});

const record = (
  session_date: string,
  slot: AttendanceRecord["slot"],
  status: AttendanceRecord["status"],
  absence_reason: AttendanceRecord["absence_reason"] = null,
): AttendanceRecord => ({
  id: `${session_date}-${slot}`,
  block_id: "block-1",
  student_id: student.id,
  session_date,
  slot,
  status,
  points: status === "present" ? 2 : 0,
  absence_reason,
});

describe("colLetter", () => {
  it("maps the first column letters", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(26)).toBe("Z");
  });

  it("rolls over into two-letter columns", () => {
    expect(colLetter(27)).toBe("AA");
    expect(colLetter(52)).toBe("AZ");
    expect(colLetter(53)).toBe("BA");
    expect(colLetter(702)).toBe("ZZ");
    expect(colLetter(703)).toBe("AAA");
  });

  it("returns an empty string for a non-positive index", () => {
    expect(colLetter(0)).toBe("");
  });
});

describe("buildRegisterRows", () => {
  it("produces one row per student and one week section per block week", () => {
    const rows = buildRegisterRows(block(), [student, { ...student, id: "student-2" }], []);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.weeks.map((w) => w.label)).toEqual(["Week 1", "Week 2"]);
  });

  it("lists Monday to Saturday with twelve slots per week", () => {
    const [row] = buildRegisterRows(block({ weeks: 1 }), [student], []);
    expect(row?.weeks[0]?.dates).toEqual([
      "2025-01-06",
      "2025-01-07",
      "2025-01-08",
      "2025-01-09",
      "2025-01-10",
      "2025-01-11",
    ]);
    expect(row?.weeks[0]?.slots).toHaveLength(12);
  });

  it("starts the week on the Monday preceding a mid-week block start", () => {
    // 2025-01-09 is a Thursday
    const [row] = buildRegisterRows(block({ weeks: 1, start_date: "2025-01-09" }), [student], []);
    expect(row?.weeks[0]?.dates[0]).toBe("2025-01-06");
  });

  it("treats a Sunday block start as belonging to the preceding Monday", () => {
    // 2025-01-05 is a Sunday
    const [row] = buildRegisterRows(block({ weeks: 1, start_date: "2025-01-05" }), [student], []);
    expect(row?.weeks[0]?.dates[0]).toBe("2024-12-30");
  });

  it("scores present as 2.0, late arrivals as 1.5 and everything else as 0", () => {
    const rows = buildRegisterRows(
      block({ weeks: 1 }),
      [student],
      [
        record("2025-01-06", "morning", "present"),
        record("2025-01-06", "afternoon", "present", "late_arrival"),
        record("2025-01-07", "morning", "absent", "late_arrival"),
        record("2025-01-07", "afternoon", "absent"),
        record("2025-01-08", "morning", "excused", "sick_leave"),
      ],
    );
    expect(rows[0]?.weeks[0]?.slots.slice(0, 6)).toEqual([2, 1.5, 1.5, 0, 0, 0]);
    expect(rows[0]?.weeks[0]?.weekPoints).toBe(5);
  });

  it("ignores records belonging to another student", () => {
    const rows = buildRegisterRows(
      block({ weeks: 1 }),
      [student],
      [{ ...record("2025-01-06", "morning", "present"), student_id: "someone-else" }],
    );
    expect(rows[0]?.finalPoints).toBe(0);
  });

  it("accumulates points across weeks", () => {
    const rows = buildRegisterRows(
      block(),
      [student],
      [
        record("2025-01-06", "morning", "present"),
        record("2025-01-13", "morning", "present"),
        record("2025-01-13", "afternoon", "present"),
      ],
    );
    const weeks = rows[0]!.weeks;
    expect(weeks[0]?.weekPoints).toBe(2);
    expect(weeks[0]?.cumulative).toBe(2);
    expect(weeks[1]?.weekPoints).toBe(4);
    expect(weeks[1]?.cumulative).toBe(6);
    expect(rows[0]?.finalPoints).toBe(6);
  });

  it("scores the percentage against the 100% weekly target", () => {
    const perfectWeek = [
      "2025-01-06",
      "2025-01-07",
      "2025-01-08",
      "2025-01-09",
      "2025-01-10",
    ].flatMap((date) => [record(date, "morning", "present"), record(date, "afternoon", "present")]);
    const rows = buildRegisterRows(block({ weeks: 1 }), [student], perfectWeek);
    expect(rows[0]?.finalPoints).toBe(20);
    expect(rows[0]?.percentage).toBe(Math.round((20 / REGISTER_WEEK_TARGET_100) * 1000) / 10);
  });

  it("renders at least one week for a block with no week count", () => {
    const rows = buildRegisterRows(block({ weeks: 0 }), [student], []);
    expect(rows[0]?.weeks).toHaveLength(1);
    expect(rows[0]?.percentage).toBe(0);
  });

  it("exposes the register targets used by the PDF export", () => {
    expect(REGISTER_WEEK_TARGET_80).toBe(15);
    expect(REGISTER_WEEK_TARGET_100).toBe(18);
  });
});
