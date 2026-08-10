import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttendanceRecord, Block } from "@/lib/attendance";
import { exportRegisterWorkbook, type RegisterStudent } from "./register-export";

const students: RegisterStudent[] = [
  {
    id: "student-1",
    full_name: "Thandiwe Mokoena",
    student_number: "MI-001",
    email: "thandiwe@example.com",
    programme: "Phase 2",
    cohort_name: "Cohort A",
  },
  {
    id: "student-2",
    full_name: "Sipho",
    student_number: null,
    email: null,
    internal_email: "sipho@mi.local",
  },
];

const block: Block = {
  id: "block-1",
  name: "Block 1",
  start_date: "2025-01-06", // Monday
  end_date: "2025-01-18",
  weeks: 2,
  meditation_days: 12,
  status: "active",
};

const record = (
  student_id: string,
  session_date: string,
  slot: AttendanceRecord["slot"],
  status: AttendanceRecord["status"],
  absence_reason: AttendanceRecord["absence_reason"] = null,
): AttendanceRecord => ({
  id: `${student_id}-${session_date}-${slot}`,
  block_id: block.id,
  student_id,
  session_date,
  slot,
  status,
  points: status === "present" ? 2 : 0,
  absence_reason,
});

let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let blobs: Blob[];

beforeEach(() => {
  blobs = [];
  anchor = { href: "", download: "", click: vi.fn() };
  createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return "blob:register";
  });
  revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
  vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** exceljs does not type the parsed conditional formatting rules on Worksheet. */
type WithConditionalFormatting = ExcelJS.Worksheet & {
  conditionalFormattings: { ref: string; rules: unknown[] }[];
};

async function loadWorkbook() {
  const buffer = await blobs[0]!.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe("exportRegisterWorkbook", () => {
  it("downloads a single worksheet named after the block length", async () => {
    await exportRegisterWorkbook(block, "Group A", students, [], "register");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe("register.xlsx");
    expect(anchor.href).toBe("blob:register");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:register");

    const wb = await loadWorkbook();
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0]?.name).toBe("BLOCK - 2 WEEKS");
  });

  it("writes the student details block once, splitting first and last names", async () => {
    await exportRegisterWorkbook(block, "Group A", students, [], "register");
    const ws = (await loadWorkbook()).worksheets[0]!;

    expect(ws.getCell(5, 1).value).toBe("NO");
    expect(ws.getCell(5, 4).value).toBe("STUDENT NO");

    expect(ws.getCell(6, 1).value).toBe(1);
    expect(ws.getCell(6, 2).value).toBe("MOKOENA");
    expect(ws.getCell(6, 3).value).toBe("Thandiwe");
    expect(ws.getCell(6, 4).value).toBe("MI-001");
    expect(ws.getCell(6, 5).value).toBe("Phase 2");
    expect(ws.getCell(6, 7).value).toBe("thandiwe@example.com");
    expect(ws.getCell(6, 8).value).toBe("Cohort A");

    // single-word name, no student number, internal email fallback
    expect(ws.getCell(7, 2).value).toBe("");
    expect(ws.getCell(7, 3).value).toBe("Sipho");
    expect(ws.getCell(7, 7).value).toBe("sipho@mi.local");
  });

  it("renders one 15-column section per block week with the weekly targets", async () => {
    await exportRegisterWorkbook(block, "Group A", students, [], "register");
    const ws = (await loadWorkbook()).worksheets[0]!;

    // week 1 starts at column 9, week 2 at column 24
    expect(ws.getCell(3, 9).value).toBe("BLOCK 1");
    expect(ws.getCell(3, 10).value).toBe("Week 1");
    expect(ws.getCell(3, 25).value).toBe("Week 2");

    expect(ws.getCell(3, 13).value).toBe(15);
    expect(ws.getCell(3, 14).value).toBe(15);
    expect(ws.getCell(3, 16).value).toBe(18);
    expect(ws.getCell(3, 17).value).toBe(18);
    // cumulative targets double in the second week
    expect(ws.getCell(3, 29).value).toBe(30);
    expect(ws.getCell(3, 32).value).toBe(36);

    expect(ws.getCell(4, 9).value).toBe("MONDAY 6/1");
    expect(ws.getCell(4, 20).value).toBe("SAT 11/1");
    expect(ws.getCell(4, 24).value).toBe("MONDAY 13/1");
    expect(ws.getCell(5, 9).value).toBe("AM");
    expect(ws.getCell(5, 10).value).toBe("PM");
  });

  it("scores each slot and leaves unrecorded sessions at zero", async () => {
    const records = [
      record("student-1", "2025-01-06", "morning", "present"),
      record("student-1", "2025-01-06", "afternoon", "present", "late_arrival"),
      record("student-1", "2025-01-07", "morning", "absent"),
      record("student-1", "2025-01-13", "morning", "present"),
    ];
    await exportRegisterWorkbook(block, "Group A", students, records, "register");
    const ws = (await loadWorkbook()).worksheets[0]!;

    expect(ws.getCell(6, 9).value).toBe(2);
    expect(ws.getCell(6, 10).value).toBe(1.5);
    expect(ws.getCell(6, 11).value).toBe(0);
    // week 2, Monday AM
    expect(ws.getCell(6, 24).value).toBe(2);
    // the other student has nothing recorded
    expect(ws.getCell(7, 9).value).toBe(0);
  });

  it("totals the weeks with formulas rather than baked-in numbers", async () => {
    await exportRegisterWorkbook(block, "Group A", students, [], "register");
    const ws = (await loadWorkbook()).worksheets[0]!;

    expect(ws.getCell(6, 22).formula).toBe("SUM(O6:U6)");
    // week 1 cumulative is just its own total, week 2 adds the previous one
    expect(ws.getCell(6, 23).formula).toBe("V6");
    expect(ws.getCell(6, 38).formula).toBe("SUM(W6,AK6)");
    // block final points and percentage
    expect(ws.getCell(6, 39).formula).toBe("V6+AK6");
    expect(ws.getCell(6, 40).formula).toBe("AM6/36");
    expect(ws.getCell(6, 40).numFmt).toBe("0.0%");
  });

  it("colour-bands the block percentage and flags weeks below the 80% target", async () => {
    await exportRegisterWorkbook(block, "Group A", students, [], "register");
    const ws = (await loadWorkbook()).worksheets[0]!;
    const formattings = (ws as WithConditionalFormatting).conditionalFormattings;
    const refs = formattings.map((cf) => cf.ref);
    expect(refs).toContain("AN6:AN7");
    expect(refs).toContain("V6:V7");
    expect(refs).toContain("W6:W7");
    expect(formattings.find((cf) => cf.ref === "AN6:AN7")?.rules).toHaveLength(4);
  });

  it("skips the conditional formatting when there are no students", async () => {
    await exportRegisterWorkbook(block, "Group A", [], [], "register");
    const ws = (await loadWorkbook()).worksheets[0]!;
    expect((ws as WithConditionalFormatting).conditionalFormattings).toHaveLength(0);
  });

  it("falls back to a single week when the block has no week count", async () => {
    await exportRegisterWorkbook({ ...block, weeks: 0 }, "Group A", students, [], "register");
    const wb = await loadWorkbook();
    expect(wb.worksheets[0]?.name).toBe("BLOCK - 1 WEEKS");
    // final points column sits straight after the single week section
    expect(wb.worksheets[0]?.getCell(5, 24).value).toBe("Block Final Points");
  });

  it("starts the register on the Monday of the week the block begins", async () => {
    // 2025-01-09 is a Thursday
    await exportRegisterWorkbook(
      { ...block, weeks: 1, start_date: "2025-01-09" },
      "Group A",
      students,
      [record("student-1", "2025-01-06", "morning", "present")],
      "register",
    );
    const ws = (await loadWorkbook()).worksheets[0]!;
    expect(ws.getCell(4, 9).value).toBe("MONDAY 6/1");
    expect(ws.getCell(6, 9).value).toBe(2);
  });

  it("uppercases the group name in the header", async () => {
    await exportRegisterWorkbook(block, "group a", students, [], "register");
    const ws = (await loadWorkbook()).worksheets[0]!;
    expect(ws.getCell(1, 2).value).toBe("GROUP NAME : GROUP A");
    expect(ws.getCell(1, 3).value).toBe("GROUP A");
  });
});
