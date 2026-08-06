import ExcelJS from "exceljs";
import type { AttendanceRecord, Block } from "@/lib/attendance";

/**
 * Builds the institutional "Consciousness Attendance Register" workbook, matching
 * the Maharishi Institute Excel template exactly. Weeks are laid out horizontally
 * (15 columns each) and only the weeks that exist in the block are rendered — a
 * 2-week block produces 2 week sections, a 4-week block produces 4.
 */

export type RegisterStudent = {
  id: string;
  full_name: string;
  student_number: string | null;
  email: string | null;
  internal_email?: string | null;
  programme?: string | null;
  cohort_name?: string | null;
};

const LEFT_COLS = 8;
const WEEK_COLS = 15;
const WEEK_TARGET_80 = 15;
const WEEK_TARGET_100 = 18;
const FULL_POINTS = 2;
const LATE_POINTS = 1.5;

const NOTE =
  "2.0 = attend full progr; \n1.5 = if arrive late; \n1.0 = if do not do Asanas;\nNote: If leave within last 10 min you lose 0.5 points\n";
const STATUS_LEGEND =
  "Block Credit Status                                            Over 100% - Platinum                                           90% - 99.9%  - Gold                                           80% -89.9% -Green (Pass)                            Below 80% -Red- No Pass";

const ORANGE = "FFB45F06";
const RED = "FF990000";
const GREEN_FILL = "FFB6D7A8";
const BLUE_FILL = "FFCFE2F3";
const YELLOW_FILL = "FFFFFF00";
const GREY_FILL = "FFD9D9D9";

export function colLetter(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Monday of the week containing the block start, offset by whole weeks. */
function weekMonday(startDate: string, weekIndex: number) {
  const d = new Date(startDate + "T00:00:00");
  const dow = d.getDay(); // 0 = Sunday
  const backTo = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - backTo + weekIndex * 7);
  return d;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function points(record: AttendanceRecord | undefined) {
  if (!record) return 0;
  if (record.status === "present") {
    return record.absence_reason === "late_arrival" ? LATE_POINTS : FULL_POINTS;
  }
  if (record.absence_reason === "late_arrival") return LATE_POINTS;
  return 0;
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] ?? "" };
}

const LEFT_HEADERS = [
  "NO",
  "LAST",
  "FIRST",
  "STUDENT NO",
  "phase 2",
  "TM-Teacher",
  "EMAIL ADDRESS",
  "Group No",
];
const LEFT_WIDTHS = [4.63, 16.38, 21, 9.25, 17.13, 10, 10.75, 8.13];
const WEEK_WIDTHS = [
  10.63, 8.38, 8.63, 8.75, 9, 9.5, 6.38, 9.25, 9.63, 8.25, 8.75, 11.13, 9.25, 8.63, 8.63,
];
const DAY_LABELS: { offset: number; label: string; span: number }[] = [
  { offset: 0, label: "MONDAY", span: 2 },
  { offset: 2, label: "TUESDAY", span: 2 },
  { offset: 4, label: "WEDNESDAY", span: 2 },
  { offset: 7, label: "THU", span: 2 },
  { offset: 9, label: "FRI", span: 2 },
  { offset: 11, label: "SAT", span: 2 },
];
const SLOT_LABELS = [
  "AM",
  "PM",
  "AM",
  "PM",
  "AM",
  "PM",
  "Yellow ->Extra points",
  "AM",
  "PM",
  "AM",
  "PM-extra",
  "AM-Extra",
  "PM-Extra",
  "Week Actual Points",
  "Block Cumulv Points",
];
/** offsets of the AM/PM cells for Mon..Sat (Wed is followed by the extra-points column) */
const SLOT_OFFSETS: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [7, 8],
  [9, 10],
  [11, 12],
];

export async function exportRegisterWorkbook(
  block: Block,
  groupName: string,
  students: RegisterStudent[],
  records: AttendanceRecord[],
  filename: string,
) {
  const weeks = Math.max(1, block.weeks || 1);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Maharishi Institute";
  const ws = wb.addWorksheet(`BLOCK - ${weeks} WEEKS`, {
    views: [{ state: "frozen", xSplit: 4, ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const finalPointsCol = LEFT_COLS + 1 + weeks * WEEK_COLS;
  const finalPctCol = finalPointsCol + 1;

  // ---- left header block -------------------------------------------------
  ws.mergeCells(1, 2, 2, 2);
  ws.mergeCells(1, 3, 2, 3);
  const gn = ws.getCell(1, 2);
  gn.value = `GROUP NAME : ${groupName.toUpperCase()}`;
  gn.font = { bold: true, color: { argb: ORANGE } };
  gn.alignment = { horizontal: "center", wrapText: true };
  const gn2 = ws.getCell(1, 3);
  gn2.value = groupName.toUpperCase();
  gn2.font = { bold: true, color: { argb: ORANGE } };
  gn2.alignment = { horizontal: "center", wrapText: true };

  ws.mergeCells(4, 1, 4, 3);
  ws.getCell(4, 1).value = "students details";
  ws.mergeCells(4, 7, 4, 8);
  const prog = ws.getCell(4, 7);
  prog.value = "PROGRAMMES";
  prog.font = { bold: true, size: 8 };

  LEFT_HEADERS.forEach((label, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = label;
    cell.font = { bold: true, size: label === "EMAIL ADDRESS" ? 8 : 10 };
    cell.alignment = { horizontal: i === 0 ? "left" : "center", wrapText: true };
    ws.getColumn(i + 1).width = LEFT_WIDTHS[i];
  });

  // ---- per-week sections -------------------------------------------------
  for (let w = 0; w < weeks; w += 1) {
    const base = LEFT_COLS + 1 + w * WEEK_COLS;
    const L = (offset: number) => colLetter(base + offset);
    const monday = weekMonday(block.start_date, w);

    WEEK_WIDTHS.forEach((width, i) => {
      ws.getColumn(base + i).width = width;
    });

    // row 1
    ws.mergeCells(1, base, 2, base + 2);
    const title = ws.getCell(1, base);
    title.value = "CONSCIOUSNESS ATTENDANCE REGISTER";
    title.font = { bold: true, size: 15, color: { argb: ORANGE } };
    title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    ws.mergeCells(1, base + 4, 1, base + 5);
    const t80 = ws.getCell(1, base + 4);
    t80.value = "For 80% Points";
    t80.font = { bold: true, color: { argb: ORANGE } };
    t80.alignment = { horizontal: "center" };

    ws.mergeCells(1, base + 7, 1, base + 8);
    const t100 = ws.getCell(1, base + 7);
    t100.value = "For 100% Points";
    t100.font = { bold: true, color: { argb: ORANGE } };
    t100.alignment = { horizontal: "center" };

    ws.mergeCells(1, base + 12, 2, base + 14);
    const note = ws.getCell(1, base + 12);
    note.value = NOTE;
    note.alignment = { wrapText: true, vertical: "top" };
    note.font = { size: 9 };

    // row 2
    const subs: [number, string, string][] = [
      [base + 4, `WEEK ${w + 1} This Week `, GREEN_FILL],
      [base + 5, "Block Cumulv", GREEN_FILL],
      [base + 7, "This Week", BLUE_FILL],
      [base + 8, "Block Cumulv", BLUE_FILL],
    ];
    for (const [col, label, fill] of subs) {
      const cell = ws.getCell(2, col);
      cell.value = label;
      cell.font = { color: { argb: RED } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = { horizontal: "center", wrapText: true };
    }

    // row 3
    const row3: [number, string | number][] = [
      [base, block.name.toUpperCase()],
      [base + 1, `Week ${w + 1}`],
      [base + 2, groupName],
      [base + 4, WEEK_TARGET_80],
      [base + 5, WEEK_TARGET_80 * (w + 1)],
      [base + 7, WEEK_TARGET_100],
      [base + 8, WEEK_TARGET_100 * (w + 1)],
    ];
    for (const [col, value] of row3) {
      const cell = ws.getCell(3, col);
      cell.value = value;
      cell.font = { bold: true, color: { argb: RED } };
      cell.alignment = { horizontal: "center", wrapText: true };
      if (typeof value === "number") cell.numFmt = "#,##0";
    }
    const weekTag = ws.getCell(3, base + 10);
    weekTag.value = `Week ${w + 1}`;
    weekTag.font = { bold: true, color: { argb: RED } };

    // row 4 — day names with the session dates for this week
    for (const { offset, label, span } of DAY_LABELS) {
      ws.mergeCells(4, base + offset, 4, base + offset + span - 1);
      const idx = DAY_LABELS.findIndex((d) => d.offset === offset);
      const date = new Date(monday);
      date.setDate(date.getDate() + idx);
      const cell = ws.getCell(4, base + offset);
      cell.value = `${label} ${date.getDate()}/${date.getMonth() + 1}`;
      cell.alignment = { horizontal: "center", wrapText: true };
    }
    ws.mergeCells(4, base + 13, 4, base + 14);
    const wk80 = ws.getCell(4, base + 13);
    wk80.value = `For 80% Points${weeks > 1 ? ` WK ${w + 1}` : ""}`;
    wk80.font = { color: { argb: RED } };
    wk80.alignment = { horizontal: "center", wrapText: true };

    // row 5 — AM/PM labels
    SLOT_LABELS.forEach((label, i) => {
      const cell = ws.getCell(5, base + i);
      cell.value = label;
      cell.alignment = { horizontal: "center", wrapText: true };
      if (i >= 13) cell.font = { color: { argb: RED } };
      else if (i === 6) cell.font = { size: 8 };
    });

    // ---- student rows ----
    students.forEach((student, sIdx) => {
      const row = 6 + sIdx;
      if (w === 0) {
        const { first, last } = splitName(student.full_name);
        ws.getCell(row, 1).value = sIdx + 1;
        ws.getCell(row, 1).alignment = { horizontal: "center" };
        ws.getCell(row, 2).value = last.toUpperCase();
        ws.getCell(row, 3).value = first;
        ws.getCell(row, 4).value = student.student_number ?? "";
        ws.getCell(row, 5).value = student.programme ?? "";
        ws.getCell(row, 6).value = "";
        const emailCell = ws.getCell(row, 7);
        emailCell.value = student.email ?? student.internal_email ?? "";
        emailCell.font = { size: 8 };
        ws.getCell(row, 8).value = student.cohort_name ?? "";
      }

      SLOT_OFFSETS.forEach(([amOffset, pmOffset], dayIdx) => {
        const date = new Date(monday);
        date.setDate(date.getDate() + dayIdx);
        const key = iso(date);
        const morning = records.find(
          (r) => r.student_id === student.id && r.session_date === key && r.slot === "morning",
        );
        const afternoon = records.find(
          (r) => r.student_id === student.id && r.session_date === key && r.slot === "afternoon",
        );
        for (const [offset, record] of [
          [amOffset, morning],
          [pmOffset, afternoon],
        ] as [number, AttendanceRecord | undefined][]) {
          const cell = ws.getCell(row, base + offset);
          cell.value = points(record);
          cell.numFmt = "#,##0.0";
          cell.alignment = { horizontal: "right" };
        }
      });

      const extra = ws.getCell(row, base + 6);
      extra.value = { formula: `SUM(${L(0)}${row}:${L(5)}${row})` };
      extra.numFmt = "#,##0.0";

      const actual = ws.getCell(row, base + 13);
      actual.value = { formula: `SUM(${L(6)}${row}:${L(12)}${row})` };
      actual.numFmt = "#,##0.0";
      actual.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_FILL } };

      const cumul = ws.getCell(row, base + 14);
      const prevCumul = colLetter(base - WEEK_COLS + 14);
      cumul.value = {
        formula:
          w === 0
            ? `${L(13)}${row}`
            : `SUM(${prevCumul}${row},${L(13)}${row})`,
      };
      cumul.numFmt = "#,##0.0";
      cumul.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_FILL } };
    });
  }

  // ---- block totals ------------------------------------------------------
  const legend = ws.getCell(1, finalPointsCol);
  ws.mergeCells(1, finalPointsCol, 3, finalPctCol);
  legend.value = STATUS_LEGEND;
  legend.font = { bold: true, color: { argb: RED }, size: 8 };
  legend.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY_FILL } };
  legend.alignment = { wrapText: true, vertical: "top" };

  const colourNote = ws.getCell(4, finalPointsCol);
  colourNote.value = "Colour for 80% Points";
  colourNote.font = { bold: true, color: { argb: RED }, size: 8 };
  colourNote.alignment = { horizontal: "center", wrapText: true };

  ws.mergeCells(4, finalPctCol, 5, finalPctCol);
  const pctHeader = ws.getCell(4, finalPctCol);
  pctHeader.value = "Block Atendance Calculated @ 100%";
  pctHeader.font = { bold: true, color: { argb: RED }, size: 8 };
  pctHeader.alignment = { horizontal: "center", wrapText: true };

  const finalHeader = ws.getCell(5, finalPointsCol);
  finalHeader.value = "Block Final Points";
  finalHeader.font = { color: { argb: RED } };
  finalHeader.alignment = { horizontal: "center", wrapText: true };

  ws.getColumn(finalPointsCol).width = 9.38;
  ws.getColumn(finalPctCol).width = 10.38;

  const weekActualLetters = Array.from({ length: weeks }, (_, w) =>
    colLetter(LEFT_COLS + 1 + w * WEEK_COLS + 13),
  );
  const target100Total = WEEK_TARGET_100 * weeks;

  students.forEach((_, sIdx) => {
    const row = 6 + sIdx;
    const total = ws.getCell(row, finalPointsCol);
    total.value = { formula: weekActualLetters.map((l) => `${l}${row}`).join("+") };
    total.numFmt = "#,##0.0";
    total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_FILL } };

    const pct = ws.getCell(row, finalPctCol);
    pct.value = { formula: `${colLetter(finalPointsCol)}${row}/${target100Total}` };
    pct.numFmt = "0.0%";
  });

  const lastRow = 5 + students.length;
  if (students.length > 0) {
    const pctRange = `${colLetter(finalPctCol)}6:${colLetter(finalPctCol)}${lastRow}`;
    ws.addConditionalFormatting({
      ref: pctRange,
      rules: [
        {
          type: "cellIs",
          operator: "greaterThanOrEqual",
          priority: 1,
          formulae: ["1"],
          style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D2E9" } } },
        },
        {
          type: "cellIs",
          operator: "greaterThanOrEqual",
          priority: 2,
          formulae: ["0.9"],
          style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD966" } } },
        },
        {
          type: "cellIs",
          operator: "greaterThanOrEqual",
          priority: 3,
          formulae: ["0.8"],
          style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFB6D7A8" } } },
        },
        {
          type: "cellIs",
          operator: "lessThan",
          priority: 4,
          formulae: ["0.8"],
          style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFEA9999" } } },
        },
      ],
    });

    for (let w = 0; w < weeks; w += 1) {
      const base = LEFT_COLS + 1 + w * WEEK_COLS;
      const actualCol = colLetter(base + 13);
      const cumulCol = colLetter(base + 14);
      ws.addConditionalFormatting({
        ref: `${actualCol}6:${actualCol}${lastRow}`,
        rules: [
          {
            type: "cellIs",
            operator: "lessThan",
            priority: 10 + w,
            formulae: [String(WEEK_TARGET_80)],
            style: { font: { color: { argb: "FFCC0000" }, bold: true } },
          },
        ],
      });
      ws.addConditionalFormatting({
        ref: `${cumulCol}6:${cumulCol}${lastRow}`,
        rules: [
          {
            type: "cellIs",
            operator: "lessThan",
            priority: 40 + w,
            formulae: [String(WEEK_TARGET_80 * (w + 1))],
            style: { font: { color: { argb: "FFCC0000" }, bold: true } },
          },
        ],
      });
    }
  }

  ws.getRow(1).height = 42;
  ws.getRow(5).height = 30;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
