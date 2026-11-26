import { describe, expect, it } from "vitest";
import {
  buildAttendanceClearRanges,
  buildHeaderUpdatesForNewBlock,
  createStudentMatcher,
  parseSheetColumns,
  parseSheetPoints,
  parseSpreadsheetGid,
  parseSpreadsheetId,
  sanitizeSheetTabName,
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

describe("new block tab helpers (real 4-week MII sheet layout)", () => {
  const realRow3 = [
    "", "", "", "", "", "",
    "BLOCK 10", "Week 1", "Gents MEDITATORS", "", "15", "15", "", "18", "18", "", "Week 1", "", "", "", "",
    "BLOCK 9", "Week 2", "Gents MEDITATORS", "", "15", "30", "", "18", "36", "", "Week 2", "", "", "", "", "",
    "BLOCK 10", "Week 3", "Gents MEDITATORS", "", "17", "", "47", "", "20", "56", "", "Week 3", "", "", "", "",
    "BLOCK 10", "Week 4", "Gents MEDITATORS", "", "15", "62", "", "18", "74", "", "Week 4",
  ];
  const realRow4 = [
    "", "", "", "", "PROGRAMMES", "",
    "MONDAY", "", "TUESDAY", "", "WEDNESDAY", "", "", "THU", "", "FRI", "", "SAT", "", "For 80% Points", "",
    "MON", "", "TUE", "", "WED", "", "", "THU", "", "FRI", "", "SAT", "", "", "For 80% Points", "",
    "MON", "", "TUE", "", "WED- Rounding", "", "", "", "THU", "", "FRI", "SAT- Rounding", "", "", "For 80% Points WK 3", "",
    "MON", "", "TUE", "", "WED", "", "", "THU", "", "FRI", "SAT Rounding ", "", "", "Colour for 80% Points", "", "Block Atendance Calculated @ 100%",
  ];
  const realRow5 = [
    "", "LAST", "FIRST", "STUDENT NO", "TM TEACHER", "Group No",
    "AM", "PM", "AM", "PM", "AM", "PM", "Yellow ->Extra points", "AM", "PM", "AM", "PM-extra", "AM-Extra", "PM-Extra", "Week Actual Points", "Block Cumulv Points",
    "AM", "PM", "AM", "PM", "AM", "PM", "Yellow-> Extra points", "AM", "PM", "AM", "PM-EXTRA", "1stAM", "AM-Extra ", "PM-EXTRA", "Week Actual Points", "Block Cumulv Points",
    "AM", "PM", "AM", "PM", "AM 1st", "AM 2nd", "PM", "Yellow-> Extra points", "AM", "PM", "AM", "AM 1ST", "AM 2ND", "PM", "Week Actual Points", "Block Cumulv Points",
    "AM", "PM", "AM", "PM", "AM", "PM", "Yellow-> Extra points", "AM", "PM", "AM ", "AM 1st", "AM-2nd", "PM", "Week Actual Points", "Block Final Points",
  ];

  it("never maps any formula column and builds minimal clear ranges that skip formulas and footer totals", () => {
    const headerRows = [[], [], realRow3, realRow4, realRow5];
    const layout = parseSheetColumns(headerRows, "2026-11-09");
    const formulaCols = new Set(["M", "T", "U", "AB", "AJ", "AK", "AS", "AZ", "BA", "BH", "BO", "BP", "BQ"]);
    for (const col of layout.columns) {
      expect(formulaCols.has(col.colLetter)).toBe(false);
    }

    const leftRows = [
      ...headerRows,
      ["1", "Bolofo", "Reamohetswe", "211005"],
      ["2", "Buthelezi", "S'phokuhle", "211010"],
      ["", "TOTAL", "", "=COUNTA(D6:D7)"],
    ];
    const ranges = buildAttendanceClearRanges("BLOCK 11", layout, leftRows);
    expect(ranges).toEqual([
      "'BLOCK 11'!G6:L7",
      "'BLOCK 11'!N6:S7",
      "'BLOCK 11'!V6:AA7",
      "'BLOCK 11'!AC6:AI7",
      "'BLOCK 11'!AL6:AR7",
      "'BLOCK 11'!AT6:AY7",
      "'BLOCK 11'!BB6:BG7",
      "'BLOCK 11'!BI6:BN7",
    ]);
  });

  it("updates BLOCK labels and shifts explicit date headers without touching formulas or summary text", () => {
    const headerRows = [
      ["", "GROUP NAME : GENTS MEDITATORS", "", "Block Credit Status"],
      ["", "", "", "Block Cumulv"],
      realRow3,
      ["", "", "", "", "", "", "2026-11-09", "", "10/11/2026", "=G4+1"],
    ];
    const updates = buildHeaderUpdatesForNewBlock("BLOCK 11", headerRows, {
      blockName: "BLOCK 11",
      templateBlockName: "EZEMVELO BLOCK",
      templateStartDate: "2026-11-09",
      newStartDate: "2026-12-07",
    });

    const byRange = new Map(updates.map((u) => [u.range, u.values[0]?.[0]]));
    expect(byRange.get("'BLOCK 11'!G3")).toBe("BLOCK 11");
    expect(byRange.get("'BLOCK 11'!V3")).toBe("BLOCK 11");
    expect(byRange.get("'BLOCK 11'!AL3")).toBe("BLOCK 11");
    expect(byRange.get("'BLOCK 11'!BB3")).toBe("BLOCK 11");
    expect(byRange.get("'BLOCK 11'!G4")).toBe("2026-12-07");
    expect(byRange.get("'BLOCK 11'!I4")).toBe("08/12/2026");
    expect(byRange.has("'BLOCK 11'!J4")).toBe(false); // formula untouched
    expect(byRange.has("'BLOCK 11'!D2")).toBe(false); // "Block Cumulv" untouched
  });

  it("sanitizes forbidden Google Sheets tab name characters and enforces 100-char limit", () => {
    expect(sanitizeSheetTabName("Block 11: Dec/Jan [MII]*?")).toBe("Block 11- Dec-Jan -MII---");
    expect(sanitizeSheetTabName("A".repeat(120)).length).toBe(100);
    expect(sanitizeSheetTabName("   ")).toBe("New Block");
  });
});