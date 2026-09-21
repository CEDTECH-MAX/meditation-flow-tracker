import ExcelJS from "exceljs";
import templateUrl from "@/assets/miu-register-template.xlsx?url";
import { classModeLabel, dateKey } from "@/lib/attendance";
import type {
  AttendanceRecord,
  Block,
  ClassRecord,
  ClassSession,
} from "@/lib/attendance";
import type { RegisterStudent } from "@/lib/register-export";

/**
 * MIU-only attendance register. This exporter fills the institution's own
 * uploaded workbook (src/assets/miu-register-template.xlsx) so the export is
 * visually identical to the template: every sheet, header, colour, column
 * width and formula comes from that file. It is completely separate from the
 * MII register produced by register-export.ts.
 */

const WEEK_PROGRAM_TARGET = 14.5;

/** Weekly sheets in the template, in order. */
const TEMPLATE_WEEK_SHEETS = [
  "August 17-20",
  "August 24-27",
  "August 31-03",
  "September 07-10",
  "September 14-17",
  "September 21-24",
  "September 28-01",
  "October 05-08",
];

/** Columns holding the week values on the two summary sheets. */
const ABS_WEEK_COLS = [3, 4, 5, 6, 7, 8, 9, 10]; // C..J
const PROG_WEEK_COLS = [3, 5, 7, 9, 15, 17, 19, 21]; // C,E,G,I,O,Q,S,U

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

/** Blank the sample data the template ships with, keeping all formatting. */
function clearFrom(ws: ExcelJS.Worksheet, startRow: number) {
  const last = Math.max(ws.rowCount, ws.actualRowCount);
  for (let r = startRow; r <= last; r += 1) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
    });
  }
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
  const weeks = Math.min(TEMPLATE_WEEK_SHEETS.length, Math.max(1, block.weeks || 1));

  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error("Could not load the MIU register template.");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());

  const weekMondays = Array.from({ length: weeks }, (_, w) => monday(block.start_date, w));
  const weekNames = weekMondays.map(weekLabel);

  /* ------------------------------ lookups -------------------------------- */
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

  function classDay(studentId: string, date: string) {
    const day = sessionByDate.get(date) ?? [];
    if (day.length === 0) return { attended: "", mode: "", comment: "" };
    let attended = false;
    let modeCode: ClassRecord["mode"] | null = null;
    const comments: string[] = [];
    for (const s of day) {
      const rec = classByKey.get(`${s.id}:${studentId}`);
      if (rec && Number(rec.points ?? 0) > 0) attended = true;
      if (rec && !modeCode) modeCode = rec.mode;
      if (rec?.comment) comments.push(rec.comment);
    }
    return {
      attended: attended ? "Yes" : "No",
      mode: modeCode ? (modeCode === "physical" ? "In class" : classModeLabel(modeCode)) : "",
      comment: comments.join(" · "),
    };
  }


  /* --------------------------- MIU Login Details -------------------------- */
  const login = wb.getWorksheet("MIU Login Details");
  if (login) {
    clearFrom(login, 2);
    students.forEach((s, i) => {
      const { first, last } = splitName(s.full_name);
      const row = login.getRow(2 + i);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = last;
      row.getCell(3).value = first;
      row.getCell(5).value = "Student";
    });
  }

  /* ------------------------------ Student List --------------------------- */
  const list = wb.getWorksheet("Student List");
  if (list) {
    clearFrom(list, 2);
    students.forEach((s, i) => {
      const { first, middle, last } = splitName(s.full_name);
      const row = list.getRow(2 + i);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = s.cohort_name ?? groupName;
      row.getCell(4).value = last;
      row.getCell(5).value = first;
      row.getCell(6).value = middle;
      row.getCell(7).value = s.full_name;
      row.getCell(8).value = s.email ?? "";
      row.getCell(9).value = s.internal_email ?? "";
      row.getCell(11).value = s.student_number ?? "";
    });
  }

  /* ------------------------------ Learnership ---------------------------- */
  const learn = wb.getWorksheet("Learnership");
  if (learn) {
    clearFrom(learn, 3);
    students.forEach((s, i) => {
      const { first, last } = splitName(s.full_name);
      const row = learn.getRow(3 + i);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = last;
      row.getCell(3).value = first;
    });
  }

  /* ---------------------------- weekly sheets ---------------------------- */
  const weekTotals: { absent: number; program: number }[][] = students.map(() => []);

  TEMPLATE_WEEK_SHEETS.forEach((sheetName, w) => {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) return;
    if (w >= weeks) {
      wb.removeWorksheet(ws.id);
      return;
    }
    ws.name = weekNames[w]!;
    clearFrom(ws, 4);
    const mon = weekMondays[w]!;

    students.forEach((student, sIdx) => {
      const r = 4 + sIdx;
      const row = ws.getRow(r);
      const { first, last } = splitName(student.full_name);
      row.getCell(1).value = sIdx + 1;
      row.getCell(2).value = student.cohort_name ?? groupName;
      row.getCell(4).value = last;
      row.getCell(5).value = first;

      let absent = 0;
      let program = 0;

      // Monday F..J, Tuesday K..O, Wednesday P..T, Thursday U..Y
      for (let d = 0; d < 4; d += 1) {
        const base = 6 + d * 5;
        const date = dateKey(shift(mon, d));
        const info = classDay(student.id, date);
        row.getCell(base).value = info.attended;
        row.getCell(base + 1).value = info.mode;
        row.getCell(base + 2).value = info.comment;
        if (info.attended === "No") absent += 1;
        const am = medPoints(student.id, date, "morning");
        const pm = medPoints(student.id, date, "afternoon");
        row.getCell(base + 3).value = am;
        row.getCell(base + 4).value = pm;
        program += am + pm;
      }

      // Z/AA Friday, AB/AC Saturday
      const friday = dateKey(shift(mon, 4));
      const saturday = dateKey(shift(mon, 5));
      const bonus: [number, number][] = [
        [26, medPoints(student.id, friday, "morning")],
        [27, medPoints(student.id, friday, "afternoon")],
        [28, medPoints(student.id, saturday, "morning")],
        [29, medPoints(student.id, saturday, "afternoon")],
      ];
      for (const [col, value] of bonus) {
        row.getCell(col).value = value;
        program += value;
      }

      row.getCell(30).value = absent; // AD
      row.getCell(31).value = {
        formula: `I${r}+J${r}+N${r}+O${r}+S${r}+T${r}+X${r}+Y${r}+Z${r}+AA${r}+AB${r}+AC${r}`,
      }; // AE
      row.getCell(32).value = { formula: `${WEEK_PROGRAM_TARGET}-AE${r}` }; // AF

      weekTotals[sIdx]!.push({ absent, program: Math.round(program * 10) / 10 });
    });
  });

  /* ------------------------ Absenteeism Summary Sheet -------------------- */
  const abs = wb.getWorksheet("Absenteeism Summary Sheet");
  if (abs) {
    clearFrom(abs, 2);
    ABS_WEEK_COLS.forEach((col, w) => {
      abs.getCell(1, col).value = w < weeks ? weekNames[w]! : null;
    });
    students.forEach((student, sIdx) => {
      const r = 2 + sIdx;
      const row = abs.getRow(r);
      const { first, last } = splitName(student.full_name);
      row.getCell(1).value = last;
      row.getCell(2).value = first;
      ABS_WEEK_COLS.forEach((col, w) => {
        row.getCell(col).value = w < weeks ? (weekTotals[sIdx]?.[w]?.absent ?? 0) : null;
      });
      row.getCell(11).value = { formula: `SUM(C${r}:J${r})` };
    });
  }

  /* -------------------------- Program Summary Sheet ---------------------- */
  const prog = wb.getWorksheet("Program Summary Sheet");
  if (prog) {
    clearFrom(prog, 3);
    PROG_WEEK_COLS.forEach((col, w) => {
      prog.getCell(2, col).value = w < weeks ? weekNames[w]! : null;
    });
    students.forEach((student, sIdx) => {
      const r = 3 + sIdx;
      const row = prog.getRow(r);
      const { first, last } = splitName(student.full_name);
      row.getCell(1).value = last;
      row.getCell(2).value = first;
      PROG_WEEK_COLS.forEach((col, w) => {
        row.getCell(col).value = w < weeks ? (weekTotals[sIdx]?.[w]?.program ?? 0) : null;
      });
      row.getCell(11).value = { formula: `58-L${r}` };
      row.getCell(12).value = { formula: `sum(C${r}+E${r}+G${r}+I${r})` };
      row.getCell(13).value = { formula: `L${r}/72` };
      row.getCell(22).value = { formula: `sum(O${r}+Q${r}+S${r}+U${r})` };
      row.getCell(23).value = { formula: `V${r}/66` };
      row.getCell(24).value = { formula: `53-V${r}` };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
