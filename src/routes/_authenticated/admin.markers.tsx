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
import { pickActive, useBlocks } from "@/lib/admin-hooks";
import {
  createMarker,
  deleteMarker,
  listAllCohorts,
  listMarkers,
  markerProgress,
  setMarkerActive,
  updateMarker,
} from "@/lib/marker.functions";
import { blockDates, formatDate, skipSunday, todayKey, type SessionSlot } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/markers")({
  head: () => ({
    meta: [
      { title: "Markers · Attendance Management" },
      {
        name: "description",
        content:
          "Create marker accounts, assign each marker to one cohort inside their institution, and follow how many students they have marked for a session.",
      },
      { property: "og:title", content: "Markers" },
      {
        property: "og:description",
        content: "Marker accounts, cohort assignments and live marking progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminMarkers,
});

type MarkerRow = {
  id: string;
  full_name: string;
  email: string | null;
  institution: "MII" | "MIU";
  is_active: boolean;
  cohort_ids: string[];
  cohort_names: string[];
  last_seen_at: string | null;
  activity: string | null;
};

type CohortRow = { id: string; name: string; institution: "MII" | "MIU" };

function AdminMarkers() {
  const qc = useQueryClient();
  const markersFn = useServerFn(listMarkers);
  const cohortsFn = useServerFn(listAllCohorts);
  const progressFn = useServerFn(markerProgress);

  const { data: markers, isLoading } = useQuery<MarkerRow[]>({
    queryKey: ["markers"],
    queryFn: () => markersFn() as unknown as Promise<MarkerRow[]>,
  });
  const { data: cohorts } = useQuery<CohortRow[]>({
    queryKey: ["all-cohorts"],
    queryFn: () => cohortsFn() as unknown as Promise<CohortRow[]>,
  });
  const { data: blocks } = useBlocks();

  const active = pickActive(blocks);
  const [blockId, setBlockId] = useState<string | null>(null);
  const block = blocks?.find((b) => b.id === (blockId ?? active?.id)) ?? null;
  const sessionDates = useMemo(() => (block ? blockDates(block) : []), [block]);
  const [date, setDate] = useState(skipSunday(todayKey()));
  const [slot, setSlot] = useState<SessionSlot>("morning");

  useEffect(() => {
    if (sessionDates.length === 0) return;
    if (!sessionDates.includes(date)) {
      setDate(sessionDates.find((d) => d >= date) ?? sessionDates[sessionDates.length - 1]!);
    }
  }, [sessionDates, date]);

  const { data: progress } = useQuery({
    queryKey: ["marker-progress", block?.id, date, slot],
    enabled: Boolean(block?.id),
    refetchInterval: 30_000,
    queryFn: () =>
      progressFn({ data: { block_id: block!.id, session_date: date, slot } }) as unknown as Promise<
        { marker_id: string; assigned: number; marked: number; remaining: number; last_marked_at: string | null }[]
      >,
  });

  const progressBy = useMemo(
    () => new Map((progress ?? []).map((p) => [p.marker_id, p])),
    [progress],
  );

  const [form, setForm] = useState<{
    id?: string;
    first_name: string;
    surname: string;
    email: string;
    password: string;
    institution: "MII" | "MIU";
    cohort_id: string;
  } | null>(null);

  const createFn = useServerFn(createMarker);
  const updateFn = useServerFn(updateMarker);
  const activeFn = useServerFn(setMarkerActive);
  const deleteFn = useServerFn(deleteMarker);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["markers"] });
    qc.invalidateQueries({ queryKey: ["marker-progress"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const f = form!;
      if (f.id) {
        return updateFn({
          data: {
            id: f.id,
            first_name: f.first_name,
            surname: f.surname,
            cohort_id: f.cohort_id,
            password: f.password,
          },
        });
      }
      return createFn({
        data: {
          first_name: f.first_name,
          surname: f.surname,
          email: f.email,
          password: f.password,
          institution: f.institution,
          cohort_id: f.cohort_id,
        },
      });
    },
    onSuccess: () => {
      refresh();
      setForm(null);
      toast.success("Marker saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => activeFn({ data: v }),
    onSuccess: () => {
      refresh();
      toast.success("Marker updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Marker removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formCohorts = (cohorts ?? []).filter(
    (c) => !form || c.institution === form.institution,
  );

  const totalAssigned = (progress ?? []).reduce((a, p) => a + p.assigned, 0);
  const totalMarked = (progress ?? []).reduce((a, p) => a + p.marked, 0);

  if (isLoading) return <Spinner label="Loading markers" />;

  return (
    <>
      <SectionTitle
        title="Markers"
        subtitle="Each marker signs in with only an email and password. Their institution and cohort are fixed by you and enforced on the server."
        action={
          <Button
            onClick={() =>
              setForm({
                first_name: "",
                surname: "",
                email: "",
                password: "",
                institution: "MII",
                cohort_id: "",
              })
            }
          >
            Add marker
          </Button>
        }
      />

      <Card className="mb-4">
        <SectionTitle
          title="Session being monitored"
          subtitle="Progress below is counted for this block, date and session."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Block">
            <Select value={block?.id ?? ""} onChange={(e) => setBlockId(e.target.value)}>
              {(blocks ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Session date">
            <Select value={date} onChange={(e) => setDate(e.target.value)}>
              {sessionDates.length === 0 ? <option value={date}>{formatDate(date)}</option> : null}
              {sessionDates.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Session">
            <Select value={slot} onChange={(e) => setSlot(e.target.value as SessionSlot)}>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Markers" value={markers?.length ?? 0} />
          <StatCard label="Students assigned" value={totalAssigned} tone="neutral" />
          <StatCard label="Marked" value={totalMarked} tone="green" />
          <StatCard label="Outstanding" value={Math.max(0, totalAssigned - totalMarked)} tone="red" />
        </div>
      </Card>

      <Card>
        {(markers ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No markers yet. Add one and give them their email and temporary password.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Marker</th>
                  <th className="pb-2">Institution</th>
                  <th className="pb-2">Cohort</th>
                  <th className="pb-2">Progress</th>
                  <th className="pb-2">Last activity</th>
                  <th className="pb-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody>
                {(markers ?? []).map((m) => {
                  const p = progressBy.get(m.id);
                  const pct = p && p.assigned > 0 ? Math.round((p.marked / p.assigned) * 100) : 0;
                  return (
                    <tr key={m.id} className="border-t border-border/60 align-top">
                      <td className="py-3">
                        <span className="block font-medium">{m.full_name}</span>
                        <span className="text-xs text-muted-foreground">{m.email ?? "—"}</span>
                        {!m.is_active ? (
                          <Badge tone="red" className="mt-1">
                            Inactive
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-3">
                        <Badge tone={m.institution === "MII" ? "green" : "gold"}>
                          {m.institution}
                        </Badge>
                      </td>
                      <td className="py-3">{m.cohort_names.join(", ") || "—"}</td>
                      <td className="py-3">
                        <span className="block text-xs text-muted-foreground">
                          {p ? `${p.marked}/${p.assigned} marked · ${p.remaining} remaining` : "—"}
                        </span>
                        <span className="mt-1 block h-2 w-40 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-primary to-success transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {m.last_seen_at
                          ? `${new Date(m.last_seen_at).toLocaleString()}${m.activity ? ` · ${m.activity}` : ""}`
                          : "Never signed in"}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const [first = "", ...rest] = m.full_name.split(" ");
                              setForm({
                                id: m.id,
                                first_name: first,
                                surname: rest.join(" "),
                                email: m.email ?? "",
                                password: "",
                                institution: m.institution,
                                cohort_id: m.cohort_ids[0] ?? "",
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggle.mutate({ id: m.id, is_active: !m.is_active })}
                          >
                            {m.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              if (confirm(`Remove ${m.full_name}?`)) remove.mutate(m.id);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit marker" : "Add marker"}
      >
        {form ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.cohort_id) {
                toast.error("Choose a cohort for this marker.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="FIRST NAME">
                <Input
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </Field>
              <Field label="SURNAME">
                <Input
                  required
                  value={form.surname}
                  onChange={(e) => setForm({ ...form, surname: e.target.value })}
                />
              </Field>
            </div>
            {form.id ? null : (
              <Field label="EMAIL">
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {form.id ? null : (
                <Field label="INSTITUTION">
                  <Select
                    value={form.institution}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        institution: e.target.value as "MII" | "MIU",
                        cohort_id: "",
                      })
                    }
                  >
                    <option value="MII">MII · Maharishi Invincibility Institute</option>
                    <option value="MIU">MIU · Maharishi Invincibility University</option>
                  </Select>
                </Field>
              )}
              <Field label="COHORT">
                <Select
                  required
                  value={form.cohort_id}
                  onChange={(e) => setForm({ ...form, cohort_id: e.target.value })}
                >
                  <option value="">Choose a cohort</option>
                  {formCohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={form.id ? "NEW PASSWORD (OPTIONAL)" : "TEMPORARY PASSWORD"}>
              <Input
                type="text"
                required={!form.id}
                minLength={form.id ? 0 : 8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              The marker can change this password themselves after signing in at the marker sign-in
              page.
            </p>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save marker"}
            </Button>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
