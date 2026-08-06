import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export function exportPdf(
  title: string,
  subtitle: string,
  head: string[],
  body: (string | number)[][],
  filename: string,
) {
  const doc = new jsPDF({ orientation: head.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(16);
  doc.text("Maharishi Institute — Meditation Attendance", 14, 16);
  doc.setFontSize(12);
  doc.text(title, 14, 24);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitle, 14, 30);
  doc.setTextColor(0);
  autoTable(doc, {
    head: [head],
    body,
    startY: 36,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [46, 106, 74], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 250, 247] },
  });
  doc.save(`${filename}.pdf`);
}

export function exportExcel(
  sheetName: string,
  head: string[],
  body: (string | number)[][],
  filename: string,
) {
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws["!cols"] = head.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

import type { RegisterRow } from "@/lib/register-export";
import { REGISTER_WEEK_TARGET_100, REGISTER_WEEK_TARGET_80 } from "@/lib/register-export";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** PDF version of the Consciousness Attendance Register — one section per block week. */
export function exportRegisterPdf(
  blockName: string,
  groupName: string,
  rows: RegisterRow[],
  filename: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const weekCount = rows[0]?.weeks.length ?? 0;

  for (let w = 0; w < weekCount; w += 1) {
    if (w > 0) doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(180, 95, 6);
    doc.text("CONSCIOUSNESS ATTENDANCE REGISTER", 14, 14);
    doc.setFontSize(10);
    doc.setTextColor(153, 0, 0);
    doc.text(`${blockName.toUpperCase()} · Week ${w + 1} · GROUP NAME : ${groupName.toUpperCase()}`, 14, 20);
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(
      `For 80% Points: ${REGISTER_WEEK_TARGET_80} this week / ${REGISTER_WEEK_TARGET_80 * (w + 1)} block cumulative   ·   For 100% Points: ${REGISTER_WEEK_TARGET_100} this week / ${REGISTER_WEEK_TARGET_100 * (w + 1)} block cumulative`,
      14,
      25,
    );
    doc.text("2.0 = attend full progr;  1.5 = if arrive late;  1.0 = if do not do Asanas", 14, 29);
    doc.setTextColor(0);

    const head = [
      ["NO", "LAST", "FIRST", "STUDENT NO", ...DAYS.flatMap((d) => [`${d} AM`, `${d} PM`]), "Week Actual Points", "Block Cumulv Points"],
    ];
    const body = rows.map((row, i) => {
      const week = row.weeks[w]!;
      const name = row.student.full_name.trim().split(/\s+/);
      return [
        i + 1,
        (name.length > 1 ? name[name.length - 1]! : "").toUpperCase(),
        name.length > 1 ? name.slice(0, -1).join(" ") : name[0]!,
        row.student.student_number ?? "",
        ...week.slots.map((v) => v.toFixed(1)),
        week.weekPoints.toFixed(1),
        week.cumulative.toFixed(1),
      ];
    });
    autoTable(doc, {
      head,
      body,
      startY: 33,
      styles: { fontSize: 7, cellPadding: 1.2, halign: "center" },
      headStyles: { fillColor: [182, 215, 168], textColor: [153, 0, 0], fontSize: 6.5 },
      columnStyles: { 1: { halign: "left" }, 2: { halign: "left" } },
    });
  }

  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(180, 95, 6);
  doc.text("BLOCK FINAL POINTS", 14, 14);
  doc.setTextColor(0);
  autoTable(doc, {
    head: [["NO", "LAST", "FIRST", "STUDENT NO", "Block Final Points", "Block Attendance @ 100%", "Status"]],
    body: rows.map((row, i) => {
      const name = row.student.full_name.trim().split(/\s+/);
      const pct = row.percentage;
      const status = pct >= 100 ? "Platinum" : pct >= 90 ? "Gold" : pct >= 80 ? "Green (Pass)" : "Red - No Pass";
      return [
        i + 1,
        (name.length > 1 ? name[name.length - 1]! : "").toUpperCase(),
        name.length > 1 ? name.slice(0, -1).join(" ") : name[0]!,
        row.student.student_number ?? "",
        row.finalPoints.toFixed(1),
        `${pct.toFixed(1)}%`,
        status,
      ];
    }),
    startY: 20,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [182, 215, 168], textColor: [153, 0, 0] },
  });

  doc.save(`${filename}.pdf`);
}
