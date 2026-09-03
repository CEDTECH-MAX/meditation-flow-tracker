import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { useBlocks, useCohorts } from "@/lib/admin-hooks";
import { deleteBlock, resetBlockAttendance, saveBlock, setBlockStatus } from "@/lib/data.functions";
import { blockProgress, formatDate, type Block, type BlockStatus } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/blocks")({
  head: () => ({
    meta: [
      { title: "Meditation Blocks · Attendance" },
      {
        name: "description",
        content:
          "Create and configure meditation blocks: dates, number of weeks and meditation days, and open or close a block.",
      },
      { property: "og:title", content: "Meditation Blocks" },
      {
        property: "og:description",
        content: "Configure block duration and status for meditation attendance tracking.",
      },
    ],
  }),
  component: AdminBlocks,
});

type FormState = {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
  weeks: number;
  meditation_days: number;
  status: BlockStatus;
  cohort_id: string;
  session_point_value: number;
  standard_attendance_points: number;
  standard_attendance_percentage: number;
  max_attendance_points: number;
  max_attendance_percentage: number;
  weekly_required_points: number;
  rounding_day: boolean;
  rounding_day_points: number;
};

const empty: FormState = {
  name: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(Date.now() + 27 * 864e5).toISOString().slice(0, 10),
  weeks: 4,
  meditation_days: 20,
  status: "upcoming",
  cohort_id: "",
  session_point_value: 0,
  standard_attendance_points: 0,
  standard_attendance_percentage: 0,
  max_attendance_points: 0,
  max_attendance_percentage: 0,
  weekly_required_points: 0,
  rounding_day: false,
  rounding_day_points: 0,
};


function AdminBlocks() {
  const qc = useQueryClient();
  const { data: blocks, isLoading } = useBlocks();
  const { data: cohorts } = useCohorts();
  const cohortName = (id: string | null | undefined) =>
    (cohorts ?? []).find((c) => c.id === id)?.name ?? null;
  const [form, setForm] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "reset"; block: Block } | null>(null);

  const saveFn = useServerFn(saveBlock);
  const statusFn = useServerFn(setBlockStatus);
  const deleteFn = useServerFn(deleteBlock);
  const resetFn = useServerFn(resetBlockAttendance);

  const refresh = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["blocks"] });
    qc.invalidateQueries({ queryKey: ["attendance"] });
    setForm(null);
    setConfirm(null);
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: (v: FormState) =>
      saveFn({
        data: {
          ...(v.id ? { id: v.id } : {}),
          name: v.name,
          start_date: v.start_date,
          end_date: v.end_date,
          weeks: Number(v.weeks),
          meditation_days: Number(v.meditation_days),
          status: v.status,
          cohort_id: v.cohort_id || null,
          session_point_value: Number(v.session_point_value),
          standard_attendance_points: Number(v.standard_attendance_points),
          standard_attendance_percentage: Number(v.standard_attendance_percentage),
          max_attendance_points: Number(v.max_attendance_points),
          max_attendance_percentage: Number(v.max_attendance_percentage),
          weekly_required_points: Number(v.weekly_required_points),
          rounding_day: v.rounding_day,
          rounding_day_points: v.rounding_day ? Number(v.rounding_day_points) : 0,
          friday_pm_compulsory: false,
          saturday_mode: "optional" as const,
        },
      }),

    onSuccess: () => refresh("Block saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: BlockStatus }) => statusFn({ data: v }),
    onSuccess: () => refresh("Block status updated"),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => refresh("Block deleted"),
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: (block_id: string) => resetFn({ data: { block_id } }),
    onSuccess: () => refresh("Attendance reset for block"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Spinner label="Loading blocks" />;

  return (
    <>
      <SectionTitle
        title="Meditation blocks"
        subtitle="Percentages always scale to 100% of the sessions in the selected block"
        action={<Button onClick={() => setForm({ ...empty })}>New block</Button>}
      />

      {(blocks ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No blocks yet. Create one to start recording attendance.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(blocks ?? []).map((b) => (
            <Card key={b.id}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">{b.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(b.start_date)} → {formatDate(b.end_date)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cohortName(b.cohort_id) ? `Cohort · ${cohortName(b.cohort_id)}` : "All cohorts"}
                  </p>
                </div>
                <Badge
                  tone={b.status === "active" ? "green" : b.status === "closed" ? "red" : "gold"}
                >
                  {b.status}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <Stat label="Weeks" value={b.weeks} />
                <Stat label="Meditation days" value={b.meditation_days} />
                <Stat label="Sessions" value={b.meditation_days * 2} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Line label="Points / session" value={num(b.session_point_value)} />
                <Line label="Weekly required" value={num(b.weekly_required_points)} />
                <Line
                  label="Standard"
                  value={`${num(b.standard_attendance_points)} pts · ${num(b.standard_attendance_percentage)}%`}
                />
                <Line
                  label="Maximum"
                  value={`${num(b.max_attendance_points)} pts · ${num(b.max_attendance_percentage)}%`}
                />
                <Line
                  label="Rounding day"
                  value={b.rounding_day ? `Yes · ${num(b.rounding_day_points)} pts` : "No"}
                />
                <Line label="Fri PM / Sat" value="Optional" />
              </dl>


              <div className="mt-4">
                <p className="mb-1 text-xs text-muted-foreground">Progress · {blockProgress(b)}%</p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-success"
                    style={{ width: `${blockProgress(b)}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm({
                      id: b.id,
                      name: b.name,
                      start_date: b.start_date,
                      end_date: b.end_date,
                      weeks: b.weeks,
                      meditation_days: b.meditation_days,
                      status: b.status,
                      cohort_id: b.cohort_id ?? "",
                      session_point_value: Number(b.session_point_value ?? 0),
                      standard_attendance_points: Number(b.standard_attendance_points ?? 0),
                      standard_attendance_percentage: Number(
                        b.standard_attendance_percentage ?? 0,
                      ),
                      max_attendance_points: Number(b.max_attendance_points ?? 0),
                      max_attendance_percentage: Number(b.max_attendance_percentage ?? 0),
                      weekly_required_points: Number(b.weekly_required_points ?? 0),
                      rounding_day: Boolean(b.rounding_day),
                      rounding_day_points: Number(b.rounding_day_points ?? 0),
                    })

                  }
                >
                  Edit
                </Button>
                {b.status !== "active" ? (
                  <Button
                    size="sm"
                    onClick={() => changeStatus.mutate({ id: b.id, status: "active" })}
                  >
                    Open block
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="gold"
                    onClick={() => changeStatus.mutate({ id: b.id, status: "closed" })}
                  >
                    Close block
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirm({ kind: "reset", block: b })}
                >
                  Reset attendance
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirm({ kind: "delete", block: b })}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit block" : "New block"}
      >
        {form ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label="Block name">
              <Input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date">
                <Input
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </Field>
              <Field label="Weeks (2–6 typical)">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  required
                  value={form.weeks}
                  onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })}
                />
              </Field>
              <Field label="Meditation days">
                <Input
                  type="number"
                  min={1}
                  max={400}
                  required
                  value={form.meditation_days}
                  onChange={(e) => setForm({ ...form, meditation_days: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Cohort">
              <Select
                value={form.cohort_id}
                onChange={(e) => setForm({ ...form, cohort_id: e.target.value })}
              >
                <option value="">All cohorts</option>
                {(cohorts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as BlockStatus })}
              >
                <option value="upcoming">Upcoming</option>
                <option value="active">Active (open for marking)</option>
                <option value="closed">Closed (locked)</option>
              </Select>
            </Field>

            <div className="mt-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
              <p className="font-display text-sm font-semibold">Official calculation values</p>
              <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                Enter these exactly as calculated on the traditional spreadsheet. Nothing is
                worked out automatically — these values become the block's official rules used by
                the student dashboard, reports and the Excel register.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Points per session">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={form.session_point_value}
                    onChange={(e) =>
                      setForm({ ...form, session_point_value: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Weekly required points">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={form.weekly_required_points}
                    onChange={(e) =>
                      setForm({ ...form, weekly_required_points: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Standard attendance points">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={form.standard_attendance_points}
                    onChange={(e) =>
                      setForm({ ...form, standard_attendance_points: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Standard attendance percentage">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={form.standard_attendance_percentage}
                    onChange={(e) =>
                      setForm({ ...form, standard_attendance_percentage: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Maximum attendance points">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={form.max_attendance_points}
                    onChange={(e) =>
                      setForm({ ...form, max_attendance_points: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Maximum attendance percentage">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    required
                    value={form.max_attendance_percentage}
                    onChange={(e) =>
                      setForm({ ...form, max_attendance_percentage: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Rounding day">
                  <Select
                    value={form.rounding_day ? "yes" : "no"}
                    onChange={(e) => setForm({ ...form, rounding_day: e.target.value === "yes" })}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Select>
                </Field>
                <Field label="Rounding day points">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    disabled={!form.rounding_day}
                    value={form.rounding_day_points}
                    onChange={(e) =>
                      setForm({ ...form, rounding_day_points: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Friday PM and Saturday sessions stay optional. Sundays are never scheduled.
              </p>
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save block"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "delete" ? "Delete block" : "Reset attendance"}
      >
        <p className="text-sm text-muted-foreground">
          {confirm?.kind === "delete"
            ? `Delete ${confirm?.block.name} and every attendance record inside it? This cannot be undone.`
            : `Clear all attendance records for ${confirm?.block.name}? Student percentages return to 0%.`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending || reset.isPending}
            onClick={() => {
              if (!confirm) return;
              if (confirm.kind === "delete") remove.mutate(confirm.block.id);
              else reset.mutate(confirm.block.id);
            }}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/50 px-2 py-3">
      <p className="font-display text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function num(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : "—";
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
