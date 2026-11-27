import { describe, expect, it } from "vitest";
import { blockDates, blockSessions, buildCalendar, sessionKind, summarise } from "../src/lib/attendance";
import { parseSheetColumns } from "../src/lib/sheet-layout";
import { buildRegisterSummaryValues, buildWebsiteRegister, registerSignature, type RegisterBlock } from "../src/lib/sheet-register";

const miiBlock: RegisterBlock = {
  name: "Block 11",
  start_date: "2026-11-09",
  end_date: "2026-11-22",
  meditation_days: 11,
  institution: "MII",
  percent_per_session: 0,
  rounding_dates: [],
  holiday_dates: ["2026-11-11"],
};

const identity = parseSheetColumns(
  [
    [],
    [],
    [],
    ["", "", "", "", "", "", "MON"],
    ["", "LAST", "FIRST", "STUDENT NO", "TM TEACHER", "Group No", "AM", "PM"],
  ],
  miiBlock.start_date,
);

describe("block holiday / no-meditation days", () => {
  it("omits selected holidays from MII block dates, sessions, calendar, and compulsory totals", () => {
    expect(blockDates(miiBlock)).not.toContain("2026-11-11");
    expect(blockDates(miiBlock)).toHaveLength(11);
    expect(sessionKind("2026-11-11", "morning", "MII", [], ["2026-11-11"])).toBe("none");
    expect(sessionKind("2026-11-11", "afternoon", "MII", [], ["2026-11-11"])).toBe("none");
    // 2 weeks normally has 18 compulsory sessions; removing Wednesday drops 2 compulsory sessions -> 16.
    expect(blockSessions(miiBlock).compulsory).toHaveLength(16);
    expect(buildCalendar(miiBlock, []).some((c) => c.date === "2026-11-11")).toBe(false);
  });

  it("keeps holiday overrides ahead of rounding dates and ignores stray marks on holidays", () => {
    const conflictBlock = { ...miiBlock, rounding_dates: ["2026-11-11"], holiday_dates: ["2026-11-11"] };
    expect(sessionKind("2026-11-11", "evening", "MII", ["2026-11-11"], ["2026-11-11"])).toBe("none");
    const summary = summarise(conflictBlock, [
      { session_date: "2026-11-11", slot: "morning", points: 2, status: "present" },
      { session_date: "2026-11-09", slot: "morning", points: 2, status: "present" },
    ]);
    expect(summary.totalSessions).toBe(16);
    expect(summary.pointsEarned).toBe(2);
    expect(summary.percentage).toBe(6.3);
  });

  it("omits holidays for MIU while preserving MIU Monday-Thursday + Friday morning schedule", () => {
    const miuBlock: RegisterBlock = {
      ...miiBlock,
      institution: "MIU",
      holiday_dates: ["2026-11-13"], // Friday holiday
    };
    expect(blockDates(miuBlock)).not.toContain("2026-11-13");
    expect(blockDates(miuBlock)).not.toContain("2026-11-14"); // Saturday still excluded for MIU
    // 2 MIU weeks normally has 18 sessions (2 * 9); removing one Friday removes 1 session -> 17.
    expect(blockSessions(miuBlock).compulsory).toHaveLength(17);
  });

  it("excludes holidays from generated Google Sheets registers and keeps percentages identical to website", () => {
    const register = buildWebsiteRegister(miiBlock, identity);
    expect(register.layout.columns.some((c) => c.date === "2026-11-11")).toBe(false);
    expect(register.layout.columns).toHaveLength(22); // 24 normal MII slots minus 2 slots on holiday
    const records = [{ session_date: "2026-11-09", slot: "morning" as const, points: 2, status: "present" as const }];
    const sheetSummary = buildRegisterSummaryValues(miiBlock, register, records);
    expect(sheetSummary.find((r) => r.column === register.percentageColumn)?.value).toBe(`${summarise(miiBlock, records).percentage}%`);
  });

  it("keeps legacy register signature unchanged when no holidays are set, and updates signature when holidays exist", () => {
    const withoutHolidays = { ...miiBlock, holiday_dates: [] };
    expect(registerSignature(withoutHolidays)).not.toBe(registerSignature(miiBlock));
    expect(registerSignature(withoutHolidays)).toBe(registerSignature({ ...miiBlock, holiday_dates: undefined }));
  });
});