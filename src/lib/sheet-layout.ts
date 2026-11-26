import { dateKey, type SessionSlot } from "@/lib/attendance";

export type MappedSheetColumn = {
  colIndex: number;
  colLetter: string;
  date: string;
  slot: SessionSlot;
  dayHeader: string;
  slotHeader: string;
};

export type ParsedSheetLayout = {
  headerRowIndex: number; // 0-based index of the slot/student header row (e.g. row 5 => 4)
  dayRowIndex: number; // 0-based index of the day header row (e.g. row 4 => 3)
  dataStartRow: number; // 1-based sheet row number where first student sits (e.g. 6)
  studentNoCol: number;
  lastNameCol: number;
  firstNameCol: number;
  emailCol: number;
  columns: MappedSheetColumn[];
};

export type SheetStudentRef = {
  id: string;
  student_number: string | null;
  full_name: string;
  email?: string | null;
};

const VALID_POINTS = new Set([0, 0.5, 1, 1.5, 2]);

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export function parseSpreadsheetGid(input: string): number | null {
  const match = input.match(/[?&#]gid=(\d+)/);
  return match?.[1] ? Number(match[1]) : null;
}

export function buildCanonicalSpreadsheetUrl(spreadsheetId: string, rawUrl?: string | null): string {
  const gid = rawUrl ? parseSpreadsheetGid(rawUrl) : null;
  return gid !== null
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export function colIndexToLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function normalizeStudentNo(value: string | number | null | undefined): string {
  const clean = cellText(value).toLowerCase().replace(/\s+/g, "");
  if (!clean) return "";
  if (/^\d+$/.test(clean)) return clean.replace(/^0+/, "") || "0";
  return clean;
}

export function normalizeName(value: string | number | null | undefined): string {
  return cellText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ");
}

export function parseSheetPoints(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "—" || s === "-") return null;
  const num = Number(s.replace(",", "."));
  if (!Number.isFinite(num)) return "invalid";
  const rounded = Math.round(num * 10) / 10;
  return VALID_POINTS.has(rounded) ? rounded : "invalid";
}

function parseWeekdayOffset(label: string): number | null {
  const s = label.trim().toUpperCase();
  if (!s) return null;
  if (/^MON(DAY)?(\b|[\s\-_/])/.test(s) || s === "MON" || s === "MONDAY") return 0;
  if (/^TUE(S|SDAY)?(\b|[\s\-_/])/.test(s) || s === "TUE" || s === "TUESDAY") return 1;
  if (/^WED(NESDAY)?(\b|[\s\-_/])/.test(s) || s === "WED" || s === "WEDNESDAY") return 2;
  if (/^THU(R|RS|RSDAY)?(\b|[\s\-_/])/.test(s) || s === "THU" || s === "THURSDAY") return 3;
  if (/^FRI(DAY)?(\b|[\s\-_/])/.test(s) || s === "FRI" || s === "FRIDAY") return 4;
  if (/^SAT(URDAY)?(\b|[\s\-_/])/.test(s) || s === "SAT" || s === "SATURDAY") return 5;
  return null;
}

function parseExplicitDate(label: string): string | null {
  const s = label.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

function isSummaryOrSkipSlot(label: string): boolean {
  const s = label.trim().toLowerCase();
  if (!s) return true;
  return /(yellow|extra\s*points|actual|cumulv|cumulative|final|total|attendance|atendance|calculated|%|status|credit|colour|color|points)/.test(
    s,
  );
}

function isAttendanceSlot(label: string): boolean {
  if (isSummaryOrSkipSlot(label)) return false;
  const s = label.trim().toLowerCase();
  return /\b(am|pm)\b|am\s*1|am\s*2|1st\s*am|2nd\s*am|am-2nd|am-extra|pm-extra|morning|afternoon|evening/.test(s);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function mondayOf(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return dateKey(d);
}

/**
 * Parses the register header rows into concrete (date, slot) column mappings.
 * Supports both horizontal multi-week MII/MIU register sheets (MON..SAT with
 * Yellow extra-points separators and 3-column Rounding days) and sheets with
 * explicit YYYY-MM-DD / DD/MM/YYYY date headers.
 */
export function parseSheetColumns(rows: unknown[][], blockStartDate: string): ParsedSheetLayout {
  let headerRowIndex = -1;
  let studentNoCol = -1;
  let lastNameCol = -1;
  let firstNameCol = -1;
  let emailCol = -1;

  const maxScan = Math.min(rows.length, 15);
  for (let r = 0; r < maxScan; r += 1) {
    const row = rows[r] ?? [];
    for (let c = 0; c < Math.min(row.length, 15); c += 1) {
      const cell = cellText(row[c]).toUpperCase().replace(/\s+/g, " ");
      if (cell === "STUDENT NO" || cell === "STUDENT NUMBER" || cell === "STUDENT ID") {
        headerRowIndex = r;
        studentNoCol = c;
        break;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (headerRowIndex === -1) {
    headerRowIndex = Math.min(4, Math.max(0, rows.length - 1));
  }

  const slotRow = rows[headerRowIndex] ?? [];
  const dayRowIndex = Math.max(0, headerRowIndex - 1);
  const dayRow = rows[dayRowIndex] ?? [];

  for (let c = 0; c < Math.min(slotRow.length, 15); c += 1) {
    const cell = cellText(slotRow[c]).toUpperCase().replace(/\s+/g, " ");
    if (studentNoCol === -1 && (cell === "STUDENT NO" || cell === "STUDENT NUMBER")) studentNoCol = c;
    if (lastNameCol === -1 && (cell === "LAST" || cell === "SURNAME" || cell === "LAST NAME")) lastNameCol = c;
    if (firstNameCol === -1 && (cell === "FIRST" || cell === "FIRST NAME" || cell === "NAME")) firstNameCol = c;
    if (emailCol === -1 && cell.includes("EMAIL")) emailCol = c;
  }

  const maxCols = Math.max(slotRow.length, dayRow.length);
  const startCol = Math.max(studentNoCol, lastNameCol, firstNameCol, emailCol, 0) + 1;
  const baseMonday = mondayOf(blockStartDate);

  const columns: MappedSheetColumn[] = [];
  let weekIndex = 0;
  let lastDow = -1;
  let activeDate: string | null = null;
  let activeDayHeader = "";
  let dayBucket: { colIndex: number; slotHeader: string }[] = [];

  const flushBucket = () => {
    if (!activeDate || dayBucket.length === 0) {
      dayBucket = [];
      return;
    }
    const slots: SessionSlot[] =
      dayBucket.length >= 3
        ? ["morning", "afternoon", "evening"]
        : dayBucket.length === 2
          ? ["morning", "afternoon"]
          : [
              /evening/i.test(dayBucket[0]?.slotHeader ?? "") ? "evening" :
                /^\s*pm\b|afternoon/i.test(dayBucket[0]?.slotHeader ?? "") ? "afternoon" : "morning",
            ];
    for (let i = 0; i < Math.min(dayBucket.length, slots.length); i += 1) {
      const entry = dayBucket[i]!;
      columns.push({
        colIndex: entry.colIndex,
        colLetter: colIndexToLetter(entry.colIndex),
        date: activeDate,
        slot: slots[i]!,
        dayHeader: activeDayHeader,
        slotHeader: entry.slotHeader,
      });
    }
    dayBucket = [];
  };

  for (let c = startCol; c < maxCols; c += 1) {
    const rawDay = cellText(dayRow[c]);
    const rawSlot = cellText(slotRow[c]);

    const explicit = parseExplicitDate(rawDay);
    const dow = explicit ? null : parseWeekdayOffset(rawDay);

    if (explicit) {
      flushBucket();
      activeDate = explicit;
      activeDayHeader = rawDay;
    } else if (dow !== null) {
      flushBucket();
      if (lastDow !== -1 && dow <= lastDow) weekIndex += 1;
      lastDow = dow;
      activeDate = addDays(baseMonday, weekIndex * 7 + dow);
      activeDayHeader = rawDay;
    } else if (rawDay && !isAttendanceSlot(rawSlot)) {
      // Summary section header like "For 80% Points"
      flushBucket();
      activeDate = null;
      activeDayHeader = "";
    }

    if (!activeDate) continue;

    if (isAttendanceSlot(rawSlot)) {
      dayBucket.push({ colIndex: c, slotHeader: rawSlot });
    } else if (isSummaryOrSkipSlot(rawSlot)) {
      // Separator like "Yellow ->Extra points" ends the current day group
      flushBucket();
      activeDate = null;
      activeDayHeader = "";
    }
  }
  flushBucket();

  return {
    headerRowIndex,
    dayRowIndex,
    dataStartRow: headerRowIndex + 2, // 1-based row after header
    studentNoCol,
    lastNameCol,
    firstNameCol,
    emailCol,
    columns,
  };
}

export function sanitizeSheetTabName(name: string): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "New Block";
}

export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function isSummaryOrFormulaRow(row: unknown[]): boolean {
  for (let c = 0; c < Math.min(row.length, 6); c += 1) {
    const cell = cellText(row[c]);
    if (!cell) continue;
    if (cell.startsWith("=")) return true;
    if (/^(total|totals|grand total|subtotal|summary|average|count)\b/i.test(cell)) return true;
  }
  return false;
}

export function computeStudentRowSpans(
  layout: ParsedSheetLayout,
  leftRows: unknown[][],
): [number, number][] {
  let lastStudentRow = layout.dataStartRow - 1;
  for (let r = layout.dataStartRow - 1; r < leftRows.length; r += 1) {
    const row = leftRows[r] ?? [];
    if (isSummaryOrFormulaRow(row)) continue;
    const no = layout.studentNoCol >= 0 ? cellText(row[layout.studentNoCol]) : "";
    const last = layout.lastNameCol >= 0 ? cellText(row[layout.lastNameCol]) : "";
    const first = layout.firstNameCol >= 0 ? cellText(row[layout.firstNameCol]) : "";
    if (no || last || first) lastStudentRow = r + 1;
  }
  if (lastStudentRow < layout.dataStartRow) return [];

  const rowSpans: [number, number][] = [];
  let spanStart: number | null = null;
  for (let sheetRow = layout.dataStartRow; sheetRow <= lastStudentRow; sheetRow += 1) {
    const row = leftRows[sheetRow - 1] ?? [];
    if (isSummaryOrFormulaRow(row)) {
      if (spanStart !== null) {
        rowSpans.push([spanStart, sheetRow - 1]);
        spanStart = null;
      }
    } else if (spanStart === null) {
      spanStart = sheetRow;
    }
  }
  if (spanStart !== null) rowSpans.push([spanStart, lastStudentRow]);
  return rowSpans;
}

export function computeAttendanceColumnSpans(layout: ParsedSheetLayout): [number, number][] {
  const sortedCols = [...layout.columns].sort((a, b) => a.colIndex - b.colIndex);
  const colSpans: [number, number][] = [];
  for (const col of sortedCols) {
    const prev = colSpans[colSpans.length - 1];
    if (prev && col.colIndex === prev[1] + 1) {
      prev[1] = col.colIndex;
    } else if (!prev || col.colIndex > prev[1]) {
      colSpans.push([col.colIndex, col.colIndex]);
    }
  }
  return colSpans;
}

/**
 * Builds minimal contiguous A1 ranges covering only mapped attendance columns
 * across student rows so `values:batchClear` removes old marks while preserving
 * all formulas, headers, student rows, formatting, and dropdown validations.
 */
export function buildAttendanceClearRanges(
  sheetName: string,
  layout: ParsedSheetLayout,
  leftRows: unknown[][],
): string[] {
  if (layout.columns.length === 0) return [];

  const rowSpans = computeStudentRowSpans(layout, leftRows);
  if (rowSpans.length === 0) return [];

  const colSpans = computeAttendanceColumnSpans(layout);

  const quoted = quoteSheetName(sheetName);
  const ranges: string[] = [];
  for (const [rStart, rEnd] of rowSpans) {
    for (const [cStart, cEnd] of colSpans) {
      ranges.push(`${quoted}!${colIndexToLetter(cStart)}${rStart}:${colIndexToLetter(cEnd)}${rEnd}`);
    }
  }
  return ranges;
}

export type SheetDropdownRequest = {
  setDataValidation: {
    range: {
      sheetId: number;
      startRowIndex: number;
      endRowIndex: number;
      startColumnIndex: number;
      endColumnIndex: number;
    };
    rule?: {
      condition: {
        type: "ONE_OF_LIST";
        values: { userEnteredValue: string }[];
      };
      strict: boolean;
      showCustomUi: boolean;
    };
  };
};

const ATTENDANCE_DROPDOWN_RULE = {
  condition: {
    type: "ONE_OF_LIST" as const,
    values: ["2.0", "1.5", "1.0", "0.5", "0.0"].map((v) => ({ userEnteredValue: v })),
  },
  strict: true,
  showCustomUi: true,
};

/**
 * Builds Google Sheets `setDataValidation` batchUpdate requests for attendance columns:
 * - `remove`: strips dropdown validation across all attendance columns from `dataStartRow`
 *   through the bottom of the sheet while keeping every recorded mark and formula intact.
 * - `restore`: restores the 2.0 / 1.5 / 1.0 / 0.5 / 0.0 dropdown across student rows.
 */
export function buildDropdownValidationRequests(opts: {
  sheetId: number;
  layout: ParsedSheetLayout;
  leftRows: unknown[][];
  rowCount: number;
  mode: "remove" | "restore";
}): SheetDropdownRequest[] {
  const colSpans = computeAttendanceColumnSpans(opts.layout);
  if (colSpans.length === 0) return [];

  if (opts.mode === "remove") {
    const startRowIndex = Math.max(0, opts.layout.dataStartRow - 1);
    const endRowIndex = Math.max(startRowIndex + 1, opts.rowCount);
    return colSpans.map(([cStart, cEnd]) => ({
      setDataValidation: {
        range: {
          sheetId: opts.sheetId,
          startRowIndex,
          endRowIndex,
          startColumnIndex: cStart,
          endColumnIndex: cEnd + 1,
        },
      },
    }));
  }

  const rowSpans = computeStudentRowSpans(opts.layout, opts.leftRows);
  if (rowSpans.length === 0) return [];
  const requests: SheetDropdownRequest[] = [];
  for (const [rStart, rEnd] of rowSpans) {
    for (const [cStart, cEnd] of colSpans) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId: opts.sheetId,
            startRowIndex: rStart - 1,
            endRowIndex: rEnd,
            startColumnIndex: cStart,
            endColumnIndex: cEnd + 1,
          },
          rule: ATTENDANCE_DROPDOWN_RULE,
        },
      });
    }
  }
  return requests;
}

function diffDaysIso(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function shiftFormattedDate(raw: string, deltaDays: number): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return addDays(s, deltaDays);
  const dmy = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/);
  if (dmy?.[1] && dmy[2] && dmy[3] && dmy[4]) {
    const sep = dmy[2];
    const shifted = addDays(`${dmy[4]}-${dmy[3].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`, deltaDays);
    const [y, m, d] = shifted.split("-");
    return `${d}${sep}${m}${sep}${y}`;
  }
  return null;
}

/**
 * Updates block-title headers (e.g. "BLOCK 10") and shifts explicit date headers
 * on a freshly duplicated template tab without touching formulas or summary labels.
 */
export function buildHeaderUpdatesForNewBlock(
  sheetName: string,
  headerRows: unknown[][],
  opts: {
    blockName: string;
    templateBlockName?: string | null;
    templateStartDate?: string | null;
    newStartDate: string;
  },
): { range: string; values: string[][] }[] {
  const updates: { range: string; values: string[][] }[] = [];
  const quoted = quoteSheetName(sheetName);
  const templateNameLower = cellText(opts.templateBlockName).toLowerCase();
  const deltaDays =
    opts.templateStartDate && opts.newStartDate
      ? diffDaysIso(opts.templateStartDate, opts.newStartDate)
      : 0;

  const maxRows = Math.min(headerRows.length, 6);
  for (let r = 0; r < maxRows; r += 1) {
    const row = headerRows[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const raw = cellText(row[c]);
      if (!raw || raw.startsWith("=")) continue;

      if (deltaDays !== 0) {
        const shifted = shiftFormattedDate(raw, deltaDays);
        if (shifted && shifted !== raw) {
          updates.push({
            range: `${quoted}!${colIndexToLetter(c)}${r + 1}`,
            values: [[shifted]],
          });
          continue;
        }
      }

      // Update standalone block labels in the top title rows (rows 1-4)
      if (r <= 3) {
        const isNumberedBlockLabel = /^BLOCK\s*#?\s*\d+$/i.test(raw);
        const isTemplateNameMatch =
          Boolean(templateNameLower) && raw.toLowerCase() === templateNameLower;
        if ((isNumberedBlockLabel || isTemplateNameMatch) && raw !== opts.blockName) {
          updates.push({
            range: `${quoted}!${colIndexToLetter(c)}${r + 1}`,
            values: [[opts.blockName]],
          });
        }
      }
    }
  }
  return updates;
}

export type StudentMatcher = {
  matchSheetRow: (studentNo: string, lastName: string, firstName: string, email?: string) => SheetStudentRef | null;
};

/**
 * Matches students strictly inside one institution using:
 * 1. Exact student_number
 * 2. Leading-zero-stripped numeric student_number (e.g. 0211005 <-> 211005)
 * 3. Email address (if present)
 * 4. Full name fallback ("LAST FIRST" or "FIRST LAST")
 */
export function createStudentMatcher(students: SheetStudentRef[]): StudentMatcher {
  const byExactNo = new Map<string, SheetStudentRef>();
  const byNormNo = new Map<string, SheetStudentRef>();
  const byEmail = new Map<string, SheetStudentRef>();
  const byName = new Map<string, SheetStudentRef | "ambiguous">();

  const registerName = (key: string, s: SheetStudentRef) => {
    if (!key) return;
    const existing = byName.get(key);
    if (!existing) byName.set(key, s);
    else if (existing !== "ambiguous" && existing.id !== s.id) byName.set(key, "ambiguous");
  };

  for (const s of students) {
    const rawNo = (s.student_number ?? "").trim().toLowerCase();
    if (rawNo) {
      byExactNo.set(rawNo, s);
      const norm = normalizeStudentNo(rawNo);
      if (norm && !byNormNo.has(norm)) byNormNo.set(norm, s);
    }
    const em = (s.email ?? "").trim().toLowerCase();
    if (em) byEmail.set(em, s);

    const normFull = normalizeName(s.full_name);
    registerName(normFull, s);
    const parts = normFull.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      registerName(`${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`, s);
      registerName(`${parts.slice(1).join(" ")} ${parts[0]}`, s);
    }
  }

  return {
    matchSheetRow(studentNo, lastName, firstName, email = "") {
      const rawNo = cellText(studentNo).toLowerCase();
      if (rawNo) {
        const exact = byExactNo.get(rawNo);
        if (exact) return exact;
        const norm = byNormNo.get(normalizeStudentNo(rawNo));
        if (norm) return norm;
      }
      const em = cellText(email).toLowerCase();
      if (em) {
        const found = byEmail.get(em);
        if (found) return found;
      }
      const lf = normalizeName(`${cellText(lastName)} ${cellText(firstName)}`);
      if (lf) {
        const m = byName.get(lf);
        if (m && m !== "ambiguous") return m;
      }
      const fl = normalizeName(`${cellText(firstName)} ${cellText(lastName)}`);
      if (fl) {
        const m = byName.get(fl);
        if (m && m !== "ambiguous") return m;
      }
      return null;
    },
  };
}

export function buildAppsScript(params: {
  webhookUrl: string;
  linkId: string;
  secret: string;
  sheetName: string;
  dataStartRow: number;
  studentNoCol: number; // 0-based
  lastNameCol: number;
  firstNameCol: number;
}): string {
  const stCol = params.studentNoCol >= 0 ? params.studentNoCol + 1 : 4;
  const lnCol = params.lastNameCol >= 0 ? params.lastNameCol + 1 : 2;
  const fnCol = params.firstNameCol >= 0 ? params.firstNameCol + 1 : 3;

  return `// MeditationFlo Live Sync — Paste into Extensions -> Apps Script
// Step 1: Paste this code and click Save (Ctrl+S).
// Step 2: Pick "setupAutoSync" in the toolbar and click Run once to grant permission.
// Step 3: Done! Every dropdown mark on linked block tabs (including new tabs created from the website) syncs automatically.

const SYNC_URL = ${JSON.stringify(params.webhookUrl)};
const LINK_ID = ${JSON.stringify(params.linkId)};
const SYNC_SECRET = ${JSON.stringify(params.secret)};
const DATA_START_ROW = ${params.dataStartRow};
const STUDENT_NO_COL = ${stCol};
const LAST_NAME_COL = ${lnCol};
const FIRST_NAME_COL = ${fnCol};
const VALID_MARK_RE = /^(|[-—]|0(\\.[0])?|0[.,]5|1(\\.[0])?|1[.,]5|2(\\.[0])?)$/;

function setupAutoSync() {
  const ss = SpreadsheetApp.getActive();
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === "handleAttendanceEdit") ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger("handleAttendanceEdit").forSpreadsheet(ss).onEdit().create();
  SpreadsheetApp.getUi().alert("Live sync is now active for all linked MeditationFlo tabs in this spreadsheet.");
}

function handleAttendanceEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();

  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  const startCol = e.range.getColumn();
  const numCols = e.range.getNumColumns();
  if (startRow + numRows - 1 < DATA_START_ROW) return;

  const values = e.range.getDisplayValues();
  const edits = [];
  for (let r = 0; r < numRows; r++) {
    const sheetRow = startRow + r;
    if (sheetRow < DATA_START_ROW) continue;
    const studentNo = String(sheet.getRange(sheetRow, STUDENT_NO_COL).getDisplayValue() || "").trim();
    const lastName = String(sheet.getRange(sheetRow, LAST_NAME_COL).getDisplayValue() || "").trim();
    const firstName = String(sheet.getRange(sheetRow, FIRST_NAME_COL).getDisplayValue() || "").trim();
    if (!studentNo && !lastName && !firstName) continue;
    for (let c = 0; c < numCols; c++) {
      const val = String(values[r][c] || "").trim();
      if (!VALID_MARK_RE.test(val)) continue;
      edits.push({
        row: sheetRow,
        col: startCol + c,
        student_number: studentNo,
        last_name: lastName,
        first_name: firstName,
        value: val,
      });
    }
  }
  if (edits.length === 0) return;

  UrlFetchApp.fetch(SYNC_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Sheet-Sync-Secret": SYNC_SECRET },
    payload: JSON.stringify({ link_id: LINK_ID, sheet_name: sheetName, edits: edits }),
    muteHttpExceptions: true,
  });
}
`;
}