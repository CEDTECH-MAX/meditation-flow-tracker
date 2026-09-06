import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  Badge,
  Card,
  CircularProgress,
  SectionTitle,
  Select,
  Spinner,
  StatCard,
} from "@/components/ui-kit";
import { getMyClassAttendance } from "@/lib/class.functions";
import {
  formatDate,
  statusTone,
  summariseClass,
  type Block,
  type ClassRecord,
  type ClassSession,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({
    meta: [
      { title: "My Class Attendance · Attendance Portal" },
      {
        name: "description",
        content:
          "See your class attendance percentage for the block, whether you met the 80% requirement, the credits you owe and your lecturer's comments.",
      },
      { property: "og:title", content: "My Class Attendance" },
      {
        property: "og:description",
        content:
          "Class attendance scored out of every class in the block, with online or physical attendance and behaviour notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentClasses,
});

function StudentClasses() {
  const fn = useServerFn(getMyClassAttendance);
  const { data, isLoading } = useQuery({ queryKey: ["my-classes"], queryFn: () => fn() });
  const [blockId, setBlockId] = useState<string | null>(null);

  const blocks = (data?.blocks ?? []) as Block[];
  const allSessions = (data?.sessions ?? []) as ClassSession[];
  const records = (data?.records ?? []) as ClassRecord[];

  const activeBlock = blocks.find((b) => b.status === "active") ?? blocks[0] ?? null;
  const selected = blocks.find((b) => b.id === (blockId ?? activeBlock?.id)) ?? null;

  const sessions = useMemo(
    () => allSessions.filter((s) => s.block_id === selected?.id),
    [allSessions, selected?.id],
  );
  const sessionIds = useMemo(() => new Set(sessions.map((s) => s.id)), [sessions]);
  const blockRecords = useMemo(
    () => records.filter((r) => sessionIds.has(r.session_id)),
    [records, sessionIds],
  );

  const summary = useMemo(() => summariseClass(sessions, blockRecords), [sessions, blockRecords]);
  const tone = statusTone(summary.status);
  const recordFor = (id: string) => blockRecords.find((r) => r.session_id === id) ?? null;

  if (isLoading)
    return (
      <AppShell>
        <Spinner label="Loading your class attendance" />
      </AppShell>
    );

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="My class attendance"
          subtitle="Separate from your meditation attendance. Minimum 80% of the block's class points, maximum 100%."
        />

        {blocks.length > 1 ? (
          <Card>
            <Select value={selected?.id ?? ""} onChange={(e) => setBlockId(e.target.value)}>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {formatDate(b.start_date)} → {formatDate(b.end_date)}
                </option>
              ))}
            </Select>
          </Card>
        ) : null}

        {sessions.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              No classes have been recorded for this block yet.
            </p>
          </Card>
        ) : (
          <>
            <Card className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <CircularProgress value={Math.min(100, summary.percentage)} stroke={tone.stroke}>
                <span className="font-display text-2xl font-semibold">
                  {summary.percentage.toFixed(1)}%
                </span>
              </CircularProgress>
              <div className="flex-1 text-center sm:text-left">
                <Badge tone={summary.met ? "green" : "red"}>
                  {summary.met ? "Requirement met" : "Requirement NOT met"}
                </Badge>
                <p className="mt-3 text-sm text-muted-foreground">
                  You have {summary.pointsEarned.toFixed(1)} of {summary.pointsPossible.toFixed(1)}{" "}
                  class points for {selected?.name}.
                </p>
                {summary.met ? (
                  <p className="mt-1 text-sm text-success">
                    You are above the 80% class attendance requirement for this block.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-destructive">
                    You are {summary.percentageOwed.toFixed(1)}% short of the 80% requirement and owe{" "}
                    {summary.pointsOwed.toFixed(1)} attendance credits for this block.
                  </p>
                )}
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Classes marked" value={`${summary.marked}/${summary.sessions}`} />
              <StatCard label="Physical" value={summary.physical} />
              <StatCard label="Online" value={summary.online} />
              <StatCard
                label="Credits owed"
                value={summary.met ? "0.0" : summary.pointsOwed.toFixed(1)}
              />
            </div>

            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Points</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Lecturer comment</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const r = recordFor(s.id);
                    return (
                      <tr key={s.id} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-3">{formatDate(s.session_date)}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{s.title}</span>
                          {s.lecturer ? (
                            <span className="block text-xs text-muted-foreground">{s.lecturer}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {r ? `${Number(r.points).toFixed(1)} / ${Number(s.max_points).toFixed(1)}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {r ? (
                            <Badge tone={r.mode === "online" ? "gold" : "neutral"}>
                              {r.mode === "online" ? "Online" : "Physical"}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r?.comment || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
