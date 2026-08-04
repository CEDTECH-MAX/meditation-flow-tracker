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
