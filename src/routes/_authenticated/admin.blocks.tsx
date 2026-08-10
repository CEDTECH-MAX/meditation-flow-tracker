import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
};

const empty: FormState = {
  name: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(Date.now() + 27 * 864e5).toISOString().slice(0, 10),
  weeks: 4,
  meditation_days: 20,
  status: "upcoming",
  cohort_id: "",
};

function AdminBlocks() {
  const qc = useQueryClient();
  const blocksQuery = useBlocks();
  const { data: blocks, isLoading } = blocksQuery;
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

  if (blocksQuery.error)
    return (
      <ErrorState
        title="Blocks could not be loaded"
        error={blocksQuery.error}
        onRetry={() => void blocksQuery.refetch()}
      />
    );

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
                      weeks: b.weeks,
                      meditation_days: b.meditation_days,
                      status: b.status,
                      cohort_id: b.cohort_id ?? "",
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
            <p className="text-xs text-muted-foreground">
              {form.meditation_days * 2} total sessions ·{" "}
              {Math.round((100 / Math.max(1, form.meditation_days * 2)) * 10) / 10}% per session ·
              80% required to pass.
            </p>
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
