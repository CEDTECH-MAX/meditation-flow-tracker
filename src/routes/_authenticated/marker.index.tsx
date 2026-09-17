import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  Spinner,
  StatCard,
} from "@/components/ui-kit";
import { useMarkerScope } from "./marker";
import { getMarkerDayAccess, listMarkerAttendance, markAsMarker } from "@/lib/marker.functions";
import {
  blockDates,
  formatDate,
  ATTENDANCE_OPTIONS,
  REASONS,
  reasonLabel,
  sessionKind,
  skipSunday,
  summarise,
  todayKey,
  type AbsenceReason,
  type AttendanceRecord,
  type Block,
  type SessionSlot,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/marker/")({
  head: () => ({
    meta: [
      { title: "Marking · Attendance Management" },
      {
        name: "description",
        content:
          "Markers score the morning and afternoon meditation sessions for the students of their own assigned cohort only.",
      },
      { property: "og:title", content: "Marking your cohort" },
      {
        property: "og:description",
        content: "Score each session out of 2.0 points for your assigned cohort.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarkerHome,
});

type Points = 0 | 0.5 | 1 | 1.5 | 2;

function MarkerHome() {
  const qc = useQueryClient();
  const { data: scope, isLoading } = useMarkerScope();
  const blocks = (scope?.blocks ?? []) as unknown as Block[];
  const [blockId, setBlockId] = useState<string | null>(null);
  const block =
    blocks.find((b) => b.id === blockId) ??
    blocks.find((b) => b.status === "active") ??
    blocks[0] ??
    null;

  const attendanceFn = useServerFn(listMarkerAttendance);
  const { data: records, isLoading: la } = useQuery<AttendanceRecord[]>({
    queryKey: ["marker-attendance", block?.id],
    enabled: Boolean(block?.id),
    queryFn: () =>
      attendanceFn({ data: { block_id: block!.id } }) as unknown as Promise<AttendanceRecord[]>,
  });

  const sessionDates = useMemo(() => (block ? blockDates(block) : []), [block]);

  const accessFn = useServerFn(getMarkerDayAccess);
  const { data: access } = useQuery<{ today: string; unlocked: string[] }>({
    queryKey: ["marker-day-access", block?.id],
    enabled: Boolean(block?.id),
    refetchInterval: 60_000,
    queryFn: () =>
      accessFn({ data: { block_id: block!.id } }) as unknown as Promise<{
        today: string;
        unlocked: string[];
      }>,
  });
  const today = access?.today ?? skipSunday(todayKey());
  const openDates = useMemo(() => {
    const allowed = new Set<string>([today, ...(access?.unlocked ?? [])]);
    const list = sessionDates.filter((d) => allowed.has(d));
    return list.length > 0 ? list : sessionDates.includes(today) ? [today] : [];
  }, [sessionDates, today, access]);

  const [date, setDate] = useState(skipSunday(todayKey()));
  const [search, setSearch] = useState("");
  const [reasonFor, setReasonFor] = useState<{
    student_id: string;
    name: string;
    slot: SessionSlot;
    points: Points;
    absence_reason: AbsenceReason | "";
    absence_note: string;
  } | null>(null);

  useEffect(() => {
    if (openDates.length === 0) return;
    if (!openDates.includes(date)) setDate(openDates[openDates.length - 1]!);
  }, [openDates, date]);

  const markFn = useServerFn(markAsMarker);
  const mark = useMutation({
    mutationFn: (v: {
      student_id: string;
      slot: SessionSlot;
      points: Points | null;
      absence_reason?: AbsenceReason | null;
      absence_note?: string;
    }) => markFn({ data: { block_id: block!.id, session_date: date, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marker-attendance", block?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const dayMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of records ?? []) {
      if (r.session_date === date) map.set(`${r.student_id}:${r.slot}`, r);
    }
    return map;
  }, [records, date]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const students = (scope?.students ?? []) as {
      id: string;
      full_name: string;
      student_number: string | null;
      cohort_id: string | null;
    }[];
    return students
      .filter(
        (s) =>
          !block?.cohort_id || s.cohort_id === block.cohort_id,
      )
      .filter(
        (s) =>
          !q ||
          s.full_name.toLowerCase().includes(q) ||
          (s.student_number ?? "").toLowerCase().includes(q),
      )
      .map((s) => ({
        student: s,
        morning: dayMap.get(`${s.id}:morning`) ?? null,
        afternoon: dayMap.get(`${s.id}:afternoon`) ?? null,
        summary: summarise(
          block,
          (records ?? []).filter((r) => r.student_id === s.id),
        ),
      }));
  }, [scope, search, dayMap, records, block]);

  const marked = rows.filter((r) => r.morning || r.afternoon).length;
  const dayClosed = date !== today && !(access?.unlocked ?? []).includes(date);
  const locked = !block || block.status === "closed" || dayClosed;

  if (isLoading) return <Spinner label="Loading your cohort" />;

  return (
    <>
      <SectionTitle
        title="Marking"
        subtitle={
          scope
            ? `${scope.institution} · ${(scope.cohorts as { name: string }[]).map((c) => c.name).join(", ")}`
            : ""
        }
        action={
          block ? (
            <Badge tone={block.status === "active" ? "green" : block.status === "closed" ? "red" : "gold"}>
              {block.status}
            </Badge>
          ) : null
        }
      />

      {!block ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No block has been opened for your cohort yet. Your administrator will create one.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Students assigned" value={rows.length} />
            <StatCard label="Marked today" value={marked} tone="green" />
            <StatCard label="Outstanding" value={Math.max(0, rows.length - marked)} tone="red" />
            <StatCard label="Session date" value={formatDate(date)} tone="gold" />
          </div>

          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Block">
                <Select value={block.id} onChange={(e) => setBlockId(e.target.value)}>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Session date (today only)">
                <Select value={date} onChange={(e) => setDate(e.target.value)}>
                  {openDates.length === 0 ? <option value={date}>{formatDate(date)}</option> : null}
                  {openDates.map((d) => (
                    <option key={d} value={d}>
                      {formatDate(d)}
                      {d === today ? " · today" : " · unlocked"}
                      {sessionKind(d, "afternoon") === "optional" ? " · PM optional" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Search student">
                <Input
                  placeholder="Name or student number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
            </div>
            {locked ? (
              <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {block?.status === "closed"
                  ? "This block is closed. Marking is locked."
                  : "This day is closed. You can only mark today's sessions — ask your administrator to unlock a past day."}
              </p>
            ) : (
              <p className="mt-3 rounded-2xl bg-primary/10 px-3 py-2 text-xs text-primary">
                {date === today
                  ? "You are marking today. Once the day ends it locks automatically."
                  : "Your administrator unlocked this day for you."}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {ATTENDANCE_OPTIONS.map((o) => (
                <span key={o.value} className="glass-muted rounded-full px-3 py-1">
                  <strong className="text-foreground">{o.label}</strong> · {o.hint}
                </span>
              ))}
            </div>

          </Card>

          <Card>
            <SectionTitle
              title={formatDate(date)}
              subtitle="Mark each session present or absent. You can only mark the students of your own cohort."
            />
            {la ? (
              <Spinner label="Loading attendance" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2">Student</th>
                      <th className="pb-2">
                        Morning{sessionKind(date, "morning") === "optional" ? " (optional)" : ""}
                      </th>
                      <th className="pb-2">
                        Afternoon{sessionKind(date, "afternoon") === "optional" ? " (optional)" : ""}
                      </th>
                      <th className="pb-2 text-right">Block %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ student, morning, afternoon, summary }) => (
                      <tr key={student.id} className="border-t border-border/60">
                        <td className="py-2">
                          <span className="block font-medium">{student.full_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {student.student_number ?? "—"}
                          </span>
                        </td>
                        {(["morning", "afternoon"] as SessionSlot[]).map((slot) => {
                          const rec = slot === "morning" ? morning : afternoon;
                          const value = rec ? (Number(rec.points) as Points) : null;
                          return (
                            <td key={slot} className="py-2 pr-4">
                              <Select
                                aria-label={`${slot} points for ${student.full_name}`}
                                className="w-24"
                                disabled={locked || mark.isPending}
                                value={value === null ? "" : String(value)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    mark.mutate({ student_id: student.id, slot, points: null });
                                    return;
                                  }
                                  const points = Number(raw) as Points;
                                  if (points < 2) {
                                    setReasonFor({
                                      student_id: student.id,
                                      name: student.full_name,
                                      slot,
                                      points,
                                      absence_reason: (rec?.absence_reason ?? "") as
                                        | AbsenceReason
                                        | "",
                                      absence_note: rec?.absence_note ?? "",
                                    });
                                    return;
                                  }
                                  mark.mutate({ student_id: student.id, slot, points });
                                }}
                              >
                                <option value="">—</option>
                                {ATTENDANCE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Select>

                              {rec && Number(rec.points) < 2 ? (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {reasonLabel(rec.absence_reason)}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className="py-2 text-right">
                          <Badge
                            tone={
                              summary.status === "met"
                                ? "green"
                                : summary.status === "warning"
                                  ? "amber"
                                  : "red"
                            }
                          >
                            {summary.percentage}%
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
      )}

      <Modal
        open={Boolean(reasonFor)}
        onClose={() => setReasonFor(null)}
        title={`Reason · ${reasonFor?.name ?? ""}`}
      >
        {reasonFor ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              mark.mutate({
                student_id: reasonFor.student_id,
                slot: reasonFor.slot,
                points: reasonFor.points,
                absence_reason: reasonFor.absence_reason || null,
                absence_note: reasonFor.absence_note,
              });
              setReasonFor(null);
            }}
          >
            <p className="text-sm text-muted-foreground">
              Marking the {reasonFor.slot} session on {formatDate(date)} as{" "}
              <strong>absent</strong>.
            </p>

            <Field label="Reason">
              <Select
                value={reasonFor.absence_reason}
                onChange={(e) =>
                  setReasonFor({ ...reasonFor, absence_reason: e.target.value as AbsenceReason | "" })
                }
              >
                <option value="">No reason given</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note (optional)">
              <Input
                value={reasonFor.absence_note}
                onChange={(e) => setReasonFor({ ...reasonFor, absence_note: e.target.value })}
                placeholder="Anything the administrator should know"
              />
            </Field>
            <Button type="submit">Save</Button>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
