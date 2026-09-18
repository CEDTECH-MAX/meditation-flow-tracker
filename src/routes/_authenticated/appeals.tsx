import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  Field,
  Modal,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui-kit";
import { StarRating } from "@/components/StarRating";
import { getMyAttendance } from "@/lib/data.functions";
import {
  listMyAppeals,
  listMySessionReviews,
  submitAppeal,
  submitSessionReview,
} from "@/lib/appeals.functions";
import { formatDate, type AttendanceRecord } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/appeals")({
  head: () => ({
    meta: [
      { title: "Appeals & Session Reviews · Maharishi Institute" },
      {
        name: "description",
        content:
          "Appeal an attendance mark for a meditation session and rate how each session went. Your reviews are shared with the institute anonymously.",
      },
      { property: "og:title", content: "Appeals & session reviews" },
      {
        property: "og:description",
        content: "Appeal an attendance mark and leave a star rating for each session you attended.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentAppeals,
});

const REASON_OPTIONS = [
  "Medical appointment",
  "Illness",
  "Family emergency",
  "Transport problem",
  "I was present but marked absent",
  "Approved leave",
  "Other",
];

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "gold" | "neutral" }> = {
  submitted: { label: "Submitted", tone: "gold" },
  reviewed: { label: "Reviewed", tone: "amber" },
  referred: { label: "Referred to admin", tone: "amber" },
  accepted: { label: "Accepted by marker", tone: "green" },
  rejected: { label: "Rejected by marker", tone: "red" },
  resolved: { label: "Closed", tone: "neutral" },
};

function StudentAppeals() {
  const qc = useQueryClient();
  const attendanceFn = useServerFn(getMyAttendance);
  const appealsFn = useServerFn(listMyAppeals);
  const reviewsFn = useServerFn(listMySessionReviews);

  const { data, isLoading } = useQuery({ queryKey: ["my-attendance"], queryFn: () => attendanceFn() });
  const { data: appeals } = useQuery({ queryKey: ["my-appeals"], queryFn: () => appealsFn() });
  const { data: reviews } = useQuery({ queryKey: ["my-reviews"], queryFn: () => reviewsFn() });

  const records = (data?.records ?? []) as unknown as AttendanceRecord[];

  const [appealFor, setAppealFor] = useState<AttendanceRecord | null>(null);
  const [reason, setReason] = useState(REASON_OPTIONS[0]!);
  const [comment, setComment] = useState("");

  const [reviewFor, setReviewFor] = useState<AttendanceRecord | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const sessions = useMemo(
    () =>
      [...records]
        .sort((a, b) =>
          a.session_date === b.session_date
            ? a.slot.localeCompare(b.slot)
            : b.session_date.localeCompare(a.session_date),
        )
        .slice(0, 40),
    [records],
  );

  const appealOf = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of (appeals ?? []) as any[]) map.set(`${a.session_date}:${a.slot}`, a);
    return map;
  }, [appeals]);

  const reviewOf = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of (reviews ?? []) as any[]) map.set(`${r.session_date}:${r.slot}`, r);
    return map;
  }, [reviews]);

  const appealFn = useServerFn(submitAppeal);
  const appeal = useMutation({
    mutationFn: (v: {
      block_id: string;
      session_date: string;
      slot: "morning" | "afternoon";
      reason: string;
      comment: string;
    }) => appealFn({ data: { ...v, register: "meditation" } }),
    onSuccess: () => {
      toast.success("Your appeal was sent to your marker.");
      setAppealFor(null);
      setComment("");
      qc.invalidateQueries({ queryKey: ["my-appeals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewSendFn = useServerFn(submitSessionReview);
  const review = useMutation({
    mutationFn: (v: {
      block_id: string;
      session_date: string;
      slot: "morning" | "afternoon";
      rating: number;
      comment: string;
    }) => reviewSendFn({ data: v }),
    onSuccess: () => {
      toast.success("Thank you for your feedback.");
      setReviewFor(null);
      setReviewComment("");
      setRating(5);
      qc.invalidateQueries({ queryKey: ["my-reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return (
      <AppShell>
        <Spinner label="Loading your sessions" />
      </AppShell>
    );

  return (
    <AppShell>
      <SectionTitle
        title="Appeals & session reviews"
        subtitle="Appeal a mark you believe is wrong, and tell us how each session went. Reviews are shared with the institute without your name."
      />

      <Card className="mb-4">
        <SectionTitle title="Your recent sessions" subtitle="The last 40 marked sessions." />
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sessions have been marked for you yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Session</th>
                  <th className="pb-2">Marked</th>
                  <th className="pb-2">Appeal</th>
                  <th className="pb-2">Your review</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((r) => {
                  const key = `${r.session_date}:${r.slot}`;
                  const a = appealOf.get(key);
                  const rev = reviewOf.get(key);
                  const attended = Number(r.points) > 0;
                  return (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="py-2">
                        <span className="block font-medium">{formatDate(r.session_date)}</span>
                        <span className="text-xs capitalize text-muted-foreground">{r.slot}</span>
                      </td>
                      <td className="py-2">
                        <Badge tone={attended ? "green" : "red"}>
                          {attended ? "Present" : "Absent"}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {a ? (
                          <Badge tone={STATUS_LABEL[a.status]?.tone ?? "neutral"}>
                            {STATUS_LABEL[a.status]?.label ?? a.status}
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setAppealFor(r);
                              setReason(REASON_OPTIONS[0]!);
                              setComment("");
                            }}
                          >
                            Appeal
                          </Button>
                        )}
                      </td>
                      <td className="py-2">
                        {!attended ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : rev ? (
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => {
                              setReviewFor(r);
                              setRating(rev.rating);
                              setReviewComment(rev.comment ?? "");
                            }}
                          >
                            <StarRating value={rev.rating} readOnly />
                          </button>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setReviewFor(r);
                              setRating(5);
                              setReviewComment("");
                            }}
                          >
                            Review session
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="My appeals" subtitle="What your marker and the administrator said." />
        {(appeals ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not submitted any appeals.</p>
        ) : (
          <ul className="grid gap-3">
            {((appeals ?? []) as any[]).map((a) => (
              <li key={a.id} className="glass-muted rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">
                    {formatDate(a.session_date)} · <span className="capitalize">{a.slot}</span>
                  </strong>
                  <Badge tone={STATUS_LABEL[a.status]?.tone ?? "neutral"}>
                    {STATUS_LABEL[a.status]?.label ?? a.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Reason:</span> {a.reason}
                </p>
                {a.comment ? <p className="mt-1 text-sm text-muted-foreground">{a.comment}</p> : null}
                {a.marker_response ? (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Marker:</span> {a.marker_response}
                  </p>
                ) : null}
                {a.admin_response ? (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Administrator:</span> {a.admin_response}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(appealFor)}
        onClose={() => setAppealFor(null)}
        title={appealFor ? `Appeal · ${formatDate(appealFor.session_date)} ${appealFor.slot}` : "Appeal"}
      >
        {appealFor ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              appeal.mutate({
                block_id: appealFor.block_id,
                session_date: appealFor.session_date,
                slot: appealFor.slot,
                reason,
                comment,
              });
            }}
          >
            <Field label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASON_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Explanation">
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell your marker what happened"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Your marker will review this appeal. An approved appeal does not change your
              attendance by itself — the administrator makes any correction.
            </p>
            <Button type="submit" disabled={appeal.isPending}>
              Send appeal
            </Button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(reviewFor)}
        onClose={() => setReviewFor(null)}
        title={reviewFor ? `How was ${formatDate(reviewFor.session_date)} ${reviewFor.slot}?` : "Review"}
      >
        {reviewFor ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              review.mutate({
                block_id: reviewFor.block_id,
                session_date: reviewFor.session_date,
                slot: reviewFor.slot,
                rating,
                comment: reviewComment,
              });
            }}
          >
            <Field label="Your rating">
              <StarRating value={rating} onChange={setRating} />
            </Field>
            <Field label="Comments (optional)">
              <textarea
                className="min-h-[100px] w-full rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="What worked well? What could be better?"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Your name is never shown with this feedback.
            </p>
            <Button type="submit" disabled={review.isPending}>
              Submit review
            </Button>
          </form>
        ) : null}
      </Modal>

    </AppShell>
  );
}
