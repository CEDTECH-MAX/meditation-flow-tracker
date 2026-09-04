import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx } from "./data.helpers";
import { summarise } from "./attendance";

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

    const { data: profile } = await c.supabase
      .from("profiles")
      .select("id, cohort_id, classification, gender, cohort:cohorts(name)")
      .eq("id", c.userId)
      .maybeSingle();

    if (!profile?.cohort_id || !profile.classification || !profile.gender) {
      return {
        ...empty,
        reason: "Your cohort, classification or gender is not set yet — ask an administrator.",
      };
    }

    const { data: block } = await c.supabase
      .from("blocks")
      .select("id, name, meditation_days")
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const group = {
      cohort: (profile as any).cohort?.name ?? null,
      classification: profile.classification as string,
      gender: profile.gender as string,
      block: block?.name ?? null,
      peers: 0,
    };

    if (!block) return { ...empty, group, reason: "There is no active block right now." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: peers } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("cohort_id", profile.cohort_id)
      .eq("classification", profile.classification)
      .eq("gender", profile.gender);

    const peerList = peers ?? [];
    group.peers = peerList.length;
    if (peerList.length === 0) return { ...empty, group, reason: "No peers in your group yet." };

    const { data: rows } = await supabaseAdmin
      .from("attendance")
      .select("student_id, status, slot, points, session_date")
      .eq("block_id", block.id)
      .in(
        "student_id",
        peerList.map((p) => p.id),
      );

    const byStudent = new Map<string, any[]>();
    for (const p of peerList) byStudent.set(p.id, []);
    for (const r of rows ?? []) {
      byStudent.get(r.student_id as string)?.push(r);
    }

    const ranked = peerList
      .map((p) => {
        const s = summarise(block, byStudent.get(p.id) ?? []);
        return {
          student_id: p.id,
          full_name: p.full_name as string,
          present: s.pointsEarned,
          percentage: s.percentage,
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
