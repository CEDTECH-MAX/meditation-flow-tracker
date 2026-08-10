import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, SectionTitle, Spinner, StatCard, Badge } from "@/components/ui-kit";
import { pickActive, useAttendance, useBlocks, useStudents } from "@/lib/admin-hooks";
import {
  averagePercentage,
  blockProgress,
  formatDate,
  statusBadgeTone,
  summariseStudents,
  type AttendanceRecord,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Overview · Meditation Attendance" },
      {
        name: "description",
        content:
          "Administrator overview of meditation attendance: totals, students above and below 80%, and daily and weekly attendance trends.",
      },
      { property: "og:title", content: "Admin Overview · Meditation Attendance" },
      {
        property: "og:description",
        content: "Institutional overview of meditation attendance for the current block.",
      },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const { data: blocks, isLoading: lb } = useBlocks();
  const { data: students, isLoading: ls } = useStudents();
  const block = pickActive(blocks);
  const { data: records, isLoading: la } = useAttendance(block?.id ?? null);

  const perStudent = useMemo(() => {
    if (!students || !records) return [];
    return summariseStudents(block, records, students);
  }, [students, records, block]);

  const above = perStudent.filter((p) => p.summary.met).length;
  const below = perStudent.length - above;
  const classAverage = averagePercentage(perStudent.map((p) => p.summary.percentage));

  const daily = useMemo(() => byDate(records ?? [], students?.length ?? 0), [records, students]);
  const weekly = useMemo(() => byWeek(daily), [daily]);

  if (lb || ls || la) return <Spinner label="Loading dashboard" />;

  return (
    <>
      <SectionTitle
        title="Institution overview"
        subtitle={
          block
            ? `${block.name} · ${formatDate(block.start_date)} → ${formatDate(block.end_date)}`
            : "No block created yet"
        }
        action={
          block ? (
            <Badge tone={block.status === "active" ? "green" : "gold"}>{block.status}</Badge>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total students" value={students?.length ?? 0} />
        <StatCard label="At or above 80%" value={above} tone="green" />
        <StatCard label="Below 80%" value={below} tone="red" />
        <StatCard label="Class average" value={`${classAverage}%`} tone="gold" />
        <StatCard
          label="Block progress"
          value={block ? `${blockProgress(block)}%` : "—"}
          {...(block ? { hint: `${block.meditation_days} meditation days` } : {})}
          tone="neutral"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Daily attendance" subtitle="Present sessions recorded per day" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="Attendance %"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Weekly attendance" subtitle="Average attendance rate per week" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="rate" name="Attendance %" fill="var(--gold)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle title="Students needing attention" subtitle="Below the 80% requirement" />
        {below === 0 ? (
          <p className="text-sm text-muted-foreground">Every student is at or above 80%.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Number</th>
                  <th className="pb-2">Attendance</th>
                  <th className="pb-2">Needed</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {perStudent
                  .filter((p) => !p.summary.met)
                  .sort((a, b) => a.summary.percentage - b.summary.percentage)
                  .map(({ student, summary }) => (
                    <tr key={student.id} className="border-t border-border/60">
                      <td className="py-2">{student.full_name}</td>
                      <td className="py-2">{student.student_number ?? "—"}</td>
                      <td className="py-2">{summary.percentage}%</td>
                      <td className="py-2">{summary.percentageNeeded}%</td>
                      <td className="py-2">
                        <Badge tone={statusBadgeTone(summary.status)}>{summary.statusLabel}</Badge>
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

function byDate(records: AttendanceRecord[], studentCount: number) {
  const map = new Map<string, { present: number; counted: number }>();
  for (const r of records) {
    const entry = map.get(r.session_date) ?? { present: 0, counted: 0 };
    if (r.status === "present") entry.present += 1;
    if (r.status !== "excused") entry.counted += 1;
    map.set(r.session_date, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label: formatDate(date).replace(/ \d{4}$/, ""),
      present: v.present,
      expected: studentCount * 2,
      rate: v.counted > 0 ? Math.round((v.present / v.counted) * 100) : 0,
    }));
}

function byWeek(daily: ReturnType<typeof byDate>) {
  const weeks: { label: string; rate: number }[] = [];
  const size = 5;
  for (let i = 0; i < daily.length; i += size) {
    const chunk = daily.slice(i, i + size);
    weeks.push({
      label: `Week ${Math.floor(i / size) + 1}`,
      rate: Math.round(chunk.reduce((a, c) => a + c.rate, 0) / chunk.length),
    });
  }
  return weeks;
}
