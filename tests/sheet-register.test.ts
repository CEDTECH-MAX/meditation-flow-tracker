import { describe, expect, it } from "vitest";
import { summarise } from "../src/lib/attendance";
import { parseSheetColumns } from "../src/lib/sheet-layout";
import { buildWebsiteRegister, buildRegisterSummaryValues, type RegisterBlock } from "../src/lib/sheet-register";

const block: RegisterBlock = { name: "Two weeks", start_date: "2026-11-09", end_date: "2026-11-22",
  meditation_days: 12, institution: "MII", percent_per_session: 5.6, rounding_dates: [] };
const identity = parseSheetColumns([[], [], [], ["", "", "", "", "", "", "MON"],
  ["", "LAST", "FIRST", "STUDENT NO", "TM TEACHER", "Group No", "AM", "PM"]], block.start_date);

describe("website-driven Google Sheets registers", () => {
  it("creates exactly two weeks of sessions for a two-week block, not the four-week template", () => {
    const register = buildWebsiteRegister(block, identity);
    expect(register.weekly).toHaveLength(2);
    expect(register.layout.columns).toHaveLength(24);
    expect(register.layout.columns.every((c) => c.date >= "2026-11-09" && c.date <= "2026-11-22")).toBe(true);
  });
  it("includes no third session when rounding is disabled", () => {
    expect(buildWebsiteRegister(block, identity).layout.columns.filter((c) => c.slot === "evening")).toEqual([]);
  });
  it("still shows two weeks when a fourteen-day block starts midweek", () => {
    const register = buildWebsiteRegister({ ...block, start_date: "2026-11-11", end_date: "2026-11-24" }, identity);
    expect(register.weekly).toHaveLength(2);
    expect(register.layout.columns.filter((c) => c.date === "2026-11-24")).toHaveLength(2);
  });
  it("creates three 2-point slots only on the selected rounding day", () => {
    const register = buildWebsiteRegister({ ...block, rounding_dates: ["2026-11-11"] }, identity);
    expect(register.layout.columns.filter((c) => c.date === "2026-11-11").map((c) => c.slot)).toEqual(["morning", "afternoon", "evening"]);
    expect(register.layout.columns.filter((c) => c.slot === "evening").map((c) => c.date)).toEqual(["2026-11-11"]);
  });
  it("keeps MIU Friday morning only, without Saturday or Friday afternoon", () => {
    const columns = buildWebsiteRegister({ ...block, institution: "MIU" }, identity).layout.columns;
    expect(columns).toHaveLength(18);
    expect(columns.filter((c) => c.date === "2026-11-13").map((c) => c.slot)).toEqual(["morning"]);
    expect(columns.some((c) => c.date === "2026-11-14")).toBe(false);
  });
  it("uses the same overall percentage as the website, including full 2.0 = 5.6%", () => {
    const register = buildWebsiteRegister(block, identity);
    const records = [{ session_date: "2026-11-09", slot: "morning" as const, points: 2, status: "present" as const }];
    const result = buildRegisterSummaryValues(block, register, records);
    expect(result.find((r) => r.column === register.percentageColumn)?.value).toBe("5.6%");
    expect(summarise(block, records).percentage).toBe(5.6);
  });
  it("mirrors excusals and optional points using legacy website calculations without capping at 100%", () => {
    const legacy = { ...block, percent_per_session: 0 };
    const register = buildWebsiteRegister(legacy, identity);
    const records = register.layout.columns.map((c) => ({ session_date: c.date, slot: c.slot, points: 2, status: "present" as const }));
    const result = buildRegisterSummaryValues(legacy, register, records);
    expect(result.find((r) => r.column === register.percentageColumn)?.value).toBe("133.3%");
    expect(summarise(legacy, records).percentage).toBe(133.3);
    const excused = [{ session_date: "2026-11-09", slot: "morning" as const, points: 0, status: "excused" as const },
      { session_date: "2026-11-09", slot: "afternoon" as const, points: 2, status: "present" as const }];
    expect(buildRegisterSummaryValues(legacy, register, excused).find((r) => r.column === register.percentageColumn)?.value).toBe("5.9%");
  });
  it("keeps overall percentage identical to the website when earlier records remain after a date edit", () => {
    const register = buildWebsiteRegister(block, identity);
    const records = [{ session_date: "2026-11-02", slot: "morning" as const, points: 2, status: "present" as const }];
    expect(summarise(block, records).percentage).toBe(5.6);
    expect(buildRegisterSummaryValues(block, register, records).find((r) => r.column === register.percentageColumn)?.value).toBe("5.6%");
  });
  it("round-trips generated headers through the existing sync parser, including rounding evening slots", () => {
    const rounded = { ...block, rounding_dates: ["2026-11-11"] };
    const register = buildWebsiteRegister(rounded, identity);
    const rows = register.headers.map((row) => [...Array.from({ length: register.startColumn }, () => ""), ...row]);
    const row5 = rows[4];
    if (!row5) throw new Error("Missing student header");
    row5[1] = "LAST"; row5[2] = "FIRST"; row5[3] = "STUDENT NO";
    const parsed = parseSheetColumns(rows, block.start_date);
    expect(parsed.columns.map((c) => [c.date, c.slot])).toEqual(register.layout.columns.map((c) => [c.date, c.slot]));
  });
});