import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "@/components/ui-kit";
import { useBlocks, useCohorts } from "@/lib/admin-hooks";
import { useMe } from "@/components/AppShell";
import { deleteBlock, resetBlockAttendance, saveBlock, setBlockStatus } from "@/lib/data.functions";
import { blockDates, blockProgress, blockSessions, dateKey, formatDate, type Block, type BlockStatus } from "@/lib/attendance";
import { createBlockSheetTab, listSheetLinks } from "@/lib/sheet-sync.functions";

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
  rounding: boolean;
  rounding_dates: string[];
  holidays: boolean;
  holiday_dates: string[];
  create_sheet_tab: boolean;
  sheet_tab_touched: boolean;
  template_link_id: string;
  sheet_tab_name: string;
  sheet_tab_custom: boolean;
};

const empty: FormState = {
  name: "",
  start_date: "",
  end_date: "",
  status: "upcoming",
  cohort_id: "",
  percent_input: "",
  rounding: false,
  rounding_dates: [],
  holidays: false,
  holiday_dates: [],
  create_sheet_tab: false,
  sheet_tab_touched: false,
  template_link_id: "",
  sheet_tab_name: "",
  sheet_tab_custom: false,
};

/**
 * Meditation days in the range. Sundays never exist. MII also has optional
 * Friday/Saturday sessions; MIU attends Monday–Thursday only, so Fridays and
 * Saturdays do not exist for MIU blocks.
 */
function derive(
  start: string,
  end: string,
  institution?: string | null,
  rounding: string[] = [],
  holidays: string[] = [],
) {
  if (!start || !end) return { valid: false, rangeValid: false, days: 0, weeks: 0, sessions: 0, holidayCount: 0 };
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    return { valid: false, rangeValid: false, days: 0, weeks: 0, sessions: 0, holidayCount: 0 };
  }
  const holidaySet = new Set(holidays.filter((h) => h >= start && h <= end));
  let days = 0;
  let total = 0;
  let sessions = 0;
  let holidayCount = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    total += 1;
    const dow = d.getDay();
    if (dow === 0) continue;
    if (institution === "MIU" && dow === 6) continue;
    const key = dateKey(d);
    if (holidaySet.has(key)) {
      holidayCount += 1;
      continue;
    }
    days += 1;
    // MIU Friday has a morning session only.
    sessions += institution === "MIU" && dow === 5 ? 1 : 2;
  }
  // Each rounding day has three compulsory sessions (6 points).
  for (const r of new Set(rounding)) {
    if (r < start || r > end || holidaySet.has(r)) continue;
    const dow = new Date(`${r}T00:00:00`).getDay();
    if (dow === 0 || (institution === "MIU" && dow === 6)) continue;
    sessions += institution === "MIU" && dow === 5 ? 2 : 1;
  }
  return { valid: days > 0, rangeValid: true, days, weeks: Math.max(1, Math.ceil(total / 7)), sessions, holidayCount };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function AdminBlocks() {
  const qc = useQueryClient();
  const { data: blocks, isLoading } = useBlocks();
  const { data: cohorts } = useCohorts();
  const { data: me } = useMe();
  const institution = (me as any)?.institution as string | undefined;
  const cohortName = (id: string | null | undefined) =>
    (cohorts ?? []).find((c) => c.id === id)?.name ?? null;
  const [form, setForm] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "reset"; block: Block } | null>(null);

  const saveFn = useServerFn(saveBlock);
  const statusFn = useServerFn(setBlockStatus);
  const deleteFn = useServerFn(deleteBlock);
  const resetFn = useServerFn(resetBlockAttendance);
  const listSheetsFn = useServerFn(listSheetLinks);
  const createSheetTabFn = useServerFn(createBlockSheetTab);

  const { data: sheetLinks } = useQuery({
    queryKey: ["sheet-links"],
    queryFn: () => listSheetsFn(),
  });
  const availableTemplates = (sheetLinks as any[] | undefined) ?? [];
  const firstTemplateId = availableTemplates[0]?.id ?? "";

  // If the modal opens while sheet links are still loading, automatically turn on
  // tab creation as soon as a template link is ready (unless the user toggled it).
  useEffect(() => {
    if (!firstTemplateId) return;
    setForm((prev) => {
      if (!prev || prev.id || prev.sheet_tab_touched || prev.template_link_id) return prev;
      return {
        ...prev,
        create_sheet_tab: true,
        template_link_id: firstTemplateId,
        sheet_tab_name: prev.sheet_tab_name || prev.name,
      };
    });
  }, [firstTemplateId]);

  const refresh = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["blocks"] });
    qc.invalidateQueries({ queryKey: ["attendance"] });
    qc.invalidateQueries({ queryKey: ["sheet-links"] });
    setForm(null);
    setConfirm(null);
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (v: FormState) => {
      const holidayDates = v.holidays ? v.holiday_dates : [];
      const holidaySet = new Set(holidayDates);
      const roundingDates = v.rounding ? v.rounding_dates.filter((r) => !holidaySet.has(r)) : [];
      const d = derive(v.start_date, v.end_date, institution, roundingDates, holidayDates);
      if (!d.valid) {
        throw new Error(
          d.rangeValid
            ? "At least one meditation day must remain in the block."
            : "Enter a start date and an end date that comes after it.",
        );
      }
      const typed = Number(v.percent_input);
      if (!v.percent_input.trim() || !Number.isFinite(typed) || typed <= 0) {
        throw new Error("Enter how many percent one full 2.0 session is worth.");
      }
      if (!v.id && v.create_sheet_tab) {
        if (!v.template_link_id) throw new Error("Choose a Google Sheet template tab to copy from.");
        if (!(v.sheet_tab_name.trim() || v.name.trim())) {
          throw new Error("Enter a name for the new Google Sheet tab.");
        }
      }
      const saved = await saveFn({
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
          rounding_dates: roundingDates,
          holiday_dates: holidayDates,
        },
      });

      if (!v.id && v.create_sheet_tab && v.template_link_id) {
        try {
          const sheetRes = await createSheetTabFn({
            data: {
              block_id: saved.id,
              template_link_id: v.template_link_id,
              tab_name: (v.sheet_tab_name.trim() || v.name.trim()).slice(0, 100),
            },
          });
          return { ...saved, sheetTab: sheetRes.sheet_name, sheetError: null as string | null };
        } catch (err) {
          return {
            ...saved,
            sheetTab: null as string | null,
            sheetError: err instanceof Error ? err.message : "Could not create Google Sheet tab.",
          };
        }
      }
      return { ...saved, sheetTab: null as string | null, sheetError: null as string | null };
    },
    onSuccess: (res) => {
      if (res.sheetTab) {
        refresh(`Block saved and Google Sheet tab "${res.sheetTab}" created and linked.`);
      } else if (res.sheetError) {
        qc.invalidateQueries({ queryKey: ["blocks"] });
        qc.invalidateQueries({ queryKey: ["attendance"] });
        setForm(null);
        toast.warning(`Block saved, but creating the Google Sheet tab failed: ${res.sheetError}`);
      } else if (res.sheetWarnings?.length) {
        qc.invalidateQueries({ queryKey: ["blocks"] });
        qc.invalidateQueries({ queryKey: ["attendance"] });
        qc.invalidateQueries({ queryKey: ["sheet-links"] });
        setForm(null);
        toast.warning(`Block saved, with a Google Sheet warning: ${res.sheetWarnings.join(" ")}`);
      } else if (res.lockedTabs?.length) {
        refresh(`Block saved and dropdowns removed from Google Sheet (${res.lockedTabs.join(", ")}).`);
      } else if (res.restoredTabs?.length) {
        refresh(`Block saved and dropdowns restored on Google Sheet (${res.restoredTabs.join(", ")}).`);
      } else {
        refresh("Block saved");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: BlockStatus }) => statusFn({ data: v }),
    onSuccess: (res) => {
      if (res.sheetWarnings?.length) {
        qc.invalidateQueries({ queryKey: ["blocks"] });
        qc.invalidateQueries({ queryKey: ["attendance"] });
        qc.invalidateQueries({ queryKey: ["sheet-links"] });
        toast.warning(`Block status updated, with a Google Sheet warning: ${res.sheetWarnings.join(" ")}`);
        return;
      }
      const parts: string[] = [];
      if (res.lockedTabs?.length) parts.push(`dropdowns removed from ${res.lockedTabs.join(", ")}`);
      if (res.restoredTabs?.length) parts.push(`dropdowns restored on ${res.restoredTabs.join(", ")}`);
      refresh(parts.length > 0 ? `Block updated — ${parts.join("; ")}.` : "Block status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (res) => {
      if (res.sheetWarnings?.length) {
        qc.invalidateQueries({ queryKey: ["blocks"] });
        qc.invalidateQueries({ queryKey: ["attendance"] });
        qc.invalidateQueries({ queryKey: ["sheet-links"] });
        setConfirm(null);
        toast.warning(`Block deleted. ${res.sheetWarnings.join(" ")}`);
        return;
      }
      if (res.deletedTabs?.length) {
        refresh(`Block deleted and Google Sheet tab removed (${res.deletedTabs.join(", ")}).`);
      } else {
        refresh("Block deleted");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: (block_id: string) => resetFn({ data: { block_id } }),
    onSuccess: () => refresh("Attendance reset for block"),
    onError: (e: Error) => toast.error(e.message),
  });

  const createTabForExisting = useMutation({
    mutationFn: (b: Block) => {
      if (!firstTemplateId) throw new Error("Connect a template Google Sheet first.");
      return createSheetTabFn({
        data: {
          block_id: b.id,
          template_link_id: firstTemplateId,
          tab_name: b.name.slice(0, 100),
        },
      });
    },
    onSuccess: (res) => refresh(`Created and linked Google Sheet tab "${res.sheet_name}".`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Spinner label="Loading blocks" />;

  return (
    <>
      <SectionTitle
        title="Meditation blocks"
        subtitle="Percentages always scale to 100% of the sessions in the selected block"
        action={
          <Button
            onClick={() =>
              setForm({
                ...empty,
                create_sheet_tab: Boolean(firstTemplateId),
                template_link_id: firstTemplateId,
              })
            }
          >
            New block
          </Button>
        }
      />

      {(blocks ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No blocks yet. Create one to start recording attendance.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(blocks ?? []).map((b) => {
            const linkedTabs = availableTemplates.filter((l) => l.block_id === b.id);
            const blockSessionGroups = blockSessions(b);
            const totalBlockSessions = blockSessionGroups.compulsory.length + blockSessionGroups.optional.length;
            const holidayCount = (b.holiday_dates ?? []).length;
            return (
            <Card key={b.id}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">{b.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(b.start_date)} → {formatDate(b.end_date)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cohortName(b.cohort_id) ? `Cohort · ${cohortName(b.cohort_id)}` : "All cohorts"}
                    {holidayCount > 0 ? ` · ${holidayCount} holiday${holidayCount === 1 ? "" : "s"}` : ""}
                  </p>
                  {linkedTabs.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sheet:{" "}
                      <a
                        href={linkedTabs[0].spreadsheet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline"
                      >
                        {linkedTabs[0].sheet_name}
                      </a>
                      {linkedTabs.length > 1 ? ` (+${linkedTabs.length - 1} more)` : ""}
                    </p>
                  ) : null}
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
                <Stat label="Sessions" value={totalBlockSessions} />
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
                          : String(round1(100 / Math.max(1, totalBlockSessions))),
                      rounding: ((b as any).rounding_dates ?? []).length > 0,
                      rounding_dates: (b as any).rounding_dates ?? [],
                      holidays: ((b as any).holiday_dates ?? []).length > 0,
                      holiday_dates: (b as any).holiday_dates ?? [],
                      create_sheet_tab: false,
                      sheet_tab_touched: true,
                      template_link_id: "",
                      sheet_tab_name: "",
                      sheet_tab_custom: false,
                    })
                  }
                >
                  Edit
                </Button>
                {linkedTabs.length === 0 && firstTemplateId ? (
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={createTabForExisting.isPending}
                    onClick={() => createTabForExisting.mutate(b)}
                  >
                    {createTabForExisting.isPending ? "Creating tab…" : "Create sheet tab"}
                  </Button>
                ) : null}
                {b.status !== "active" ? (
                  <Button
                    size="sm"
                    disabled={changeStatus.isPending}
                    onClick={() => changeStatus.mutate({ id: b.id, status: "active" })}
                  >
                    {changeStatus.isPending ? "Updating…" : "Open block"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="gold"
                    disabled={changeStatus.isPending}
                    onClick={() => changeStatus.mutate({ id: b.id, status: "closed" })}
                  >
                    {changeStatus.isPending ? "Locking…" : "Lock block"}
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
            );
          })}
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
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    ...(form.sheet_tab_custom ? {} : { sheet_tab_name: e.target.value }),
                  })
                }
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
            <div className="rounded-xl border border-border/60 bg-card/40 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.holidays}
                  onChange={(e) => setForm({ ...form, holidays: e.target.checked })}
                />
                This block has holidays or no-meditation days
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Selected days have no meditation sessions and are excluded from attendance totals and Google Sheets.
              </p>
              {form.holidays ? (
                form.start_date && form.end_date ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {blockDates({ start_date: form.start_date, end_date: form.end_date, institution: institution ?? null }).map((d) => {
                      const on = form.holiday_dates.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          onClick={() => {
                            const nextHolidays = on
                              ? form.holiday_dates.filter((x) => x !== d)
                              : [...form.holiday_dates, d].sort();
                            setForm({
                              ...form,
                              holiday_dates: nextHolidays,
                              rounding_dates: on
                                ? form.rounding_dates
                                : form.rounding_dates.filter((x) => x !== d),
                            });
                          }}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-background/60"}`}
                        >
                          {formatDate(d)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Pick the start and end dates first.</p>
                )
              ) : null}
            </div>
            <div className="rounded-xl border border-border/60 bg-card/40 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.rounding}
                  onChange={(e) => setForm({ ...form, rounding: e.target.checked })}
                />
                This block has rounding days
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                A rounding day has 3 sessions (morning, afternoon, evening) worth 6 points.
              </p>
              {form.rounding ? (
                form.start_date && form.end_date ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {blockDates({
                      start_date: form.start_date,
                      end_date: form.end_date,
                      institution: institution ?? null,
                      holiday_dates: form.holidays ? form.holiday_dates : [],
                    }).map((d) => {
                      const on = form.rounding_dates.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          onClick={() =>
                            setForm({
                              ...form,
                              rounding_dates: on
                                ? form.rounding_dates.filter((x) => x !== d)
                                : [...form.rounding_dates, d].sort(),
                            })
                          }
                          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60"}`}
                        >
                          {formatDate(d)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Pick the start and end dates first.</p>
                )
              ) : null}
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
              const d = derive(
                form.start_date,
                form.end_date,
                institution,
                form.rounding ? form.rounding_dates : [],
                form.holidays ? form.holiday_dates : [],
              );
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
            {!form.id ? (
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                {availableTemplates.length > 0 ? (
                  <>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form.create_sheet_tab}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            create_sheet_tab: e.target.checked,
                            sheet_tab_touched: true,
                            template_link_id: form.template_link_id || firstTemplateId,
                            sheet_tab_name: form.sheet_tab_name || form.name,
                          })
                        }
                      />
                      Create matching tab in Google Sheets
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Duplicates your template tab with students, dropdowns and formulas, clears old
                      marks, updates block headers, and links it for live sync.
                    </p>
                    {form.create_sheet_tab ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="Copy layout from">
                          <Select
                            value={form.template_link_id}
                            onChange={(e) =>
                              setForm({ ...form, template_link_id: e.target.value })
                            }
                          >
                            {availableTemplates.map((link) => (
                              <option key={link.id} value={link.id}>
                                {link.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="New tab name">
                          <Input
                            required
                            maxLength={100}
                            placeholder="e.g. BLOCK 11"
                            value={form.sheet_tab_name}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                sheet_tab_name: e.target.value,
                                sheet_tab_custom: true,
                              })
                            }
                          />
                        </Field>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Want a Google Sheets tab created automatically for new blocks? Connect your
                    template once under{" "}
                    <Link to="/admin/sheets" className="font-medium text-primary underline">
                      Google Sheet sync
                    </Link>
                    .
                  </p>
                )}
              </div>
            ) : null}
            {(() => {
              const d = derive(
                form.start_date,
                form.end_date,
                institution,
                form.rounding ? form.rounding_dates : [],
                form.holidays ? form.holiday_dates : [],
              );
              const per = Number(form.percent_input);
              if (!d.valid) {
                return (
                  <p className="text-xs text-muted-foreground">
                    {d.rangeValid
                      ? "At least one meditation day must remain in the block."
                      : "Enter the start and end dates and the system works out the length of the block."}
                  </p>
                );
              }
              const valid = Number.isFinite(per) && per > 0;
              const totalPercent = valid ? round1(per * d.sessions) : 0;
              return (
                <div className="rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Calculated for this block</p>
                  <p className="mt-1">
                    {d.weeks} week{d.weeks === 1 ? "" : "s"} · {d.days} meditation days (
                    {institution === "MIU" ? "Monday–Thursday + Friday morning" : "Sundays excluded"}) ·{" "}
                    {d.sessions} sessions · {round1(d.sessions * 2)} points available
                    {d.holidayCount > 0
                      ? ` · ${d.holidayCount} holiday${d.holidayCount === 1 ? "" : "s"} excluded`
                      : ""}
                  </p>
                  {valid ? (
                    <>
                      <p className="mt-1">
                        Each session is worth {per}% when marked 2.0 · {totalPercent}% if every
                        session is attended
                      </p>
                      <p className="mt-1">
                        Per mark: 2.0 = {per}% · 1.5 = {round1(per * 0.75)}% · 1.0 ={" "}
                        {round1(per / 2)}% · 0.5 = {round1(per * 0.25)}% · 0 = 0%
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
                {save.isPending
                  ? form.create_sheet_tab
                    ? "Creating block & sheet tab…"
                    : "Saving…"
                  : "Save block"}
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
          {(() => {
            if (!confirm) return "";
            if (confirm.kind === "reset") {
              return `Clear all attendance records for ${confirm.block.name}? Student percentages return to 0%.`;
            }
            const linked = availableTemplates.filter((l) => l.block_id === confirm.block.id);
            if (linked.length > 0) {
              const names = linked.map((l) => `"${l.sheet_name}"`).join(", ");
              return `Delete ${confirm.block.name}, every attendance record inside it, and its linked Google Sheet tab (${names})? This cannot be undone.`;
            }
            return `Delete ${confirm.block.name} and every attendance record inside it? This cannot be undone.`;
          })()}
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
