import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx } from "./data.helpers";

export type LeaderboardEntry = {
  rank: number;
  student_id: string;
  full_name: string;
  present: number;
  percentage: number;
  isMe: boolean;
};

export type LeaderboardResult = {
  available: boolean;
  reason?: string;
  group: {
    cohort: string | null;
    classification: string | null;
    gender: string | null;
    block: string | null;
    peers: number;
  };
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
};

/**
 * Top 5 of the signed-in student's own peer group: same cohort, same
 * classification and same gender. Only names and points are exposed.
 */
export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaderboardResult> => {
    const c = context as unknown as Ctx;
    const empty = {
      available: false,
      group: { cohort: null, classification: null, gender: null, block: null, peers: 0 },
      top: [],
      me: null,
    } satisfies LeaderboardResult;

    // Every read below is required for a correct ranking: a swallowed error
    // would show the student a leaderboard that quietly omits their peers.
    const { data: profile, error: profileError } = await c.supabase
      .from("profiles")
      .select("id, cohort_id, classification, gender, cohort:cohorts(name)")
      .eq("id", c.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    if (!profile?.cohort_id || !profile.classification || !profile.gender) {
      return {
        ...empty,
        reason: "Your cohort, classification or gender is not set yet — ask an administrator.",
      };
    }

    const { data: block, error: blockError } = await c.supabase
      .from("blocks")
      .select("id, name, meditation_days")
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (blockError) throw new Error(blockError.message);

    const group = {
      cohort: (profile as any).cohort?.name ?? null,
      classification: profile.classification as string,
      gender: profile.gender as string,
      block: block?.name ?? null,
      peers: 0,
    };

    if (!block) return { ...empty, group, reason: "There is no active block right now." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: peers, error: peersError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("cohort_id", profile.cohort_id)
      .eq("classification", profile.classification)
      .eq("gender", profile.gender);
    if (peersError) throw new Error(peersError.message);

    const peerList = peers ?? [];
    group.peers = peerList.length;
    if (peerList.length === 0) return { ...empty, group, reason: "No peers in your group yet." };

    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("attendance")
      .select("student_id, status")
      .eq("block_id", block.id)
      .in(
        "student_id",
        peerList.map((p) => p.id),
      );
    if (rowsError) throw new Error(rowsError.message);

    const totals = new Map<string, { present: number; counted: number }>();
    for (const p of peerList) totals.set(p.id, { present: 0, counted: (block.meditation_days ?? 0) * 2 });
    for (const r of rows ?? []) {
      const t = totals.get(r.student_id as string);
      if (!t) continue;
      if (r.status === "present") t.present += 1;
      if (r.status === "excused") t.counted -= 1;
    }

    const ranked = peerList
      .map((p) => {
        const t = totals.get(p.id)!;
        return {
          student_id: p.id,
          full_name: p.full_name as string,
          present: t.present,
          percentage:
            t.counted > 0 ? Math.round((t.present / t.counted) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.present - a.present || b.percentage - a.percentage || a.full_name.localeCompare(b.full_name))
      .map((e, i) => ({ ...e, rank: i + 1, isMe: e.student_id === c.userId }));

    return {
      available: true,
      group,
      top: ranked.slice(0, 5),
      me: ranked.find((e) => e.isMe) ?? null,
    };
  });
