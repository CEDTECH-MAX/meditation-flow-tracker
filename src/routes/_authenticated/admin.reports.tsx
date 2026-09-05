import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, SectionTitle, Select, Spinner } from "@/components/ui-kit";
import { useAttendance, useBlocks, useCohorts, useStudents, pickActive } from "@/lib/admin-hooks";
import { GENDERS, formatDate, summarise, todayKey, type Gender } from "@/lib/attendance";
import { exportRegisterPdf } from "@/lib/exporters";
import { buildRegisterRows, exportRegisterWorkbook } from "@/lib/register-export";


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
  const { data: cohorts } = useCohorts();
  const active = pickActive(blocks);
  const [blockId, setBlockId] = useState<string | null>(null);
  const block = blocks?.find((b) => b.id === (blockId ?? active?.id)) ?? null;
  const { data: records, isLoading: la } = useAttendance(block?.id ?? null);
  const [kind, setKind] = useState<ReportKind>("all");
  const [cohortId, setCohortId] = useState<string>("all");
  const [gender, setGender] = useState<"all" | Gender>("all");

  const rows = useMemo(() => {
    const all = (students ?? [])
      .filter((s) => cohortId === "all" || s.cohort_id === cohortId)
      .filter((s) => gender === "all" || s.gender === gender)
      .map((s) => {
        const summary = summarise(
          block,
          (records ?? []).filter((r) => r.student_id === s.id),
        );
        return { student: s, summary };
      });
    if (kind === "below") return all.filter((r) => !r.summary.met);
    if (kind === "met") return all.filter((r) => r.summary.met);
    return all;
  }, [students, records, block, kind, cohortId, gender]);

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

  const title =
    kind === "below" ? "Students below 80%" : kind === "met" ? "Students meeting 80%" : "Full attendance report";
  const subtitle = block
    ? `${block.name} · ${formatDate(block.start_date)} → ${formatDate(block.end_date)} · ${block.weeks} week${block.weeks === 1 ? "" : "s"} · ${summarise(block, []).totalSessions} compulsory sessions · generated ${formatDate(todayKey())}`
    : "No block selected";
  const genderLabelText = gender === "male" ? "Boys" : gender === "female" ? "Girls" : "All";
  const filename = `attendance-register-${(block?.name ?? "block").toLowerCase().replace(/\s+/g, "-")}-${gender === "all" ? "" : gender + "-"}${kind}`;

  const cohortName =
    cohortId === "all"
      ? (cohorts?.length === 1 ? cohorts[0]!.name : "All Cohorts")
      : (cohorts?.find((c) => c.id === cohortId)?.name ?? "All Cohorts");

  const registerLabel = gender === "all" ? cohortName : `${cohortName} · ${genderLabelText}`;

  const registerStudents = rows.map(({ student }) => ({
    id: student.id,
    full_name: student.full_name,
    student_number: student.student_number,
    email: student.email,
    internal_email: student.internal_email,
    programme: student.programme,
    cohort_name: cohorts?.find((c) => c.id === student.cohort_id)?.name ?? null,
  }));

  async function handleExcel() {
    if (!block) return;
    try {
      await exportRegisterWorkbook(block, registerLabel, registerStudents, records ?? [], filename);
      toast.success("Register exported to Excel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  function handlePdf() {
    if (!block) return;
    exportRegisterPdf(
      block.name,
      registerLabel,
      buildRegisterRows(block, registerStudents, records ?? []),
      filename,
    );
  }

  if (lb || ls) return <Spinner label="Loading" />;

  return (
    <>
      <SectionTitle
        title="Reports"
        subtitle="Exports use the official Consciousness Attendance Register template"
        action={
          <div className="flex gap-2">
            <Button variant="outline" disabled={!block || rows.length === 0} onClick={handleExcel}>
              Export Excel
            </Button>
            <Button disabled={!block || rows.length === 0} onClick={handlePdf}>
              Export PDF
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Block">
            <Select value={block?.id ?? ""} onChange={(e) => setBlockId(e.target.value)}>
              {(blocks ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.weeks}w · {b.status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cohort">
            <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
              <option value="all">All cohorts</option>
              {(cohorts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Boys / Girls">
            <Select value={gender} onChange={(e) => setGender(e.target.value as "all" | Gender)}>
              <option value="all">Boys and girls</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.value === "male" ? "Boys only" : "Girls only"}
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
        <p className="mt-3 text-xs text-muted-foreground">
          The register renders one 15-column week section per block week — a{" "}
          {block?.weeks ?? 0}-week block exports exactly {block?.weeks ?? 0} week
          {block?.weeks === 1 ? "" : "s"}, with block cumulative and final points columns.
        </p>
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
