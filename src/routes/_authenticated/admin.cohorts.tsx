import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  Spinner,
  StatCard,
} from "@/components/ui-kit";
import { pickActive, useAttendance, useBlocks, useCohorts, useStudents } from "@/lib/admin-hooks";
import { assignCohort, deleteCohort, saveCohort } from "@/lib/data.functions";
import { summarise, type Cohort } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/cohorts")({
  head: () => ({
    meta: [
      { title: "Cohorts · Meditation Attendance" },
      {
        name: "description",
        content:
          "Create cohorts such as MI21 A or MI22, assign and move students between them, and compare meditation attendance statistics per cohort.",
      },
      { property: "og:title", content: "Cohort Management" },
      {
        property: "og:description",
        content: "Group students into cohorts and compare attendance performance across groups.",
      },
    ],
  }),
  component: AdminCohorts,
});

type FormState = { id?: string; name: string; programme: string; intake_year: string };
const empty: FormState = { name: "", programme: "", intake_year: "" };

function AdminCohorts() {
  const qc = useQueryClient();
  const cohortsQuery = useCohorts();
  const studentsQuery = useStudents();
  const { data: cohorts, isLoading: lc } = cohortsQuery;
  const { data: students, isLoading: ls } = studentsQuery;
  const { data: blocks } = useBlocks();
  const block = pickActive(blocks);
  const { data: records } = useAttendance(block?.id ?? null);

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Cohort | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("all");

  const saveFn = useServerFn(saveCohort);
  const deleteFn = useServerFn(deleteCohort);
  const assignFn = useServerFn(assignCohort);

  const save = useMutation({
    mutationFn: (v: FormState) =>
      saveFn({
        data: {
          ...(v.id ? { id: v.id } : {}),
          name: v.name,
          programme: v.programme,
          intake_year: v.intake_year ? Number(v.intake_year) : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cohorts"] });
      setForm(null);
      toast.success("Cohort saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cohorts"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      setConfirmDelete(null);
      toast.success("Cohort deleted — its students are now unassigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: (ids: string[]) =>
      assignFn({ data: { student_ids: ids, cohort_id: moveTo === "none" ? null : moveTo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setPicked({});
      toast.success("Students moved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const list = cohorts ?? [];
    const all = students ?? [];
    const rows = list.map((c) => {
      const members = all.filter((s) => s.cohort_id === c.id);
      const summaries = members.map((s) =>
        summarise(
          block,
          (records ?? []).filter((r) => r.student_id === s.id),
        ),
      );
      const avg =
        summaries.length > 0
          ? Math.round((summaries.reduce((a, s) => a + s.percentage, 0) / summaries.length) * 10) / 10
          : 0;
      return {
        cohort: c,
        count: members.length,
        average: avg,
        met: summaries.filter((s) => s.met).length,
        atRisk: summaries.filter((s) => s.status === "risk").length,
      };
    });
    return rows;
  }, [cohorts, students, records, block]);

  const unassigned = (students ?? []).filter((s) => !s.cohort_id).length;

  const visibleStudents = useMemo(() => {
    const all = students ?? [];
    if (filter === "all") return all;
    if (filter === "none") return all.filter((s) => !s.cohort_id);
    return all.filter((s) => s.cohort_id === filter);
  }, [students, filter]);

  const pickedIds = Object.keys(picked).filter((k) => picked[k]);

  const failed = cohortsQuery.error ?? studentsQuery.error;
  if (failed)
    return (
      <ErrorState
        title="Cohorts could not be loaded"
        error={failed}
        onRetry={() => {
          void cohortsQuery.refetch();
          void studentsQuery.refetch();
        }}
      />
    );

  if (lc || ls) return <Spinner label="Loading cohorts" />;

  return (
    <>
      <SectionTitle
        title="Cohorts"
        subtitle={`${cohorts?.length ?? 0} cohorts · attendance shown for ${block?.name ?? "no block"}`}
        action={<Button onClick={() => setForm({ ...empty })}>New cohort</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cohorts" value={cohorts?.length ?? 0} tone="gold" />
        <StatCard label="Students" value={students?.length ?? 0} />
        <StatCard label="Unassigned" value={unassigned} tone={unassigned ? "red" : "neutral"} />
        <StatCard
          label="Best cohort"
          value={
            stats.filter((s) => s.count > 0).sort((a, b) => b.average - a.average)[0]?.cohort.name ?? "—"
          }
          tone="green"
        />
      </div>

      <Card>
        <SectionTitle title="Cohort statistics" subtitle="Average attendance for the current block" />
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohorts yet. Create one to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Cohort</th>
                  <th className="pb-2">Programme</th>
                  <th className="pb-2">Intake</th>
                  <th className="pb-2">Students</th>
                  <th className="pb-2">Average</th>
                  <th className="pb-2">At or above 80%</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(({ cohort, count, average, met, atRisk }) => (
                  <tr key={cohort.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{cohort.name}</td>
                    <td className="py-2 text-muted-foreground">{cohort.programme ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{cohort.intake_year ?? "—"}</td>
                    <td className="py-2">{count}</td>
                    <td className="py-2">
                      <Badge tone={average >= 80 ? "green" : average >= 70 ? "amber" : "red"}>
                        {average}%
                      </Badge>
                    </td>
                    <td className="py-2">
                      {met}/{count}
                      {atRisk > 0 ? (
                        <span className="ml-2 text-xs text-destructive">{atRisk} at risk</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm({
                              id: cohort.id,
                              name: cohort.name,
                              programme: cohort.programme ?? "",
                              intake_year: cohort.intake_year ? String(cohort.intake_year) : "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirmDelete(cohort)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <SectionTitle
          title="Assign and move students"
          subtitle="Select students, choose a destination cohort, then move them"
        />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Field label="Show">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All students</option>
              <option value="none">Unassigned</option>
              {(cohorts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Move selected to">
            <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Choose cohort…</option>
              <option value="none">No cohort</option>
              {(cohorts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              disabled={!moveTo || pickedIds.length === 0 || move.isPending}
              onClick={() => move.mutate(pickedIds)}
            >
              {move.isPending ? "Moving…" : `Move ${pickedIds.length || ""}`.trim()}
            </Button>
          </div>
        </div>

        {visibleStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={visibleStudents.every((s) => picked[s.id])}
                      onChange={(e) => {
                        const next = { ...picked };
                        for (const s of visibleStudents) next[s.id] = e.target.checked;
                        setPicked(next);
                      }}
                    />
                  </th>
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Number</th>
                  <th className="pb-2">Cohort</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.full_name}`}
                        checked={Boolean(picked[s.id])}
                        onChange={(e) => setPicked({ ...picked, [s.id]: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 font-medium">{s.full_name}</td>
                    <td className="py-2 text-muted-foreground">{s.student_number ?? "—"}</td>
                    <td className="py-2">
                      {(cohorts ?? []).find((c) => c.id === s.cohort_id)?.name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "Edit cohort" : "New cohort"}>
        {form ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label="Cohort name">
              <Input
                required
                minLength={2}
                maxLength={60}
                placeholder="MI21 A"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Programme (optional)">
              <Input
                maxLength={120}
                placeholder="Bachelor of Business Administration"
                value={form.programme}
                onChange={(e) => setForm({ ...form, programme: e.target.value })}
              />
            </Field>
            <Field label="Intake year (optional)">
              <Input
                type="number"
                min={2000}
                max={2100}
                value={form.intake_year}
                onChange={(e) => setForm({ ...form, intake_year: e.target.value })}
              />
            </Field>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save cohort"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete cohort">
        <p className="text-sm text-muted-foreground">
          Delete <strong>{confirmDelete?.name}</strong>? Students stay in the system but become
          unassigned. Attendance records are not affected.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
