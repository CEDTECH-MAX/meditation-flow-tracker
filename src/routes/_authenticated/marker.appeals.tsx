import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Modal, SectionTitle, Select, Spinner } from "@/components/ui-kit";
import { listMarkerAppeals, respondToAppeal } from "@/lib/appeals.functions";
import { formatDate } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/marker/appeals")({
  head: () => ({
    meta: [
      { title: "Attendance Appeals · Marking" },
      {
        name: "description",
        content:
          "Review the attendance appeals submitted by the students of your own assigned cohort and record your response.",
      },
      { property: "og:title", content: "Attendance appeals for your cohort" },
      {
        property: "og:description",
        content: "Accept, reject or refer a student attendance appeal to the administrator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarkerAppeals,
});

const TONE: Record<string, "green" | "amber" | "red" | "gold" | "neutral"> = {
  submitted: "gold",
  reviewed: "amber",
  referred: "amber",
  accepted: "green",
  rejected: "red",
  resolved: "neutral",
};

function MarkerAppeals() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMarkerAppeals);
  const { data, isLoading } = useQuery({ queryKey: ["marker-appeals"], queryFn: () => listFn() });

  const [open, setOpen] = useState<any | null>(null);
  const [decision, setDecision] = useState<"accepted" | "rejected" | "referred">("referred");
  const [response, setResponse] = useState("");

  const respondFn = useServerFn(respondToAppeal);
  const respond = useMutation({
    mutationFn: (v: { id: string; decision: string; response: string }) =>
      respondFn({ data: v as any }),
    onSuccess: () => {
      toast.success("Your response was recorded.");
      setOpen(null);
      setResponse("");
      qc.invalidateQueries({ queryKey: ["marker-appeals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Spinner label="Loading appeals" />;

  const rows = (data ?? []) as any[];

  return (
    <>
      <SectionTitle
        title="Appeals"
        subtitle="Students of your cohort can appeal a mark. Your response is visible to the student and the administrator."
      />
      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appeals have been submitted yet.</p>
        ) : (
          <ul className="grid gap-3">
            {rows.map((a) => (
              <li key={a.id} className="glass-muted rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm">{a.student_name}</strong>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.student_number ?? "—"}
                    </span>
                  </div>
                  <Badge tone={TONE[a.status] ?? "neutral"}>{a.status}</Badge>
                </div>
                <p className="mt-2 text-sm">
                  Session: {formatDate(a.session_date)} · <span className="capitalize">{a.slot}</span>
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Reason:</span> {a.reason}
                </p>
                {a.comment ? (
                  <p className="mt-1 text-sm text-muted-foreground">{a.comment}</p>
                ) : null}
                {a.marker_response ? (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Your response:</span>{" "}
                    {a.marker_response}
                  </p>
                ) : null}
                {a.admin_response ? (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Administrator:</span> {a.admin_response}
                  </p>
                ) : null}
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setOpen(a);
                      setDecision((a.marker_decision as any) ?? "referred");
                      setResponse(a.marker_response ?? "");
                    }}
                  >
                    {a.marker_response ? "Update response" : "Review appeal"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
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
              respond.mutate({ id: open.id, decision, response });
            }}
          >
            <p className="text-sm text-muted-foreground">
              {formatDate(open.session_date)} · {open.slot} · {open.reason}
            </p>
            <Field label="Decision">
              <Select value={decision} onChange={(e) => setDecision(e.target.value as any)}>
                <option value="accepted">Accept the appeal</option>
                <option value="rejected">Reject the appeal</option>
                <option value="referred">Refer to the administrator</option>
              </Select>
            </Field>
            <Field label="Your response">
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Reviewed and referred to admin."
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Recording a response never changes the attendance mark. Only an administrator can
              correct the register.
            </p>
            <Button type="submit" disabled={respond.isPending}>
              Save response
            </Button>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
