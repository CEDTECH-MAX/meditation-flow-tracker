import ExcelJS from "exceljs";
import { dateKey } from "@/lib/attendance";

/**
 * Reads an uploaded register workbook (the institution's own weekly template)
 * and works out how long the block is and what each session is worth.
 *
 * It looks for the weekly sheets (named like "August 17-20"), counts the
 * meditation point columns on those sheets (Morning / Afternoon / AM-Extra /
 * PM-Extra) and reads the weekly credit target from the "Outstanding Credits"
 * formula (e.g. `14.5-AE4`).
 */

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const WEEK_SHEET_RE = /^([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})$/;

export type BlockTemplateInfo = {
  fileName: string;
  weekSheets: string[];
  weeks: number;
  daysPerWeek: number;
  sessionsPerWeek: number;
  totalSessions: number;
  meditationDays: number;
  sessionPointValue: number;
  weeklyRequiredPoints: number;
  weeklyReferencePoints: number;
  percentPerSession: number;
  startDate: string;
  endDate: string;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "richText" in (value as any)) {
    return ((value as any).richText ?? []).map((t: any) => t.text).join("");
  }
  if (typeof value === "object" && "formula" in (value as any)) {
    return String((value as any).formula ?? "");
  }
  return "";
}

function monthIndex(name: string) {
  return MONTHS.indexOf(name.trim().toLowerCase());
}

/** Find the header row that contains the day / points headings. */
function findHeaderRow(ws: ExcelJS.Worksheet) {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const row = ws.getRow(r);
    let hits = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = cellText(cell.value).trim().toLowerCase();
      if (t === "morning" || t === "afternoon" || t.includes("extra")) hits += 1;
    });
    if (hits >= 2) return row;
  }
  return null;
}

export async function parseBlockTemplate(file: File): Promise<BlockTemplateInfo> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const weekSheets = wb.worksheets
    .map((ws) => ws.name)
    .filter((name) => WEEK_SHEET_RE.test(name.trim()));

  if (weekSheets.length === 0) {
    throw new Error(
      "No weekly sheets found in that file. Weekly sheets should be named like \"August 17-20\".",
    );
  }

  const first = wb.getWorksheet(weekSheets[0]!)!;
  const header = findHeaderRow(first);

  let sessionsPerWeek = 0;
  const dayColumns = new Set<string>();
  if (header) {
    header.eachCell({ includeEmpty: false }, (cell) => {
      const t = cellText(cell.value).trim().toLowerCase();
      if (t === "morning" || t === "afternoon" || t.includes("extra")) sessionsPerWeek += 1;
      if (
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].some((d) =>
          t.startsWith(d),
        )
      ) {
        dayColumns.add(t.slice(0, 3));
      }
    });
  }
  if (sessionsPerWeek === 0) sessionsPerWeek = 12;

  // Weekly credit target, read from the "14.5-AE4"-style formula.
  let weeklyRequiredPoints = 0;
  outer: for (let r = 1; r <= Math.min(12, first.rowCount); r += 1) {
    const row = first.getRow(r);
    for (let c = 1; c <= row.cellCount; c += 1) {
      const v = row.getCell(c).value as any;
      const formula = v && typeof v === "object" && "formula" in v ? String(v.formula) : "";
      const m = formula.match(/^\s*(\d+(?:\.\d+)?)\s*-/);
      if (m) {
        weeklyRequiredPoints = Number(m[1]);
        break outer;
      }
    }
  }

  // Highest point value used in the template = what a full session is worth.
  let sessionPointValue = 0;
  for (let r = 1; r <= Math.min(first.rowCount, 60); r += 1) {
    const row = first.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (typeof v === "number" && v > 0 && v <= 5) sessionPointValue = Math.max(sessionPointValue, v);
    });
  }
  if (!sessionPointValue) sessionPointValue = 2;

  const weeks = weekSheets.length;
  const daysPerWeek = dayColumns.size > 0 ? Math.max(dayColumns.size, 4) : 6;

  // Dates from the sheet names: first sheet's start day → last sheet's week end.
  const now = new Date();
  let year = now.getFullYear();
  const firstMatch = weekSheets[0]!.trim().match(WEEK_SHEET_RE)!;
  const firstMonth = monthIndex(firstMatch[1]!);
  if (firstMonth < 0) throw new Error(`Could not read the month in the sheet "${weekSheets[0]}".`);
  const start = new Date(year, firstMonth, Number(firstMatch[2]));

  // Walk the sheets so months that roll into the next year stay in order.
  let lastMonth = firstMonth;
  let endDay = Number(firstMatch[3]);
  let endMonth = firstMonth;
  for (const name of weekSheets.slice(1)) {
    const m = name.trim().match(WEEK_SHEET_RE)!;
    const mi = monthIndex(m[1]!);
    if (mi < 0) continue;
    if (mi < lastMonth) year += 1;
    lastMonth = mi;
    endMonth = mi;
    endDay = Number(m[3]);
  }
  const end = new Date(year, endMonth, endDay);
  if (endDay < Number(firstMatch[3]) && endMonth === firstMonth && weeks > 1) {
    end.setMonth(end.getMonth() + 1);
  }
  // Weekly sheets end on Thursday; the block week runs to Saturday.
  end.setDate(end.getDate() + 2);

  const totalSessions = weeks * sessionsPerWeek;

  return {
    fileName: file.name,
    weekSheets,
    weeks,
    daysPerWeek,
    sessionsPerWeek,
    totalSessions,
    meditationDays: weeks * daysPerWeek,
    sessionPointValue,
    weeklyRequiredPoints: weeklyRequiredPoints || sessionsPerWeek * sessionPointValue,
    weeklyReferencePoints: sessionsPerWeek * sessionPointValue,
    percentPerSession: Math.round((100 / Math.max(1, totalSessions)) * 100) / 100,
    startDate: dateKey(start),
    endDate: dateKey(end),
  };
}
