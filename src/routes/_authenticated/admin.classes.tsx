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
import {
  pickActive,
  useBlocks,
  useClassAttendance,
  useClassSessions,
  useCohorts,
  useStudents,
} from "@/lib/admin-hooks";
import {
  deleteClassSession,
  markClassAttendance,
  saveClassSession,
} from "@/lib/class.functions";
import {
  CLASS_MODES,
  formatDate,
  summariseClass,
  todayKey,
  type ClassMode,
  type ClassRecord,
  type ClassSession,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/classes")({
  head: () => ({
    meta: [
      { title: "Class Register · Attendance Management" },
      {
        name: "description",
        content:
          "Record class attendance separately from meditation: points per class, online or physical attendance, behaviour comments, and the 80% block requirement.",
      },
      { property: "og:title", content: "Class Register" },
      {
        property: "og:description",
        content:
          "Mark class attendance with points, attendance type and behaviour comments, and see who owes credits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminClasses,
});

type Draft = {
  id?: string;
  session_date: string;
  title: string;
  lecturer: string;
  max_points: number;
};

const emptyDraft = (): Draft => ({
  session_date: todayKey(),
  title: "",
  lecturer: "",
  max_points: 2,
});

function pointChoices(max: number) {
  const out: number[] = [];
  for (let p = max; p >= 0; p -= 0.5) out.push(Math.round(p * 10) / 10);
  return out;
}

function AdminClasses() {
  const qc = useQueryClient();
  const { data: blocks, isLoading: lb } = useBlocks();
  const { data: students, isLoading: ls } = useStudents();
  const { data: cohorts } = useCohorts();
  const active = pickActive(blocks);
  const [blockId, setBlockId] = useState<string | null>(null);
  const block = blocks?.find((b) => b.id === (blockId ?? active?.id)) ?? null;

  const { data: sessions, isLoading: lsess } = useClassSessions(block?.id ?? null);
  const { data: records } = useClassAttendance(block?.id ?? null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const session =
    sessions?.find((s) => s.id === sessionId) ?? (sessions && sessions[0]) ?? null;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [tab, setTab] = useState<"mark" | "results">("mark");

  const saveFn = useServerFn(saveClassSession);
  const deleteFn = useServerFn(deleteClassSession);
  const markFn = useServerFn(markClassAttendance);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["class-sessions", block?.id] });
    qc.invalidateQueries({ queryKey: ["class-attendance", block?.id] });
  };

  const saveSession = useMutation({
    mutationFn: (v: Draft) =>
      saveFn({
        data: {
          ...(v.id ? { id: v.id } : {}),
          block_id: block!.id,
          session_date: v.session_date,
          title: v.title.trim(),
          lecturer: v.lecturer.trim(),
          max_points: Number(v.max_points),
        },
      }),
    onSuccess: () => {
      toast.success("Class saved");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSession = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Class removed");
      setSessionId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mark = useMutation({
    mutationFn: (v: {
      student_id: string;
      points: number | null;
      mode: ClassMode;
      comment: string;
    }) => markFn({ data: { session_id: session!.id, ...v } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const roster = useMemo(() => {
    const list = (students ?? []).filter((s) => {
      if (block?.cohort_id && s.cohort_id !== block.cohort_id) return false;
      if (cohortFilter !== "all" && s.cohort_id !== cohortFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          s.full_name.toLowerCase().includes(q) ||
          (s.student_number ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
    return list;
  }, [students, block?.cohort_id, cohortFilter, search]);

  const byStudent = useMemo(() => {
    const map = new Map<string, ClassRecord[]>();
    for (const r of records ?? []) {
      const list = map.get(r.student_id) ?? [];
      list.push(r);
      map.set(r.student_id, list);
    }
    return map;
  }, [records]);

  const currentRecord = (studentId: string) =>
    (records ?? []).find((r) => r.session_id === session?.id && r.student_id === studentId) ?? null;

  if (lb || ls) return <Spinner label="Loading class register" />;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Class register"
        subtitle="Separate from the meditation register. Score each class, record online or physical attendance, and note behaviour."
      />

      <Card className="grid gap-3 sm:grid-cols-3">
        <Field label="BLOCK">
          <Select
            value={block?.id ?? ""}
            onChange={(e) => {
              setBlockId(e.target.value);
              setSessionId(null);
            }}
          >
            {(blocks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {formatDate(b.start_date)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="COHORT FILTER">
          <Select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
            <option value="all">All cohorts</option>
            {(cohorts ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="SEARCH STUDENT">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or student number"
          />
        </Field>
      </Card>

      <div className="flex gap-2">
        <Button variant={tab === "mark" ? "primary" : "outline"} onClick={() => setTab("mark")}>
          Mark a class
        </Button>
        <Button
          variant={tab === "results" ? "primary" : "outline"}
          onClick={() => setTab("results")}
        >
          Block results
        </Button>
      </div>

      {tab === "mark" ? (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Field label="CLASS SESSION" className="min-w-[220px] flex-1">
                <Select
                  value={session?.id ?? ""}
                  onChange={(e) => setSessionId(e.target.value)}
                  disabled={!sessions || sessions.length === 0}
                >
                  {(sessions ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.session_date)} · {s.title} · out of {Number(s.max_points).toFixed(1)}
                    </option>
                  ))}
                  {sessions && sessions.length === 0 ? (
                    <option value="">No classes created yet</option>
                  ) : null}
                </Select>
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDraft(emptyDraft())}
                  disabled={!block}
                >
                  New class
                </Button>
                {session ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          id: session.id,
                          session_date: session.session_date,
                          title: session.title,
                          lecturer: session.lecturer ?? "",
                          max_points: Number(session.max_points),
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => removeSession.mutate(session.id)}
                    >
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {session?.lecturer ? (
              <p className="text-xs text-muted-foreground">Lecturer: {session.lecturer}</p>
            ) : null}
          </Card>

          {lsess ? (
            <Spinner label="Loading classes" />
          ) : !session ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                Create the first class for this block to start marking.
              </p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Points</th>
                    <th className="px-4 py-3">Attendance type</th>
                    <th className="px-4 py-3">Behaviour comment</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <MarkRow
                      key={s.id}
                      name={s.full_name}
                      number={s.student_number}
                      session={session}
                      record={currentRecord(s.id)}
                      saving={mark.isPending}
                      onSave={(v) => mark.mutate({ student_id: s.id, ...v })}
                    />
                  ))}
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                        No students match this block or filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Classes marked</th>
                <th className="px-4 py-3">Points</th>
                <th className="px-4 py-3">Class attendance</th>
                <th className="px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const sum = summariseClass(sessions ?? [], byStudent.get(s.id) ?? []);
                return (
                  <tr key={s.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{s.full_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.student_number ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sum.marked}/{sum.sessions}
                      <span className="block text-xs text-muted-foreground">
                        {sum.physical} physical · {sum.online} online
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sum.pointsEarned.toFixed(1)} / {sum.pointsPossible.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 font-semibold">{sum.percentage.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      {sum.met ? (
                        <Badge tone="green">Requirement met</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge tone="red">Requirement not met</Badge>
                          <span className="block text-xs text-destructive">
                            Owes {sum.pointsOwed.toFixed(1)} points ({sum.percentageOwed.toFixed(1)}%
                            short of 80%)
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No students match this block or filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Class attendance is scored out of every class in the block. Minimum 80%, maximum 100%.
          </p>
        </Card>
      )}

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit class" : "New class"}
      >
        {draft ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveSession.mutate(draft);
            }}
          >
            <Field label="DATE">
              <Input
                type="date"
                required
                value={draft.session_date}
                onChange={(e) => setDraft({ ...draft, session_date: e.target.value })}
              />
            </Field>
            <Field label="CLASS / SUBJECT">
              <Input
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Business Studies"
              />
            </Field>
            <Field label="LECTURER (OPTIONAL)">
              <Input
                value={draft.lecturer}
                onChange={(e) => setDraft({ ...draft, lecturer: e.target.value })}
              />
            </Field>
            <Field label="POINTS THIS CLASS IS WORTH">
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="20"
                required
                value={draft.max_points}
                onChange={(e) => setDraft({ ...draft, max_points: Number(e.target.value) })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveSession.isPending}>
                {saveSession.isPending ? "Saving…" : "Save class"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

function MarkRow({
  name,
  number,
  session,
  record,
  saving,
  onSave,
}: {
  name: string;
  number: string | null;
  session: ClassSession;
  record: ClassRecord | null;
  saving: boolean;
  onSave: (v: { points: number | null; mode: ClassMode; comment: string }) => void;
}) {
  const [mode, setMode] = useState<ClassMode>(record?.mode ?? "physical");
  const [comment, setComment] = useState(record?.comment ?? "");
  const points = record ? Number(record.points) : null;
  const choices = pointChoices(Number(session.max_points));

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-4 py-3">
        <span className="font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{number ?? "—"}</span>
      </td>
      <td className="px-4 py-3">
        <Select
          value={points === null ? "" : String(points)}
          onChange={(e) =>
            onSave({
              points: e.target.value === "" ? null : Number(e.target.value),
              mode,
              comment,
            })
          }
        >
          <option value="">Not marked</option>
          {choices.map((p) => (
            <option key={p} value={p}>
              {p.toFixed(1)}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-3">
        <Select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as ClassMode;
            setMode(next);
            if (points !== null) onSave({ points, mode: next, comment });
          }}
        >
          {CLASS_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Behaviour during class"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={saving || points === null}
            onClick={() => onSave({ points, mode, comment })}
          >
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}
