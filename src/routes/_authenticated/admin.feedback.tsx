import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Card, Field, SectionTitle, Select, Spinner, StatCard } from "@/components/ui-kit";
import { StarRating } from "@/components/StarRating";
import { getSessionFeedback } from "@/lib/appeals.functions";
import { formatDate } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  head: () => ({
    meta: [
      { title: "Session Feedback · Administration" },
      {
        name: "description",
        content:
          "Anonymous post-session student feedback: average star rating, number of responses, comments and rating trends per cohort and session.",
      },
      { property: "og:title", content: "Anonymous session feedback" },
      {
        property: "og:description",
        content: "Average ratings, response counts and comments for every meditation session.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFeedback,
});

type Row = {
  block_id: string;
  cohort_id: string | null;
  cohort_name: string;
  block_name: string;
  session_date: string;
  slot: "morning" | "afternoon";
  responses: number;
  average: number;
};

type CommentRow = {
  cohort_name: string;
  session_date: string;
  slot: "morning" | "afternoon";
  rating: number;
  comment: string | null;
  created_at: string;
};

function AdminFeedback() {
  const fn = useServerFn(getSessionFeedback);
  const { data, isLoading } = useQuery({ queryKey: ["session-feedback"], queryFn: () => fn() });
  const [cohort, setCohort] = useState("all");

  const sessions = ((data?.sessions ?? []) as unknown as Row[]).map((s) => ({
    ...s,
    responses: Number(s.responses),
    average: Number(s.average),
  }));
  const comments = (data?.comments ?? []) as unknown as CommentRow[];

  const cohortNames = useMemo(
    () => [...new Set(sessions.map((s) => s.cohort_name))].sort(),
    [sessions],
  );
  const filtered = sessions.filter((s) => cohort === "all" || s.cohort_name === cohort);
  const filteredComments = comments.filter((cm) => cohort === "all" || cm.cohort_name === cohort);

  const totalResponses = filtered.reduce((sum, s) => sum + s.responses, 0);
  const overall =
    totalResponses > 0
      ? filtered.reduce((sum, s) => sum + s.average * s.responses, 0) / totalResponses
      : 0;

  const trend = useMemo(
    () => [...filtered].sort((a, b) => a.session_date.localeCompare(b.session_date)).slice(-12),
    [filtered],
  );

  if (isLoading) return <Spinner label="Loading feedback" />;

  return (
    <>
      <SectionTitle
        title="Session feedback"
        subtitle="Anonymous student reviews. Names are never sent to this page — only ratings, comments and counts."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Sessions reviewed" value={filtered.length} />
        <StatCard label="Responses" value={totalResponses} tone="green" />
        <StatCard label="Average rating" value={overall ? overall.toFixed(1) : "—"} tone="gold" />
        <StatCard label="Comments" value={filteredComments.filter((c) => c.comment).length} />
      </div>

      <Card className="mb-4">
        <Field label="Cohort">
          <Select value={cohort} onChange={(e) => setCohort(e.target.value)}>
            <option value="all">All cohorts</option>
            {cohortNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="mb-4">
        <SectionTitle title="Per session" subtitle="Average rating and how many students responded." />
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback has been submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Session</th>
                  <th className="pb-2">Cohort</th>
                  <th className="pb-2">Block</th>
                  <th className="pb-2">Rating</th>
                  <th className="pb-2 text-right">Responses</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={`${s.block_id}:${s.session_date}:${s.slot}`} className="border-t border-border/60">
                    <td className="py-2">
                      <span className="block font-medium">{formatDate(s.session_date)}</span>
                      <span className="text-xs capitalize text-muted-foreground">{s.slot}</span>
                    </td>
                    <td className="py-2">{s.cohort_name}</td>
                    <td className="py-2">{s.block_name}</td>
                    <td className="py-2">
                      <StarRating value={s.average} readOnly size={16} />
                    </td>
                    <td className="py-2 text-right">
                      <Badge tone={s.average >= 4 ? "green" : s.average >= 3 ? "amber" : "red"}>
                        {s.responses}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <SectionTitle title="Trend" subtitle="Average rating over the last sessions." />
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough feedback yet.</p>
        ) : (
          <div className="flex items-end gap-3 overflow-x-auto pt-2">
            {trend.map((s) => (
              <div
                key={`t-${s.block_id}:${s.session_date}:${s.slot}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1"
              >
                <span className="text-xs font-semibold">{s.average.toFixed(1)}</span>
                <div
                  className="w-8 rounded-t-xl bg-primary/70"
                  style={{ height: `${Math.max(6, (s.average / 5) * 110)}px` }}
                />
                <span className="text-center text-[10px] text-muted-foreground">
                  {formatDate(s.session_date)}
                  <br />
                  {s.slot === "morning" ? "AM" : "PM"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Comments" subtitle="Anonymous comments from students." />
        {filteredComments.filter((c) => c.comment).length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="grid gap-3">
            {filteredComments
              .filter((c) => c.comment)
              .map((c, i) => (
                <li key={`${c.session_date}-${c.slot}-${i}`} className="glass-muted rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {c.cohort_name} · {formatDate(c.session_date)} ·{" "}
                      <span className="capitalize">{c.slot}</span>
                    </span>
                    <StarRating value={c.rating} readOnly size={14} />
                  </div>
                  <p className="mt-2 text-sm">“{c.comment}”</p>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </>
  );
}
