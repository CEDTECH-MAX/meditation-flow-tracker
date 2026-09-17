import ExcelJS from "exceljs";
import { dateKey } from "@/lib/attendance";
import type {
  AttendanceRecord,
  Block,
  ClassRecord,
  ClassSession,
} from "@/lib/attendance";
import type { RegisterStudent } from "@/lib/register-export";

/**
 * MIU-only attendance register workbook. It matches the MIU Excel template
 * (Student List, one sheet per teaching week, Absenteeism Summary, Program
 * Summary and Formula Sheet) and is completely separate from the MII
 * "Consciousness Attendance Register" produced by register-export.ts.
 */

const ORANGE = "FFB45F06";
const RED = "FF990000";
const GREEN_FILL = "FFB6D7A8";
const BLUE_FILL = "FFCFE2F3";
const GREY_FILL = "FFD9D9D9";

/** Points a full week of programme attendance is worth in the MIU template. */
const WEEK_PROGRAM_TARGET = 14.5;
const FOUR_WEEK_TARGET = 58;
const FOUR_WEEK_MAX = 72;

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function colLetter(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function monday(startDate: string, weekIndex: number) {
  const d = new Date(startDate + "T00:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + weekIndex * 7);
  return d;
}

function shift(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function pad(n: number) {
  return `${n}`.padStart(2, "0");
}

/** Sheet name in the template's own style, e.g. "August 17-20". */
function weekLabel(mon: Date) {
  const thu = shift(mon, 3);
  return `${MONTHS[mon.getMonth()]} ${pad(mon.getDate())}-${pad(thu.getDate())}`;
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? "", last: "", middle: "" };
  return {
    first: parts[0] ?? "",
    middle: parts.slice(1, -1).join(" "),
    last: parts[parts.length - 1] ?? "",
  };
}

function header(cell: ExcelJS.Cell, value: string, fill?: string) {
  cell.value = value;
  cell.font = { bold: true, size: 9 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
}

export type MiuRegisterInput = {
  block: Block;
  groupName: string;
  students: RegisterStudent[];
  /** Meditation (programme) attendance for the block. */
  records: AttendanceRecord[];
  classSessions: ClassSession[];
  classRecords: ClassRecord[];
};

export async function exportMiuRegisterWorkbook(input: MiuRegisterInput, filename: string) {
  const { block, groupName, students, records, classSessions, classRecords } = input;
  const weeks = Math.max(1, block.weeks || 1);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Maharishi Invincibility University";

  const weekMondays = Array.from({ length: weeks }, (_, w) => monday(block.start_date, w));
  const weekNames = weekMondays.map(weekLabel);

  /* ------------------------------ Student List --------------------------- */
  const list = wb.addWorksheet("Student List", { views: [{ state: "frozen", ySplit: 1 }] });
  const listHeaders = [
    "No",
    "Group",
    "Location",
    "Surname",
    "First Name",
    "Second & Third Names",
    "Full Name on Diploma",
    "Emails",
    "MIU Emails",
    "MIU ID",
    "Programme",
  ];
  listHeaders.forEach((label, i) => {
    header(list.getCell(1, i + 1), label, GREY_FILL);
    list.getColumn(i + 1).width = i === 0 ? 5 : i >= 7 ? 28 : 16;
  });
  students.forEach((s, i) => {
    const { first, middle, last } = splitName(s.full_name);
    const row = list.getRow(i + 2);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = s.cohort_name ?? groupName;
    row.getCell(3).value = "";
    row.getCell(4).value = last;
    row.getCell(5).value = first;
    row.getCell(6).value = middle;
    row.getCell(7).value = s.full_name;
    row.getCell(8).value = s.email ?? "";
    row.getCell(9).value = s.internal_email ?? "";
    row.getCell(10).value = s.student_number ?? "";
    row.getCell(11).value = s.programme ?? "";
  });

  /* ---------------------------- weekly sheets ---------------------------- */
  const sessionByDate = new Map<string, ClassSession[]>();
  for (const s of classSessions) {
    const day = sessionByDate.get(s.session_date) ?? [];
    day.push(s);
    sessionByDate.set(s.session_date, day);
  }
  const classByKey = new Map<string, ClassRecord>();
  for (const r of classRecords) classByKey.set(`${r.session_id}:${r.student_id}`, r);
  const medByKey = new Map<string, AttendanceRecord>();
  for (const r of records) medByKey.set(`${r.student_id}:${r.session_date}:${r.slot}`, r);

  const medPoints = (studentId: string, date: string, slot: "morning" | "afternoon") => {
    const rec = medByKey.get(`${studentId}:${date}:${slot}`);
    return rec ? Number(rec.points ?? 0) : 0;
  };

  /** Class attendance for one student on one date, across that day's classes. */
  function classDay(studentId: string, date: string) {
    const day = sessionByDate.get(date) ?? [];
    if (day.length === 0) return { attended: "", mode: "", comment: "" };
    let attended = false;
    let online = false;
    const comments: string[] = [];
    for (const s of day) {
      const rec = classByKey.get(`${s.id}:${studentId}`);
      if (rec && Number(rec.points ?? 0) > 0) attended = true;
      if (rec?.mode === "online") online = true;
      if (rec?.comment) comments.push(rec.comment);
    }
    return {
      attended: attended ? "Yes" : "No",
      mode: attended ? (online ? "Online" : "In class") : "Absent",
      comment: comments.join(" · "),
    };
  }

  /** Per-week, per-student absence + programme totals reused by the summaries. */
  const weekTotals: { absent: number; program: number }[][] = students.map(() => []);

  weekMondays.forEach((mon, w) => {
    const ws = wb.addWorksheet(weekNames[w]!, {
      views: [{ state: "frozen", xSplit: 5, ySplit: 3 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    ws.mergeCells(1, 6, 1, 26);
    const title = ws.getCell(1, 6);
    title.value = `${block.name} · ${groupName} · Week ${w + 1} (${weekNames[w]})`;
    title.font = { bold: true, size: 13, color: { argb: ORANGE } };
    title.alignment = { horizontal: "center" };

    const leftHeaders = ["NR", "Group", "Location", "Last Name", "First Name"];
    leftHeaders.forEach((label, i) => {
      header(ws.getCell(3, i + 1), label, GREY_FILL);
      ws.getColumn(i + 1).width = i === 0 ? 5 : 16;
    });

    // 5 columns per class day: attended / mode / behaviour / AM / PM
    DAYS.forEach((day, d) => {
      const base = 6 + d * 5;
      header(ws.getCell(2, base), "Student attended class", GREEN_FILL);
      header(ws.getCell(2, base + 1), "In class OR Online only", GREEN_FILL);
      ws.mergeCells(2, base + 3, 2, base + 4);
      header(ws.getCell(2, base + 3), "Program Attendance", BLUE_FILL);
      const date = shift(mon, d);
      header(ws.getCell(3, base), `${day} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`);
      header(ws.getCell(3, base + 1), "Online/In Class");
      header(ws.getCell(3, base + 2), "Student Behavior in Class");
      header(ws.getCell(3, base + 3), "Morning");
      header(ws.getCell(3, base + 4), "Afternoon");
      ws.getColumn(base).width = 14;
      ws.getColumn(base + 1).width = 13;
      ws.getColumn(base + 2).width = 26;
      ws.getColumn(base + 3).width = 10;
      ws.getColumn(base + 4).width = 10;
    });

    const friCol = 26; // Z
    ws.mergeCells(2, friCol, 2, friCol + 1);
    header(ws.getCell(2, friCol), "Friday Program", BLUE_FILL);
    header(ws.getCell(3, friCol), "Morning");
    header(ws.getCell(3, friCol + 1), "PM- Extra");
    ws.mergeCells(2, friCol + 2, 2, friCol + 3);
    header(ws.getCell(2, friCol + 2), "Saturday", BLUE_FILL);
    header(ws.getCell(3, friCol + 2), "AM-Extra");
    header(ws.getCell(3, friCol + 3), "PM- Extra");
    header(ws.getCell(3, friCol + 4), "Total absence this week");
    header(ws.getCell(3, friCol + 5), "Total Program Attendance");
    header(ws.getCell(3, friCol + 6), "Oustanding Credits");
    for (let i = 0; i < 7; i += 1) ws.getColumn(friCol + i).width = i >= 4 ? 15 : 11;

    students.forEach((student, sIdx) => {
      const row = 4 + sIdx;
      const { first, last } = splitName(student.full_name);
      ws.getCell(row, 1).value = sIdx + 1;
      ws.getCell(row, 2).value = student.cohort_name ?? groupName;
      ws.getCell(row, 3).value = "";
      ws.getCell(row, 4).value = last;
      ws.getCell(row, 5).value = first;

      let absent = 0;
      let program = 0;
      const pointCells: string[] = [];

      DAYS.forEach((_, d) => {
        const base = 6 + d * 5;
        const date = dateKey(shift(mon, d));
        const info = classDay(student.id, date);
        ws.getCell(row, base).value = info.attended;
        ws.getCell(row, base + 1).value = info.mode;
        ws.getCell(row, base + 2).value = info.comment;
        if (info.attended === "No") absent += 1;
        const am = medPoints(student.id, date, "morning");
        const pm = medPoints(student.id, date, "afternoon");
        program += am + pm;
        for (const [offset, value] of [
          [3, am],
          [4, pm],
        ] as [number, number][]) {
          const cell = ws.getCell(row, base + offset);
          cell.value = value;
          cell.numFmt = "#,##0.0";
          pointCells.push(`${colLetter(base + offset)}${row}`);
        }
      });

      const friday = dateKey(shift(mon, 4));
      const saturday = dateKey(shift(mon, 5));
      const bonus: [number, number][] = [
        [friCol, medPoints(student.id, friday, "morning")],
        [friCol + 1, medPoints(student.id, friday, "afternoon")],
        [friCol + 2, medPoints(student.id, saturday, "morning")],
        [friCol + 3, medPoints(student.id, saturday, "afternoon")],
      ];
      for (const [col, value] of bonus) {
        const cell = ws.getCell(row, col);
        cell.value = value;
        cell.numFmt = "#,##0.0";
        pointCells.push(`${colLetter(col)}${row}`);
        program += value;
      }

      ws.getCell(row, friCol + 4).value = absent;
      const total = ws.getCell(row, friCol + 5);
      total.value = { formula: pointCells.join("+") };
      total.numFmt = "#,##0.0";
      const owed = ws.getCell(row, friCol + 6);
      owed.value = { formula: `${WEEK_PROGRAM_TARGET}-${colLetter(friCol + 5)}${row}` };
      owed.numFmt = "#,##0.0";

      weekTotals[sIdx]!.push({ absent, program: Math.round(program * 10) / 10 });
    });

    ws.getRow(2).height = 28;
    ws.getRow(3).height = 34;
  });

  /* ------------------------ Absenteeism Summary Sheet -------------------- */
  const abs = wb.addWorksheet("Absenteeism Summary Sheet", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });
  header(abs.getCell(1, 1), "Last Name", GREY_FILL);
  header(abs.getCell(1, 2), "First Name", GREY_FILL);
  weekNames.forEach((name, i) => header(abs.getCell(1, 3 + i), name, GREY_FILL));
  const absTotalCol = 3 + weeks;
  header(abs.getCell(1, absTotalCol), "Total Absenteeism", GREEN_FILL);
  header(abs.getCell(1, absTotalCol + 1), "Comments", GREY_FILL);
  abs.getColumn(1).width = 18;
  abs.getColumn(2).width = 18;
  for (let i = 0; i < weeks + 2; i += 1) abs.getColumn(3 + i).width = 16;
  abs.getColumn(absTotalCol + 1).width = 34;

  students.forEach((student, sIdx) => {
    const row = 2 + sIdx;
    const { first, last } = splitName(student.full_name);
    abs.getCell(row, 1).value = last;
    abs.getCell(row, 2).value = first;
    weekNames.forEach((_, w) => {
      abs.getCell(row, 3 + w).value = weekTotals[sIdx]?.[w]?.absent ?? 0;
    });
    const total = abs.getCell(row, absTotalCol);
    total.value = {
      formula: `SUM(${colLetter(3)}${row}:${colLetter(2 + weeks)}${row})`,
    };
    total.font = { bold: true };
  });

  /* -------------------------- Program Summary Sheet ---------------------- */
  const prog = wb.addWorksheet("Program Summary Sheet", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
  });
  header(prog.getCell(2, 1), "Last Name", GREY_FILL);
  header(prog.getCell(2, 2), "First Name", GREY_FILL);
  prog.getColumn(1).width = 18;
  prog.getColumn(2).width = 18;

  // Column layout: [week, Comments] per week, plus accumulative columns after
  // every four weeks, exactly like the template.
  type ProgCol =
    | { kind: "week"; week: number; col: number }
    | { kind: "comment"; col: number }
    | { kind: "outstanding"; group: number; col: number }
    | { kind: "accum"; group: number; col: number }
    | { kind: "pct"; group: number; col: number };
  const progCols: ProgCol[] = [];
  let col = 3;
  for (let w = 0; w < weeks; w += 1) {
    header(prog.getCell(1, col), `Week ${w + 1}`);
    header(prog.getCell(2, col), weekNames[w]!, GREEN_FILL);
    progCols.push({ kind: "week", week: w, col });
    prog.getColumn(col).width = 16;
    col += 1;
    header(prog.getCell(2, col), "Comments", GREY_FILL);
    progCols.push({ kind: "comment", col });
    prog.getColumn(col).width = 24;
    col += 1;
    if ((w + 1) % 4 === 0 || w === weeks - 1) {
      const group = Math.floor(w / 4);
      header(prog.getCell(2, col), "Four Weeks Accumulative", BLUE_FILL);
      progCols.push({ kind: "outstanding", group, col });
      prog.getColumn(col).width = 18;
      col += 1;
      header(prog.getCell(2, col), "Accumulative points", BLUE_FILL);
      progCols.push({ kind: "accum", group, col });
      prog.getColumn(col).width = 18;
      col += 1;
      header(prog.getCell(2, col), "Percentage of target", BLUE_FILL);
      progCols.push({ kind: "pct", group, col });
      prog.getColumn(col).width = 18;
      col += 1;
    }
  }

  students.forEach((student, sIdx) => {
    const row = 3 + sIdx;
    const { first, last } = splitName(student.full_name);
    prog.getCell(row, 1).value = last;
    prog.getCell(row, 2).value = first;
    for (const entry of progCols) {
      if (entry.kind === "week") {
        const cell = prog.getCell(row, entry.col);
        cell.value = weekTotals[sIdx]?.[entry.week]?.program ?? 0;
        cell.numFmt = "#,##0.0";
      } else if (entry.kind === "accum") {
        const members = progCols.filter(
          (c) => c.kind === "week" && Math.floor(c.week / 4) === entry.group,
        );
        const cell = prog.getCell(row, entry.col);
        cell.value = {
          formula: members.map((m) => `${colLetter(m.col)}${row}`).join("+") || "0",
        };
        cell.numFmt = "#,##0.0";
      } else if (entry.kind === "outstanding") {
        const accum = progCols.find((c) => c.kind === "accum" && c.group === entry.group);
        const cell = prog.getCell(row, entry.col);
        cell.value = accum
          ? { formula: `${FOUR_WEEK_TARGET}-${colLetter(accum.col)}${row}` }
          : 0;
        cell.numFmt = "#,##0.0";
      } else if (entry.kind === "pct") {
        const accum = progCols.find((c) => c.kind === "accum" && c.group === entry.group);
        const cell = prog.getCell(row, entry.col);
        cell.value = accum
          ? { formula: `${colLetter(accum.col)}${row}/${FOUR_WEEK_MAX}` }
          : 0;
        cell.numFmt = "0.0%";
      }
    }
  });

  /* ------------------------------ Formula Sheet -------------------------- */
  const fs = wb.addWorksheet("Formula Sheet");
  header(fs.getCell(1, 1), "Class Options", GREY_FILL);
  header(fs.getCell(1, 2), "Absenteeism Days", GREY_FILL);
  header(fs.getCell(1, 4), "Program", GREY_FILL);
  header(fs.getCell(1, 7), "Detailed", GREY_FILL);
  ["Yes", "No"].forEach((v, i) => (fs.getCell(3 + i, 1).value = v));
  [0, 1, 2, 3, 4].forEach((v, i) => (fs.getCell(2 + i, 2).value = v));
  const program: [string, number][] = [
    ["Did not attend Program", 0],
    ["Full program attendance", 2],
  ];
  program.forEach(([label, value], i) => {
    fs.getCell(2 + i, 4).value = label;
    fs.getCell(2 + i, 5).value = value;
  });
  [
    "Online/permission granted",
    "In class",
    "Group Assignment",
    "Absent",
    "Online/Sick",
    "Online/ NO permission",
    "Public Holiday",
    "In class/Lesson not attended",
    "Reported absent",
  ].forEach((v, i) => (fs.getCell(2 + i, 7).value = v));
  fs.getColumn(1).width = 18;
  fs.getColumn(2).width = 18;
  fs.getColumn(4).width = 26;
  fs.getColumn(5).width = 10;
  fs.getColumn(7).width = 30;
  fs.getCell(1, 1).font = { bold: true, color: { argb: RED } };

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
