import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import type { AbsenceReason, AttendanceRecord, AttendanceStatus, SessionSlot } from "@/lib/attendance";
import { formatDate, REASONS, reasonLabel, summarise } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  head: () => ({
    meta: [
      { title: "Mark Attendance · Meditation Attendance" },
      {
        name: "description",
        content:
          "Mark morning and afternoon meditation attendance for every student, with bulk actions and excused absences.",
      },
      { property: "og:title", content: "Mark Attendance" },
      {
        property: "og:description",
        content: "Record daily meditation attendance per student and session.",
      },
    ],
  }),
  component: AdminAttendance,
});

const today = () => new Date().toISOString().slice(0, 10);

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
    status: AttendanceStatus;
    absence_reason: AbsenceReason | "";
    absence_note: string;
  } | null>(null);
  const [bulk, setBulk] = useState<{ slot: SessionSlot; status: AttendanceStatus } | null>(null);

  const markFn = useServerFn(markAttendance);
  const bulkFn = useServerFn(markDayForAll);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["attendance", block?.id] });

  const mark = useMutation({
    mutationFn: (v: {
      student_id: string;
      slot: SessionSlot;
      status: AttendanceStatus | null;
      absence_reason?: AbsenceReason | null;
      absence_note?: string;
    }) =>
      markFn({
        data: { block_id: block!.id, session_date: date, ...v },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMark = useMutation({
    mutationFn: (v: { slot: SessionSlot; status: AttendanceStatus }) =>
      bulkFn({
        data: {
          block_id: block!.id,
          session_date: date,
          slot: v.slot,
          status: v.status,
          student_ids: rows.map((r) => r.student.id),
        },
      }),
    onSuccess: () => {
      invalidate();
      setBulk(null);
      toast.success("Attendance updated for all students");
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
        cohortFilter === "all"
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

  if (lb || ls) return <Spinner label="Loading" />;

  return (
    <>
      <SectionTitle
        title="Mark attendance"
        subtitle="Morning and afternoon sessions · excused absences are excluded from percentages"
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
              <Field label="Session date">
                <Input
                  type="date"
                  value={date}
                  min={block.start_date}
                  max={block.end_date}
                  onChange={(e) => setDate(e.target.value)}
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
                {(["morning", "afternoon"] as SessionSlot[]).map((slot) =>
                  (["present", "absent"] as AttendanceStatus[]).map((status) => (
                    <Button
                      key={`${slot}-${status}`}
                      size="sm"
                      variant={status === "present" ? "soft" : "outline"}
                      onClick={() => setBulk({ slot, status })}
                    >
                      All {slot} {status}
                    </Button>
                  )),
                )}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle
              title={formatDate(date)}
              subtitle={`${rows.length} student${rows.length === 1 ? "" : "s"} · each session is worth ${summarise(block, []).sessionWeight}% of the block`}
            />
            {la ? (
              <Spinner label="Loading attendance" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2">Student</th>
                      <th className="pb-2">Morning</th>
                      <th className="pb-2">Afternoon</th>
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
                          return (
                            <td key={slot} className="py-2">
                              <SlotButtons
                                value={rec?.status ?? null}
                                disabled={locked || mark.isPending}
                                onPick={(status) => {
                                  if (status && status !== "present") {
                                    setReasonFor({
                                      student_id: student.id,
                                      name: student.full_name,
                                      slot,
                                      status,
                                      absence_reason: (rec?.absence_reason ?? "") as AbsenceReason | "",
                                      absence_note: rec?.absence_note ?? "",
                                    });
                                    return;
                                  }
                                  mark.mutate({ student_id: student.id, slot, status });
                                }}
                              />
                              {rec && rec.status !== "present" ? (
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() =>
                                    setReasonFor({
                                      student_id: student.id,
                                      name: student.full_name,
                                      slot,
                                      status: rec.status,
                                      absence_reason: (rec.absence_reason ?? "") as AbsenceReason | "",
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
                status: reasonFor.status,
                absence_reason: reasonFor.absence_reason || null,
                absence_note: reasonFor.absence_note,
              });
              setReasonFor(null);
            }}
          >
            <p className="text-sm text-muted-foreground">
              Marking the {reasonFor.slot} session on {formatDate(date)} as{" "}
              <strong>{reasonFor.status}</strong>.
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
          Mark <strong>all {rows.length} students</strong> as {bulk?.status} for the {bulk?.slot}{" "}
          session on {formatDate(date)}? Existing marks for that session will be overwritten.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setBulk(null)}>
            Cancel
          </Button>
          <Button
            disabled={bulkMark.isPending}
            onClick={() => bulk && bulkMark.mutate(bulk)}
          >
            {bulkMark.isPending ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function SlotButtons({
  value,
  disabled,
  onPick,
}: {
  value: AttendanceStatus | null;
  disabled: boolean;
  onPick: (status: AttendanceStatus | null) => void;
}) {
  const options: { key: AttendanceStatus; label: string }[] = [
    { key: "present", label: "P" },
    { key: "absent", label: "A" },
    { key: "excused", label: "E" },
  ];
  return (
    <div className="inline-flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          title={o.key}
          onClick={() => onPick(value === o.key ? null : o.key)}
          className={[
            "h-8 w-8 rounded-full text-xs font-bold transition disabled:opacity-40",
            value === o.key
              ? o.key === "present"
                ? "bg-success text-primary-foreground"
                : o.key === "absent"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-gold text-gold-foreground"
              : "border border-border bg-card/70 text-muted-foreground hover:bg-accent",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
