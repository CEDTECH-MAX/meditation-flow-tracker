import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAttendance } from "@/lib/data.functions";
import { AppShell } from "@/components/AppShell";
import {
  Badge,
  Card,
  CircularProgress,
  Select,
  SectionTitle,
  Spinner,
  StatCard,
} from "@/components/ui-kit";
import {
  type AttendanceRecord,
  type Block,
  blockProgress,
  buildCalendar,
  formatDate,
  reasonLabel,
  statusTone,
  summarise,
} from "@/lib/attendance";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My Attendance · Maharishi Institute Meditation" },
      {
        name: "description",
        content:
          "View your meditation attendance percentage, sessions attended and how much more you need to reach the 80% block requirement.",
      },
      { property: "og:title", content: "My Meditation Attendance" },
      {
        property: "og:description",
        content: "Your personal meditation attendance progress for the current academic block.",
      },
    ],
  }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const fn = useServerFn(getMyAttendance);
  const { data, isLoading } = useQuery({ queryKey: ["my-attendance"], queryFn: () => fn() });
  const [blockId, setBlockId] = useState<string | null>(null);

  const blocks = (data?.blocks ?? []) as Block[];
  const records = (data?.records ?? []) as AttendanceRecord[];
  const activeBlock = blocks.find((b) => b.status === "active") ?? blocks[0] ?? null;
  const selected = blocks.find((b) => b.id === (blockId ?? activeBlock?.id)) ?? null;

  const blockRecords = useMemo(
    () => records.filter((r) => r.block_id === selected?.id),
    [records, selected?.id],
  );
  const summary = useMemo(() => summarise(selected, blockRecords), [selected, blockRecords]);
  const calendar = useMemo(() => buildCalendar(selected, blockRecords), [selected, blockRecords]);
  const profile = data?.profile as
    | {
        full_name?: string;
        student_number?: string | null;
        photo_url?: string | null;
        programme?: string | null;
        intake_year?: number | null;
        internal_email?: string | null;
        cohort?: { name: string; programme: string | null } | null;
      }
    | null
    | undefined;
  const tone = statusTone(summary.status);

  const notifications = useMemo(() => {
    if (!selected) return [];
    const items: { tone: "green" | "amber" | "red" | "gold"; text: string }[] = [];
    if (summary.met)
      items.push({
        tone: "green",
        text: "Congratulations! You have reached the required 80% for this block.",
      });
    else
      items.push({
        tone: summary.status === "warning" ? "amber" : "red",
        text: `You need ${summary.percentageNeeded}% more attendance (${summary.sessionsNeeded} session${summary.sessionsNeeded === 1 ? "" : "s"}) to reach the required minimum.`,
      });
    if (selected.status === "active" && blockRecords.length === 0)
      items.push({ tone: "gold", text: `A new meditation block has begun: ${selected.name}.` });
    if (selected.status === "closed")
      items.push({
        tone: "gold",
        text: `${selected.name} is closed. Attendance for this block is now final.`,
      });
    if (!summary.met && summary.maxPossible < 80)
      items.push({
        tone: "red",
        text: `With ${summary.remainingSessions} session${summary.remainingSessions === 1 ? "" : "s"} left, your maximum possible score for this block is ${summary.maxPossible}%.`,
      });
    return items;
  }, [selected, summary, blockRecords.length]);

  if (isLoading)
    return (
      <AppShell>
        <Spinner label="Loading your attendance" />
      </AppShell>
    );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {data?.profile?.photo_url ? (
            <img
              src={data.profile.photo_url}
              alt={data.profile.full_name}
              className="h-14 w-14 rounded-2xl object-cover shadow-soft"
            />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft font-display text-lg font-semibold text-secondary-foreground">
              {(data?.profile?.full_name ?? "S").slice(0, 1)}
            </span>
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold">
              {data?.profile?.full_name ?? "Student"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Student number: {profile?.student_number ?? "—"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="green">{profile?.cohort?.name ?? "No cohort"}</Badge>
              {profile?.programme || profile?.cohort?.programme ? (
                <Badge tone="gold">{profile.programme ?? profile.cohort?.programme}</Badge>
              ) : null}
              {profile?.intake_year ? <Badge>Intake {profile.intake_year}</Badge> : null}
              {profile?.internal_email ? (
                <span className="text-xs text-muted-foreground">{profile.internal_email}</span>
              ) : null}
            </div>
          </div>
        </div>
        {blocks.length > 0 ? (
          <div className="w-full sm:w-64">
            <Select
              value={selected?.id ?? ""}
              onChange={(e) => setBlockId(e.target.value)}
              aria-label="Select block"
            >
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.status}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      {!selected ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No meditation block has been created yet. Your attendance will appear here once the
            administrator opens a block.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1.4fr]">
            <Card className="animate-rise flex flex-col items-center text-center">
              <CircularProgress value={summary.percentage} color={tone.stroke} caption="attendance" />
              <div className="mt-4">
                <Badge
                  tone={
                    summary.status === "met" ? "green" : summary.status === "warning" ? "amber" : "red"
                  }
                >
                  {summary.statusLabel}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {summary.met
                  ? "Requirement met — keep it up."
                  : `${summary.percentageNeeded}% more needed to reach 80%.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Each session is worth {summary.sessionWeight}% of this block.
              </p>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Morning attended" value={summary.morningPresent} tone="green" />
              <StatCard label="Afternoon attended" value={summary.afternoonPresent} tone="green" />
              <StatCard label="Sessions missed" value={summary.absent} tone="red" />
              <StatCard label="Sessions remaining" value={summary.remainingSessions} tone="gold" />
              <StatCard label="Excused" value={summary.excused} hint="Excluded from %" tone="neutral" />
              <StatCard
                label="Max possible"
                value={`${summary.maxPossible}%`}
                tone={summary.maxPossible >= 80 ? "green" : "red"}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_minmax(0,1fr)]">
            <Card>
              <SectionTitle title="Notifications" subtitle="Updates about your attendance" />
              <ul className="space-y-2">
                {notifications.map((n, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-2xl bg-muted/50 px-3 py-3 text-sm"
                  >
                    <Badge tone={n.tone}>•</Badge>
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionTitle title="Current block" />
              <dl className="space-y-2 text-sm">
                <Row label="Block" value={selected.name} />
                <Row label="Dates" value={`${formatDate(selected.start_date)} → ${formatDate(selected.end_date)}`} />
                <Row label="Weeks" value={String(selected.weeks)} />
                <Row label="Meditation days" value={String(selected.meditation_days)} />
                <Row label="Total sessions" value={String(summary.totalSessions)} />
                <Row label="Status" value={selected.status} />
              </dl>
              <div className="mt-4">
                <p className="mb-1 text-xs text-muted-foreground">
                  Block progress · {blockProgress(selected)}%
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all"
                    style={{ width: `${blockProgress(selected)}%` }}
                  />
                </div>
              </div>
            </Card>
          </div>

          <Card className="mt-6">
            <SectionTitle
              title="Attendance calendar"
              subtitle="Morning and afternoon sessions for every day of the block"
            />
            <AttendanceCalendar cells={calendar} />
          </Card>

          <div className="mt-6">
            <Leaderboard />
          </div>



          <Card className="mt-6">
            <SectionTitle title="Attendance history" subtitle="Read-only record of your sessions" />
            {blockRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions recorded yet for this block.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Session</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Reason</th>
                      <th className="pb-2 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockRecords.map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="py-2">{formatDate(r.session_date)}</td>
                        <td className="py-2 capitalize">{r.slot}</td>
                        <td className="py-2">
                          <Badge
                            tone={
                              r.status === "present" ? "green" : r.status === "excused" ? "gold" : "red"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {r.status === "present" ? "—" : reasonLabel(r.absence_reason)}
                          {r.absence_note ? (
                            <span className="block text-xs">{r.absence_note}</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right">
                          {r.status === "present"
                            ? `+${summary.sessionWeight}%`
                            : r.status === "excused"
                              ? "excluded"
                              : "0%"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}
