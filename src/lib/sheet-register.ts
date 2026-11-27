import { blockSessions, summarise, type AttendanceRecord, type Block } from "@/lib/attendance";
import { colIndexToLetter, type ParsedSheetLayout } from "@/lib/sheet-layout";

export type RegisterBlock = Pick<
  Block,
  "name" | "start_date" | "end_date" | "meditation_days" | "institution" | "percent_per_session" | "rounding_dates" | "holiday_dates"
>;

export function registerSignature(block: RegisterBlock): string {
  const holidays = [...(block.holiday_dates ?? [])].sort();
  const base = ["website-register-v3", block.name, block.start_date, block.end_date,
    block.institution, block.percent_per_session ?? null, [...(block.rounding_dates ?? [])].sort()];
  return JSON.stringify(holidays.length > 0 ? [...base, holidays] : base);
}

function weekKey(date: string, start: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (7 * 86_400_000));
}

/** Website schedule is authoritative; no attendance columns are inherited from the template. */
export function buildWebsiteRegister(block: RegisterBlock, identity: ParsedSheetLayout) {
  const startColumn = Math.max(identity.studentNoCol, identity.lastNameCol, identity.firstNameCol,
    identity.emailCol, (identity.columns[0]?.colIndex ?? 6) - 1) + 1;
  const headers: (string | number)[][] = Array.from({ length: 5 }, () => []);
  const sessions = blockSessions(block);
  const scheduled = [...sessions.compulsory, ...sessions.optional].sort((a, b) =>
    a.date.localeCompare(b.date) || ["morning", "afternoon", "evening"].indexOf(a.slot) - ["morning", "afternoon", "evening"].indexOf(b.slot));
  const weeks = Array.from({ length: Math.max(1, weekKey(block.end_date, block.start_date) + 1) }, (_, i) => i);
  const columns: ParsedSheetLayout["columns"] = [];
  const weekly: { key: number; pointsColumn: number; cumulativeColumn: number }[] = [];
  let col = startColumn;
  const setHeader = (row: number, column: number, value: string | number) => {
    const target = headers[row];
    if (target) target[column - startColumn] = value;
  };
  setHeader(0, col, `${block.name} — ${weeks.length} week${weeks.length === 1 ? "" : "s"} (${block.start_date} to ${block.end_date})`);
  setHeader(1, col, registerSignature(block));
  for (const [index, key] of weeks.entries()) {
    let previousDate = "";
    const weekSessions = scheduled.filter((entry) => weekKey(entry.date, block.start_date) === key);
    if (weekSessions.length === 0) continue;
    for (const s of weekSessions) {
      const slotHeader = s.slot === "morning" ? "AM" : s.slot === "afternoon" ? "PM" : "Evening";
      const dayHeader = s.date === previousDate ? "" : s.date;
      setHeader(2, col, `Week ${index + 1}${(block.rounding_dates ?? []).includes(s.date) ? " — Rounding" : ""}`);
      setHeader(3, col, dayHeader);
      setHeader(4, col, slotHeader);
      columns.push({ colIndex: col, colLetter: colIndexToLetter(col), date: s.date, slot: s.slot, dayHeader, slotHeader });
      previousDate = s.date;
      col += 1;
    }
    weekly.push({ key, pointsColumn: col, cumulativeColumn: col + 1 });
    setHeader(2, col, `Week ${index + 1}`);
    setHeader(3, col, "Week summary");
    setHeader(4, col++, "Week Actual Points");
    setHeader(3, col, "Website percentage");
    setHeader(4, col++, "Cumulative Attendance %");
  }
  const pointsColumn = col++;
  const percentageColumn = col++;
  setHeader(3, pointsColumn, "Block summary");
  setHeader(4, pointsColumn, "Block Final Points");
  setHeader(3, percentageColumn, "Website overall percentage");
  setHeader(4, percentageColumn, "Overall Attendance %");
  const width = col - startColumn;
  for (const row of headers) {
    for (let i = 0; i < width; i += 1) row[i] ??= "";
  }
  return { startColumn, columnCount: col, headers, weekly, pointsColumn, percentageColumn,
    layout: { ...identity, headerRowIndex: 4, dayRowIndex: 3, dataStartRow: 6, columns } };
}

export function buildRegisterSummaryValues(
  block: RegisterBlock,
  register: ReturnType<typeof buildWebsiteRegister>,
  records: Pick<AttendanceRecord, "session_date" | "slot" | "points" | "status">[],
): { column: number; value: string | number }[] {
  const inBlock = records.filter((r) => r.session_date >= block.start_date && r.session_date <= block.end_date);
  const result: { column: number; value: string | number }[] = [];
  for (const week of register.weekly) {
    const weekRecords = inBlock.filter((r) => weekKey(r.session_date, block.start_date) === week.key);
    const cumulative = inBlock.filter((r) => weekKey(r.session_date, block.start_date) <= week.key);
    result.push({ column: week.pointsColumn, value: summarise(block, weekRecords).pointsEarned });
    result.push({ column: week.cumulativeColumn, value: `${summarise(block, cumulative).percentage}%` });
  }
  // Pass exactly the same block records as the website, including records retained after a block date edit.
  const overall = summarise(block, records);
  result.push({ column: register.pointsColumn, value: overall.pointsEarned });
  result.push({ column: register.percentageColumn, value: `${overall.percentage}%` });
  return result;
}