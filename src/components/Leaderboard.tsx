import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboard, type LeaderboardResult } from "@/lib/leaderboard.functions";
import { Badge, Card, SectionTitle } from "@/components/ui-kit";
import {
  classificationLabel,
  genderLabel,
  percentageTone,
  type Classification,
  type Gender,
} from "@/lib/attendance";

const medal = ["🥇", "🥈", "🥉"];

export function Leaderboard() {
  const fn = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fn() as Promise<LeaderboardResult>,
  });

  const groupLabel = data
    ? [
        data.group.cohort,
        genderLabel(data.group.gender as Gender),
        classificationLabel(data.group.classification as Classification),
      ]
        .filter((v) => v && v !== "—")
        .join(" · ")
    : "";

  return (
    <Card>
      <SectionTitle
        title="Leaderboard · Top 5"
        subtitle={
          groupLabel
            ? `Your group: ${groupLabel}${data?.group.block ? ` · ${data.group.block}` : ""}`
            : "Ranked within your own cohort, gender and classification"
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rankings…</p>
      ) : !data?.available ? (
        <p className="text-sm text-muted-foreground">
          {data?.reason ?? "Leaderboard not available yet."}
        </p>
      ) : (
        <>
          <ol className="space-y-2">
            {data.top.map((e) => (
              <li
                key={e.student_id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                  e.isMe ? "bg-primary-soft ring-1 ring-primary/30" : "glass-muted"
                }`}
              >
                <span className="w-7 text-center text-sm font-semibold">
                  {medal[e.rank - 1] ?? e.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {e.full_name}
                  {e.isMe ? (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  ) : null}
                </span>
                <Badge tone={percentageTone(e.percentage)}>
                  {e.present} pts · {e.percentage}%
                </Badge>
              </li>
            ))}
          </ol>

          {data.me && data.me.rank > 5 ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-primary-soft px-3 py-2.5 ring-1 ring-primary/30">
              <span className="w-7 text-center text-sm font-semibold">{data.me.rank}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {data.me.full_name}{" "}
                <span className="ml-1 text-xs text-muted-foreground">(you)</span>
              </span>
              <Badge tone={percentageTone(data.me.percentage)}>
                {data.me.present} pts · {data.me.percentage}%
              </Badge>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            {data.group.peers} students in your group. One point per session attended.
          </p>
        </>
      )}
    </Card>
  );
}
