import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { decideAppeal, listAppeals } from "@/lib/appeals.functions";
import { formatDate } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/appeals")({
  head: () => ({
    meta: [
      { title: "Attendance Appeals · Administration" },
      {
        name: "description",
        content:
          "Oversee every student attendance appeal: the student, cohort, session, the marker who handled it and the administrator's decision.",
      },
      { property: "og:title", content: "Attendance appeals oversight" },
      {
        property: "og:description",
        content:
          "Review marker responses to attendance appeals and authorise corrections through the audited register.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAppeals,
});

const TONE: Record<string, "green" | "amber" | "red" | "gold" | "neutral"> = {
  submitted: "gold",
  reviewed: "amber",
  referred: "amber",
  accepted: "green",
  rejected: "red",
  resolved: "neutral",
};

function AdminAppeals() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAppeals);
  const { data, isLoading } = useQuery({ queryKey: ["admin-appeals"], queryFn: () => listFn() });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<any | null>(null);
  const [decision, setDecision] = useState<"approved" | "declined" | "pending">("approved");
  const [response, setResponse] = useState("");
  const [close, setClose] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((data ?? []) as any[])
      .filter((a) => status === "all" || a.status === status)
      .filter(
        (a) =>
          !q ||
          a.student_name.toLowerCase().includes(q) ||
          (a.cohort_name ?? "").toLowerCase().includes(q) ||
          (a.marker_name ?? "").toLowerCase().includes(q),
      );
  }, [data, search, status]);

  const decideFn = useServerFn(decideAppeal);
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: string; response: string; close: boolean }) =>
      decideFn({ data: v as any }),
    onSuccess: () => {
      toast.success("Decision recorded. Attendance was not changed.");
      setOpen(null);
      setResponse("");
      qc.invalidateQueries({ queryKey: ["admin-appeals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Spinner label="Loading appeals" />;

  const all = (data ?? []) as any[];
  const awaiting = all.filter((a) => a.status === "submitted" || a.status === "referred").length;

  return (
    <>
      <SectionTitle
        title="Appeals"
        subtitle="Every appeal, the marker who handled it and your decision. Approving an appeal never changes attendance on its own — make the correction in the register."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total appeals" value={all.length} />
        <StatCard label="Awaiting you" value={awaiting} tone="gold" />
        <StatCard
          label="Approved"
          value={all.filter((a) => a.admin_decision === "approved").length}
          tone="green"
        />
        <StatCard
          label="Declined"
          value={all.filter((a) => a.admin_decision === "declined").length}
          tone="red"
        />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Search">
            <Input
              placeholder="Student, cohort or marker"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="referred">Referred to admin</option>
              <option value="accepted">Accepted by marker</option>
              <option value="rejected">Rejected by marker</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Closed</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appeals match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Cohort</th>
                  <th className="pb-2">Session</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2">Marker</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-border/60 align-top">
                    <td className="py-2">
                      <span className="block font-medium">{a.student_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.student_number ?? "—"}
                      </span>
                    </td>
                    <td className="py-2">{a.cohort_name ?? "—"}</td>
                    <td className="py-2">
                      <span className="block">{formatDate(a.session_date)}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {a.slot} · {a.block_name ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 max-w-[220px]">
                      <span className="block">{a.reason}</span>
                      {a.comment ? (
                        <span className="text-xs text-muted-foreground">{a.comment}</span>
                      ) : null}
                    </td>
                    <td className="py-2 max-w-[220px]">
                      <span className="block">{a.marker_name ?? "Not assigned"}</span>
                      {a.marker_response ? (
                        <span className="text-xs text-muted-foreground">“{a.marker_response}”</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <Badge tone={TONE[a.status] ?? "neutral"}>{a.status}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      {a.admin_response ? (
                        <span className="block text-xs text-muted-foreground">
                          {a.admin_decision} · “{a.admin_response}”
                        </span>
                      ) : null}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setOpen(a);
                          setDecision((a.admin_decision as any) ?? "approved");
                          setResponse(a.admin_response ?? "");
                          setClose(a.status === "resolved");
                        }}
                      >
                        {a.admin_response ? "Update" : "Decide"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? `Appeal · ${open.student_name}` : "Appeal"}
      >
        {open ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (response.trim().length < 3) {
                toast.error("Please write a short response (at least 3 characters).");
                return;
              }
              decide.mutate({ id: open.id, decision, response: response.trim(), close });
            }}
          >
            <p className="text-sm text-muted-foreground">
              {formatDate(open.session_date)} · {open.slot} · {open.reason}
              {open.marker_response ? ` · Marker: “${open.marker_response}”` : ""}
            </p>
            <Field label="Decision">
              <Select value={decision} onChange={(e) => setDecision(e.target.value as any)}>
                <option value="approved">Approve — correction authorised</option>
                <option value="declined">Decline</option>
                <option value="pending">Still investigating</option>
              </Select>
            </Field>
            <Field label="Your response (required)">
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Approved. Attendance correction authorized."
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={close}
                onChange={(e) => setClose(e.target.checked)}
              />
              Close this appeal
            </label>
            <p className="text-xs text-muted-foreground">
              This records your decision only. To change the mark, edit it in the meditation
              register so the correction is audited.
            </p>
            <Button type="submit" disabled={decide.isPending}>
              Save decision
            </Button>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
