import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisterRow } from "@/lib/register-export";

const doc = {
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
};
const jsPDF = vi.fn(function () {
  return doc;
});
const autoTable = vi.fn();

vi.mock("jspdf", () => ({ default: jsPDF }));
vi.mock("jspdf-autotable", () => ({ default: autoTable }));

const aoa_to_sheet = vi.fn(() => ({}) as Record<string, unknown>);
const book_new = vi.fn(() => ({ workbook: true }));
const book_append_sheet = vi.fn();
const writeFile = vi.fn();

vi.mock("xlsx", () => ({
  utils: { aoa_to_sheet, book_new, book_append_sheet },
  writeFile,
}));

const { exportExcel, exportPdf, exportRegisterPdf } = await import("./exporters");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exportPdf", () => {
  it("renders a portrait table and saves it under the given filename", () => {
    exportPdf("Class attendance", "Block 1", ["Name", "%"], [["Thandiwe", 84]], "class");
    expect(jsPDF).toHaveBeenCalledWith({ orientation: "portrait" });
    expect(autoTable).toHaveBeenCalledWith(
      doc,
      expect.objectContaining({ head: [["Name", "%"]], body: [["Thandiwe", 84]], startY: 36 }),
    );
    expect(doc.text).toHaveBeenCalledWith("Class attendance", 14, 24);
    expect(doc.text).toHaveBeenCalledWith("Block 1", 14, 30);
    expect(doc.save).toHaveBeenCalledWith("class.pdf");
  });

  it("switches to landscape for wide tables", () => {
    exportPdf("Wide", "Block 1", ["a", "b", "c", "d", "e", "f", "g"], [], "wide");
    expect(jsPDF).toHaveBeenCalledWith({ orientation: "landscape" });
  });
});

describe("exportExcel", () => {
  it("writes the header and body rows to a single sheet", () => {
    exportExcel("Attendance", ["Name", "%"], [["Thandiwe", 84]], "class");
    expect(aoa_to_sheet).toHaveBeenCalledWith([
      ["Name", "%"],
      ["Thandiwe", 84],
    ]);
    expect(book_append_sheet).toHaveBeenCalledWith(
      { workbook: true },
      expect.objectContaining({ "!cols": [{ wch: 20 }, { wch: 20 }] }),
      "Attendance",
    );
    expect(writeFile).toHaveBeenCalledWith({ workbook: true }, "class.xlsx");
  });

  it("truncates sheet names to the Excel limit", () => {
    exportExcel("A".repeat(40), ["Name"], [], "class");
    expect(book_append_sheet.mock.calls[0]?.[2]).toBe("A".repeat(30));
  });

  it("sizes every column", () => {
    const sheet: Record<string, unknown> = {};
    aoa_to_sheet.mockReturnValueOnce(sheet);
    exportExcel("Attendance", ["Name", "%"], [], "class");
    expect(sheet["!cols"]).toEqual([{ wch: 20 }, { wch: 20 }]);
  });
});

describe("exportRegisterPdf", () => {
  const row = (full_name: string, weekPoints: number[], percentage: number): RegisterRow => ({
    student: { id: "s1", full_name, student_number: "MI-001", email: null },
    weeks: weekPoints.map((points, i) => ({
      label: `Week ${i + 1}`,
      dates: [],
      slots: Array.from({ length: 12 }, () => 0),
      weekPoints: points,
      cumulative: points * (i + 1),
    })),
    finalPoints: weekPoints.reduce((a, b) => a + b, 0),
    percentage,
  });

  it("renders one page per week plus a totals page", () => {
    exportRegisterPdf("Block 1", "Group A", [row("Thandiwe Mokoena", [12, 15], 75)], "register");
    // two weeks: one addPage between them, one for the totals page
    expect(doc.addPage).toHaveBeenCalledTimes(2);
    expect(autoTable).toHaveBeenCalledTimes(3);
    expect(doc.save).toHaveBeenCalledWith("register.pdf");
  });

  it("splits the name into last and first columns", () => {
    exportRegisterPdf("Block 1", "Group A", [row("Thandiwe Mokoena", [12], 60)], "register");
    const body = autoTable.mock.calls[0]?.[1].body;
    expect(body[0].slice(0, 4)).toEqual([1, "MOKOENA", "Thandiwe", "MI-001"]);
  });

  it("keeps a single-word name in the first-name column", () => {
    exportRegisterPdf("Block 1", "Group A", [row("Sipho", [12], 60)], "register");
    const body = autoTable.mock.calls[0]?.[1].body;
    expect(body[0].slice(1, 3)).toEqual(["", "Sipho"]);
  });

  it("labels the block status band on the totals page", () => {
    const rows = [
      row("A Platinum", [36], 100),
      row("B Gold", [33], 92),
      row("C Pass", [29], 81),
      row("D Fail", [10], 27.8),
    ];
    exportRegisterPdf("Block 1", "Group A", rows, "register");
    const totals = autoTable.mock.calls.at(-1)?.[1].body;
    expect(totals.map((r: unknown[]) => r.at(-1))).toEqual([
      "Platinum",
      "Gold",
      "Green (Pass)",
      "Red - No Pass",
    ]);
  });

  it("handles an empty register", () => {
    exportRegisterPdf("Block 1", "Group A", [], "register");
    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(autoTable).toHaveBeenCalledTimes(1);
  });
});
