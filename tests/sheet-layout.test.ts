import { describe, expect, it } from "vitest";
import {
  createStudentMatcher,
  parseSheetColumns,
  parseSheetPoints,
  parseSpreadsheetGid,
  parseSpreadsheetId,
} from "../src/lib/sheet-layout";

describe("parseSpreadsheetId & parseSpreadsheetGid", () => {
  it("extracts spreadsheet ID and gid from a full Google Sheets URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1bDUUuVBoUpsFwGGu7B6JV8P6xTNSKeZ3qC5cCWtVPwc/edit?gid=640080935#gid=640080935";
    expect(parseSpreadsheetId(url)).toBe("1bDUUuVBoUpsFwGGu7B6JV8P6xTNSKeZ3qC5cCWtVPwc");
    expect(parseSpreadsheetGid(url)).toBe(640080935);
  });
});

describe("parseSheetColumns (MII 4-week register with rounding days)", () => {
  it("maps standard days, skips extra-points and summary columns, and maps 3-column rounding days", () => {
    const row4 = [
      "", "", "", "", "PROGRAMMES", "",
      "MONDAY", "", "TUESDAY", "", "WEDNESDAY", "", "", "THU", "", "FRI", "", "SAT", "", "For 80% Points", "",
      "MON", "", "TUE", "", "WED- Rounding", "", "", "", "THU", "", "FRI", "SAT- Rounding", "", "", "For 80% Points WK 3", "",
    ];
    const row5 = [
      "", "LAST", "FIRST", "STUDENT NO", "TM TEACHER", "Group No",
      "AM", "PM", "AM", "PM", "AM", "PM", "Yellow ->Extra points", "AM", "PM", "AM", "PM-extra", "AM-Extra", "PM-Extra", "Week Actual Points", "Block Cumulv Points",
      "AM", "PM", "AM", "PM", "AM 1st", "AM 2nd", "PM", "Yellow-> Extra points", "AM", "PM", "AM", "AM 1ST", "AM 2ND", "PM", "Week Actual Points", "Block Cumulv Points",
    ];
    const rows = [[], [], [], row4, row5];

    const layout = parseSheetColumns(rows, "2026-11-09");
    expect(layout.studentNoCol).toBe(3);
    expect(layout.lastNameCol).toBe(1);
    expect(layout.firstNameCol).toBe(2);
    expect(layout.dataStartRow).toBe(6);

    const byKey = new Map(layout.columns.map((c) => [`${c.date}:${c.slot}`, c.colLetter]));
    expect(byKey.get("2026-11-09:morning")).toBe("G");
    expect(byKey.get("2026-11-09:afternoon")).toBe("H");
    expect(byKey.get("2026-11-11:afternoon")).toBe("L");
    expect(layout.columns.some((c) => c.colLetter === "M")).toBe(false);
    expect(byKey.get("2026-11-12:morning")).toBe("N");
    expect(byKey.get("2026-11-14:afternoon")).toBe("S");
    expect(byKey.get("2026-11-16:morning")).toBe("V");
    expect(byKey.get("2026-11-18:morning")).toBe("Z");
    expect(byKey.get("2026-11-18:afternoon")).toBe("AA");
    expect(byKey.get("2026-11-18:evening")).toBe("AB");
    expect(byKey.get("2026-11-20:morning")).toBe("AF");
    expect(byKey.get("2026-11-20:afternoon")).toBeUndefined();
    expect(byKey.get("2026-11-21:morning")).toBe("AG");
    expect(byKey.get("2026-11-21:afternoon")).toBe("AH");
    expect(byKey.get("2026-11-21:evening")).toBe("AI");
  });
});

describe("createStudentMatcher", () => {
  const matcher = createStudentMatcher([
    { id: "s1", student_number: "0211005", full_name: "Bolofo Reamohetswe" },
    { id: "s2", student_number: "MI21B", full_name: "Buthelezi S'phokuhle Sbonelo" },
  ]);

  it("matches numeric student numbers even when Google Sheets strips leading zeros", () => {
    expect(matcher.matchSheetRow("211005", "Bolofo", "Reamohetswe")?.id).toBe("s1");
  });

  it("falls back to full name when student_number does not match", () => {
    expect(matcher.matchSheetRow("211010", "Buthelezi", "S'phokuhle Sbonelo")?.id).toBe("s2");
  });
});

describe("parseSheetPoints", () => {
  it("accepts only valid meditation dropdown points (0, 0.5, 1, 1.5, 2) or empty", () => {
    expect(parseSheetPoints("2.0")).toBe(2);
    expect(parseSheetPoints("1.5")).toBe(1.5);
    expect(parseSheetPoints("0.0")).toBe(0);
    expect(parseSheetPoints("")).toBeNull();
    expect(parseSheetPoints("3.0")).toBe("invalid");
    expect(parseSheetPoints("present")).toBe("invalid");
  });
});