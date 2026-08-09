import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/components/ui-kit";
import { pickActive, useAttendance, useBlocks, useCohorts, useStudents } from "@/lib/admin-hooks";
import { markAttendance, markDayForAll } from "@/lib/data.functions";
import type { AbsenceReason, AttendanceRecord, SessionSlot } from "@/lib/attendance";
import {
  formatDate,
  isSunday,
  POINT_OPTIONS,
  REASONS,
  reasonLabel,
  skipSunday,
  summarise,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  head: () => ({
    meta: [
      { title: "Mark Attendance · Meditation Attendance" },
      {
        name: "description",
        content:
          "Score morning and afternoon meditation sessions out of 2.0 points, fill a score down a whole cohort, and record reasons for absence.",
      },
      { property: "og:title", content: "Mark Attendance" },
      {
        property: "og:description",
        content: "Record daily meditation points per student and session.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAttendance,
});

const today = () => skipSunday(new Date().toISOString().slice(0, 10));

type Points = 0 | 0.5 | 1 | 1.5 | 2;

function AdminAttendance() {
  const qc = useQueryClient();
  const { data: blocks, isLoading: lb } = useBlocks();
  const { data: students, isLoading: ls } = useStudents();
  const { data: cohorts } = useCohorts();
  const active = pickActive(blocks);
  const [blockId, setBlockId] = useState<string | null>(null);
  const block = blocks?.find((b) => b.id === (blockId ?? active?.id)) ?? null;
  const { data: records, isLoading: la } = useAttendance(block?.id ?? null);

  const [date, setDate] = useState(today());
  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [reasonFor, setReasonFor] = useState<{
    student_id: string;
    name: string;
    slot: SessionSlot;
    points: Points;
    absence_reason: AbsenceReason | "";
    absence_note: string;
  } | null>(null);
  const [bulk, setBulk] = useState<{ slot: SessionSlot; points: Points } | null>(null);

  /** Click-and-drag fill: source cell plus the row currently hovered. */
  const [drag, setDrag] = useState<{
    slot: SessionSlot;
    from: number;
    to: number;
    points: Points;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const markFn = useServerFn(markAttendance);
  const bulkFn = useServerFn(markDayForAll);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["attendance", block?.id] });

  const mark = useMutation({
    mutationFn: (v: {
      student_id: string;
      slot: SessionSlot;
      points: Points | null;
      absence_reason?: AbsenceReason | null;
      absence_note?: string;
    }) => markFn({ data: { block_id: block!.id, session_date: date, ...v } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const fill = useMutation({
    mutationFn: async (v: { slot: SessionSlot; points: Points; student_ids: string[] }) => {
      await bulkFn({
        data: {
          block_id: block!.id,
          session_date: date,
          slot: v.slot,
          points: v.points,
          student_ids: v.student_ids,
        },
      });
      return v.student_ids.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(`${count} student${count === 1 ? "" : "s"} scored`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMark = useMutation({
    mutationFn: (v: { slot: SessionSlot; points: Points }) =>
      bulkFn({
        data: {
          block_id: block!.id,
          session_date: date,
          slot: v.slot,
          points: v.points,
          student_ids: rows.map((r) => r.student.id),
        },
      }),
    onSuccess: () => {
      invalidate();
      setBulk(null);
      toast.success("Session scored for all students");
    },
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
    return (students ?? [])
      .filter((s) =>
        block?.cohort_id && s.cohort_id !== block.cohort_id
          ? false
          : cohortFilter === "all"
          ? true
          : cohortFilter === "none"
            ? !s.cohort_id
            : s.cohort_id === cohortFilter,
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
  }, [students, search, cohortFilter, dayMap, records, block]);

  const locked = !block || block.status === "closed";

  // Finish a drag-fill wherever the pointer is released.
  useEffect(() => {
    function end() {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const lo = Math.min(d.from, d.to);
      const hi = Math.max(d.from, d.to);
      const ids = rows.slice(lo, hi + 1).map((r) => r.student.id);
      if (ids.length < 2) return;
      fill.mutate({ slot: d.slot, points: d.points, student_ids: ids });
    }
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
    };
  }, [rows, fill]);

  function inDrag(slot: SessionSlot, index: number) {
    if (!drag || drag.slot !== slot) return false;
    return index >= Math.min(drag.from, drag.to) && index <= Math.max(drag.from, drag.to);
  }

  if (lb || ls) return <Spinner label="Loading" />;

  return (
    <>
      <SectionTitle
        title="Mark attendance"
        subtitle="Each session is scored out of 2.0 points · drag a score down to fill the rest of the list"
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
            Create a meditation block first on the Blocks page.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Block">
                <Select value={block.id} onChange={(e) => setBlockId(e.target.value)}>
                  {(blocks ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Session date (no Sundays)">
                <Input
                  type="date"
                  value={date}
                  min={block.start_date}
                  max={block.end_date}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    if (isSunday(value)) {
                      toast.error("Sundays are not meditation days.");
                      setDate(skipSunday(value));
                      return;
                    }
                    setDate(value);
                  }}
                />
              </Field>
              <Field label="Cohort">
                <Select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
                  <option value="all">All cohorts</option>
                  <option value="none">Unassigned</option>
                  {(cohorts ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
                This block is closed. Attendance is locked and cannot be edited.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {(["morning", "afternoon"] as SessionSlot[]).map((slot) => (
                  <Button
                    key={slot}
                    size="sm"
                    variant="soft"
                    onClick={() => setBulk({ slot, points: 2 })}
                  >
                    All {slot} 2.0
                  </Button>
                ))}
                {(["morning", "afternoon"] as SessionSlot[]).map((slot) => (
                  <Button
                    key={`${slot}-zero`}
                    size="sm"
                    variant="outline"
                    onClick={() => setBulk({ slot, points: 0 })}
                  >
                    All {slot} 0
                  </Button>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {POINT_OPTIONS.map((o) => (
                <span key={o.value} className="glass-muted rounded-full px-3 py-1">
                  <strong className="text-foreground">{o.label}</strong> · {o.hint}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle
              title={formatDate(date)}
              subtitle={`${rows.length} student${rows.length === 1 ? "" : "s"} · a full meditation day is 4.0 points (2.0 morning + 2.0 afternoon)`}
            />
            {la ? (
              <Spinner label="Loading attendance" />
            ) : (
              <div className="overflow-x-auto select-none">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2">Student</th>
                      <th className="pb-2">Morning</th>
                      <th className="pb-2">Afternoon</th>
                      <th className="pb-2 text-right">Block %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ student, morning, afternoon, summary }, index) => (
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
                            <td
                              key={slot}
                              onMouseEnter={() =>
                                setDrag((d) => (d && d.slot === slot ? { ...d, to: index } : d))
                              }
                              className={[
                                "py-2 pr-4",
                                inDrag(slot, index) ? "bg-primary-soft/60" : "",
                              ].join(" ")}
                            >
                              <div className="relative inline-flex items-center gap-2">
                                <Select
                                  aria-label={`${slot} points for ${student.full_name}`}
                                  className="w-24"
                                  disabled={locked || mark.isPending || fill.isPending}
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
                                  {POINT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </Select>
                                {value !== null && !locked ? (
                                  <button
                                    type="button"
                                    title="Drag down to give the students below the same score"
                                    aria-label="Fill score down"
                                    onMouseDown={() =>
                                      setDrag({ slot, from: index, to: index, points: value })
                                    }
                                    className="h-3 w-3 cursor-crosshair rounded-sm bg-primary ring-2 ring-card"
                                  />
                                ) : null}
                              </div>
                              {rec && Number(rec.points) < 2 ? (
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() =>
                                    setReasonFor({
                                      student_id: student.id,
                                      name: student.full_name,
                                      slot,
                                      points: Number(rec.points) as Points,
                                      absence_reason: (rec.absence_reason ?? "") as
                                        | AbsenceReason
                                        | "",
                                      absence_note: rec.absence_note ?? "",
                                    })
                                  }
                                  className="mt-1 block text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
                                >
                                  {reasonLabel(rec.absence_reason)}
                                </button>
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
              Scoring the {reasonFor.slot} session on {formatDate(date)} as{" "}
              <strong>{reasonFor.points.toFixed(1)} points</strong>. Sick leave and approved leave are
              excluded from the percentage.
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
                maxLength={400}
                placeholder="Doctor's note received"
                value={reasonFor.absence_note}
                onChange={(e) => setReasonFor({ ...reasonFor, absence_note: e.target.value })}
              />
            </Field>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReasonFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mark.isPending}>
                Save record
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(bulk)} onClose={() => setBulk(null)} title="Confirm bulk update">
        <p className="text-sm text-muted-foreground">
          Score <strong>all {rows.length} students</strong> {bulk?.points.toFixed(1)} points for the{" "}
          {bulk?.slot} session on {formatDate(date)}? Existing scores for that session will be
          overwritten.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setBulk(null)}>
            Cancel
          </Button>
          <Button disabled={bulkMark.isPending} onClick={() => bulk && bulkMark.mutate(bulk)}>
            {bulkMark.isPending ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
