import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge, Button, Card, Field, SectionTitle, Select, Spinner, StatCard } from "@/components/ui-kit";
import { dateKey, formatDate, todayKey } from "@/lib/attendance";
import {
  previewWeeklyTargetNotices,
  sendWeeklyTargetNotices,
} from "@/lib/weekly-notices.functions";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  head: () => ({
    meta: [
      { title: "Weekly Target Emails · Administration" },
      {
        name: "description",
        content:
          "Review students who did not reach the weekly meditation target of 8 sessions (16 points) and email them a personal notice.",
      },
      { property: "og:title", content: "Weekly meditation target emails" },
      {
        property: "og:description",
        content: "Preview and send weekly target notices to students' login email addresses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminNotices,
});

/** Mondays of the last 8 weeks whose Saturday has already passed. */
function completedWeeks() {
  const today = new Date(todayKey() + "T00:00:00");
  const d = new Date(today);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // this week's Monday
  const out: string[] = [];
  for (let i = 0; i < 10 && out.length < 8; i++) {
    const sat = new Date(d);
    sat.setDate(sat.getDate() + 5);
    if (sat < today) out.push(dateKey(d));
    d.setDate(d.getDate() - 7);
  }
  return out;
}

function AdminNotices() {
  const weeks = useMemo(completedWeeks, []);
  const [week, setWeek] = useState(weeks[0] ?? "");
  const qc = useQueryClient();
  const previewFn = useServerFn(previewWeeklyTargetNotices);
  const sendFn = useServerFn(sendWeeklyTargetNotices);

  const { data, isLoading, error } = useQuery({
    queryKey: ["weekly-notices", week],
    queryFn: () => previewFn({ data: { week_start: week } }),
    enabled: !!week,
  });

  const flagged = data?.flagged ?? [];
  const ready = flagged.filter((f) => f.can_email && !f.already_sent);

  const send = useMutation({
    mutationFn: () => sendFn({ data: { week_start: week } }),
    onSuccess: (r) => {
      if (r.attempted === 0) toast.info("Everyone on this list has already been emailed.");
      else if (r.failed > 0)
        toast.error(
          `${r.sent} sent, ${r.failed} could not be sent. ${r.firstError ?? ""}`.trim(),
        );
      else toast.success(`${r.sent} email${r.sent === 1 ? "" : "s"} sent.`);
      qc.invalidateQueries({ queryKey: ["weekly-notices", week] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmSend = () => {
    if (ready.length === 0) return;
    if (
      window.confirm(
        `Send the weekly target notice to ${ready.length} student${ready.length === 1 ? "" : "s"} for ${data?.period}?`,
      )
    )
      send.mutate();
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Weekly target emails"
        subtitle="Students who earned fewer than 16 points (8 sessions) in a finished week. Each student gets one personal email at their login address."
        action={
          <Button onClick={confirmSend} disabled={ready.length === 0 || send.isPending}>
            {send.isPending ? "Sending…" : `Send to ${ready.length} student${ready.length === 1 ? "" : "s"}`}
          </Button>
        }
      />

      <Card className="grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-end">
        <Field label="Week">
          <Select value={week} onChange={(e) => setWeek(e.target.value)}>
            {weeks.map((w) => {
              const sat = new Date(w + "T00:00:00");
              sat.setDate(sat.getDate() + 5);
              return (
                <option key={w} value={w}>
                  {formatDate(w)} – {formatDate(dateKey(sat))}
                </option>
              );
            })}
          </Select>
        </Field>
        <p className="text-sm text-muted-foreground">
          Excused sessions lower the requirement, and only students who were marked that week are
          checked. A student is never emailed twice for the same week.
        </p>
      </Card>

      {isLoading ? (
        <Spinner label="Checking the week" />
      ) : error ? (
        <Card>
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Students checked" value={String(data?.checked ?? 0)} />
            <StatCard label="Below target" value={String(flagged.length)} />
            <StatCard label="Ready to email" value={String(ready.length)} />
            <StatCard label="Not marked this week" value={String(data?.notMarked ?? 0)} />
          </div>

          <Card className="overflow-x-auto p-0 sm:p-0">
            {flagged.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Every marked student reached the weekly target for this week.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-4">Student</th>
                    <th className="p-4">Cohort</th>
                    <th className="p-4">Sessions</th>
                    <th className="p-4">Points</th>
                    <th className="p-4">Login email</th>
                    <th className="p-4">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((f) => (
                    <tr key={f.student_id} className="border-b border-border/60 last:border-0">
                      <td className="p-4">
                        <div className="font-medium">{f.full_name}</div>
                        {f.student_number ? (
                          <div className="text-xs text-muted-foreground">{f.student_number}</div>
                        ) : null}
                      </td>
                      <td className="p-4">{f.cohort_name}</td>
                      <td className="p-4">
                        {f.sessions} / {f.required_sessions}
                      </td>
                      <td className="p-4 font-semibold">
                        {f.points.toFixed(1)} / {f.required_points.toFixed(1)}
                      </td>
                      <td className="p-4 text-muted-foreground">{f.email ?? "No login email"}</td>
                      <td className="p-4">
                        {f.already_sent ? (
                          <Badge tone="green">Sent</Badge>
                        ) : f.can_email ? (
                          <Badge tone="gold">Ready</Badge>
                        ) : (
                          <Badge tone="red">Can't email</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
