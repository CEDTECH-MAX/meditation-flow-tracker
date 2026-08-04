import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, SectionTitle, Select, Spinner } from "@/components/ui-kit";
import { useAttendance, useBlocks, useStudents, pickActive } from "@/lib/admin-hooks";
import { formatDate, summarise } from "@/lib/attendance";
import { exportExcel, exportPdf } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Meditation Attendance" },
      {
        name: "description",
        content:
          "Generate and export meditation attendance reports to PDF or Excel by block, including students below the 80% requirement.",
      },
      { property: "og:title", content: "Attendance Reports" },
      {
        property: "og:description",
        content: "Export meditation attendance reports to PDF and Excel.",
      },
    ],
  }),
  component: AdminReports,
});

type ReportKind = "all" | "below" | "met";

function AdminReports() {
  const { data: blocks, isLoading: lb } = useBlocks();
  const { data: students, isLoading: ls } = useStudents();
  const active = pickActive(blocks);
  const [blockId, setBlockId] = useState<string | null>(null);
  const block = blocks?.find((b) => b.id === (blockId ?? active?.id)) ?? null;
  const { data: records, isLoading: la } = useAttendance(block?.id ?? null);
  const [kind, setKind] = useState<ReportKind>("all");

  const rows = useMemo(() => {
    const all = (students ?? []).map((s) => {
      const summary = summarise(
        block,
        (records ?? []).filter((r) => r.student_id === s.id),
      );
      return { student: s, summary };
    });
    if (kind === "below") return all.filter((r) => !r.summary.met);
    if (kind === "met") return all.filter((r) => r.summary.met);
    return all;
  }, [students, records, block, kind]);

  const head = [
    "Student",
    "Student number",
    "Morning",
    "Afternoon",
    "Present",
    "Absent",
    "Excused",
    "Attendance %",
    "Status",
  ];
  const body = rows.map(({ student, summary }) => [
    student.full_name,
    student.student_number ?? "—",
    summary.morningPresent,
    summary.afternoonPresent,
    summary.present,
    summary.absent,
    summary.excused,
    `${summary.percentage}%`,
    summary.statusLabel,
  ]);

  const title =
    kind === "below" ? "Students below 80%" : kind === "met" ? "Students meeting 80%" : "Full attendance report";
  const subtitle = block
    ? `${block.name} · ${formatDate(block.start_date)} → ${formatDate(block.end_date)} · ${block.meditation_days * 2} sessions · generated ${formatDate(new Date().toISOString().slice(0, 10))}`
    : "No block selected";
  const filename = `attendance-${(block?.name ?? "block").toLowerCase().replace(/\s+/g, "-")}-${kind}`;

  if (lb || ls) return <Spinner label="Loading" />;

  return (
    <>
      <SectionTitle
        title="Reports"
        subtitle="Export institutional attendance records for record keeping"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!block || rows.length === 0}
              onClick={() => exportExcel(title, head, body, filename)}
            >
              Export Excel
            </Button>
            <Button
              disabled={!block || rows.length === 0}
              onClick={() => exportPdf(title, subtitle, head, body, filename)}
            >
              Export PDF
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Block">
            <Select value={block?.id ?? ""} onChange={(e) => setBlockId(e.target.value)}>
              {(blocks ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Report type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
              <option value="all">All students</option>
              <option value="below">Below 80% requirement</option>
              <option value="met">Requirement met</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle title={title} subtitle={subtitle} />
        {la ? (
          <Spinner label="Loading attendance" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students match this report.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {head.map((h) => (
                    <th key={h} className="pb-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ student, summary }) => (
                  <tr key={student.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{student.full_name}</td>
                    <td className="py-2">{student.student_number ?? "—"}</td>
                    <td className="py-2">{summary.morningPresent}</td>
                    <td className="py-2">{summary.afternoonPresent}</td>
                    <td className="py-2">{summary.present}</td>
                    <td className="py-2">{summary.absent}</td>
                    <td className="py-2">{summary.excused}</td>
                    <td className="py-2">{summary.percentage}%</td>
                    <td className="py-2">
                      <Badge
                        tone={
                          summary.status === "met"
                            ? "green"
                            : summary.status === "warning"
                              ? "amber"
                              : "red"
                        }
                      >
                        {summary.statusLabel}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
