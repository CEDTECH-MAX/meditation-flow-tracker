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
  status: BlockStatus;
  cohort_id: string;
  percent_input: string;
};

const empty: FormState = {
  name: "",
  start_date: "",
  end_date: "",
  status: "upcoming",
  cohort_id: "",
  percent_input: "",
};

/** Meditation days = every day in the range except Sundays. */
function derive(start: string, end: string) {
  if (!start || !end) return { valid: false, days: 0, weeks: 0, sessions: 0 };
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    return { valid: false, days: 0, weeks: 0, sessions: 0 };
  }
  let days = 0;
  let total = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    total += 1;
    if (d.getDay() !== 0) days += 1;
  }
  return { valid: days > 0, days, weeks: Math.max(1, Math.ceil(total / 7)), sessions: days * 2 };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

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
    mutationFn: (v: FormState) => {
      const d = derive(v.start_date, v.end_date);
      if (!d.valid) throw new Error("Enter a start date and an end date that comes after it.");
      const typed = Number(v.percent_input);
      if (!v.percent_input.trim() || !Number.isFinite(typed) || typed <= 0) {
        throw new Error("Enter how many percent one full 2.0 session is worth.");
      }
      return saveFn({
        data: {
          ...(v.id ? { id: v.id } : {}),
          name: v.name,
          start_date: v.start_date,
          end_date: v.end_date,
          weeks: d.weeks,
          meditation_days: d.days,
          status: v.status,
          cohort_id: v.cohort_id || null,
          percent_per_session: typed,
        },
      });
    },
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
                      status: b.status,
                      cohort_id: b.cohort_id ?? "",
                      percent_input:
                        (b as any).percent_per_session > 0
                          ? String((b as any).percent_per_session)
                          : String(round1(100 / Math.max(1, b.meditation_days * 2))),
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
            </div>
            <Field label="Percent each full session (2.0) is worth">
              <Input
                type="number"
                min={0.1}
                max={100}
                step={0.1}
                required
                placeholder="e.g. 2.5"
                value={form.percent_input}
                onChange={(e) => setForm({ ...form, percent_input: e.target.value })}
              />
            </Field>
            {(() => {
              const d = derive(form.start_date, form.end_date);
              if (!d.valid) return null;
              return (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm({ ...form, percent_input: String(round1(100 / d.sessions)) })
                  }
                >
                  Use even split ({round1(100 / d.sessions)}% per session)
                </Button>
              );
            })()}
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
            {(() => {
              const d = derive(form.start_date, form.end_date);
              const per = Number(form.percent_input);
              if (!d.valid) {
                return (
                  <p className="text-xs text-muted-foreground">
                    Enter the start and end dates and the system works out the length of the block.
                  </p>
                );
              }
              const valid = Number.isFinite(per) && per > 0;
              const totalPercent = valid ? round1(per * d.sessions) : 0;
              return (
                <div className="rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Calculated for this block</p>
                  <p className="mt-1">
                    {d.weeks} week{d.weeks === 1 ? "" : "s"} · {d.days} meditation days (Sundays
                    excluded) · {d.sessions} sessions · {round1(d.sessions * 2)} points available
                  </p>
                  {valid ? (
                    <>
                      <p className="mt-1">
                        {per}% per full 2.0 session · {round1(per / 2)}% per 1.0 ·{" "}
                        {totalPercent}% if every session is attended
                      </p>
                      <p className="mt-1">
                        80% to pass = {round1((80 / per) * 1)} full sessions ·{" "}
                        {round1(d.sessions * 2 * 0.8)} points
                      </p>
                    </>
                  ) : (
                    <p className="mt-1">Enter the percent one full session is worth.</p>
                  )}
                </div>
              );
            })()}
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
