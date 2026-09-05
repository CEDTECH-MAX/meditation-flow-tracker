import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { summarise, type Block } from "./attendance";
import type { Ctx } from "./data.helpers";

export type AdvisorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/** Full, permanent chat history for the signed-in student. */
export const listAdvisorMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { data, error } = await c.supabase
      .from("advisor_messages")
      .select("id, role, content, created_at")
      .eq("user_id", c.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdvisorMessage[];
  });

async function studentContext(c: Ctx) {
  const [{ data: profile }, { data: blocks }] = await Promise.all([
    c.supabase
      .from("profiles")
      .select("full_name, student_number, programme, classification, gender, cohort:cohorts(name)")
      .eq("id", c.userId)
      .maybeSingle(),
    c.supabase.from("blocks").select("*").order("start_date", { ascending: false }),
  ]);

  const list = (blocks ?? []) as Block[];
  const block = list.find((b) => b.status === "active") ?? list[0] ?? null;

  let records: { slot: "morning" | "afternoon"; status: any; points: number; session_date: string }[] = [];
  if (block) {
    const { data } = await c.supabase
      .from("attendance")
      .select("slot, status, points, session_date")
      .eq("student_id", c.userId)
      .eq("block_id", block.id);
    records = (data ?? []) as typeof records;
  }

  const s = summarise(block, records);
  const today = todayKey();

  return `Student: ${profile?.full_name ?? "Unknown"} (${profile?.student_number ?? "no number"})
Cohort: ${(profile as any)?.cohort?.name ?? "unassigned"} · Classification: ${profile?.classification ?? "unknown"} · Gender: ${profile?.gender ?? "unknown"}
Today: ${today}
Block: ${block?.name ?? "none"} (${block?.start_date ?? "?"} to ${block?.end_date ?? "?"}, ${block?.meditation_days ?? 0} meditation days, status ${block?.status ?? "n/a"})
Points earned: ${s.pointsEarned} of a possible ${s.pointsPossible} (each session is worth up to 2.0; a full day is 4.0)
Compulsory sessions: Monday-Friday mornings and Monday-Thursday afternoons. Friday afternoon and Saturday sessions are optional and earn bonus points, so attending every day except Sunday can take the total above 100%.
Optional bonus points earned so far: ${s.optionalPoints}
Current attendance: ${s.percentage}% (pass mark 80%) · best achievable now: ${s.maxPossible}%
Sessions recorded: ${s.recorded} of ${s.totalSessions} · remaining sessions: ${s.remainingSessions}
Excused sessions (excluded from the calculation): ${s.excused}
Points still needed to reach 80%: ${s.pointsNeeded} (about ${s.sessionsNeeded} full sessions)
Status: ${s.statusLabel}`;
}

const SYSTEM = `You are the Maharishi Institute meditation attendance advisor. You help a single student understand their own attendance and whether they can afford to miss an upcoming meditation session.

Rules:
- Use ONLY the attendance figures provided. Never invent numbers.
- Be warm, calm and encouraging; keep answers short (2-4 sentences) and concrete.
- When asked whether they can skip a session, do the arithmetic from the figures: say what their percentage would become and whether it stays at or above the 80% requirement, then give a clear yes/no-style recommendation.
- You never change, approve or record attendance. Official records and excusals are handled only by the administrator.
- Encourage them to speak to the administrator for sick leave or approved leave.
- Do not use markdown headings or bullet lists longer than three items.`;

export const askAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ message: z.string().trim().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The advisor is not configured yet.");

    const { error: insErr } = await c.supabase
      .from("advisor_messages")
      .insert({ user_id: c.userId, role: "user", content: data.message });
    if (insErr) throw new Error(insErr.message);

    const [{ data: history }, facts] = await Promise.all([
      c.supabase
        .from("advisor_messages")
        .select("role, content")
        .eq("user_id", c.userId)
        .order("created_at", { ascending: true })
        .limit(60),
      studentContext(c),
    ]);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "system", content: `Current attendance facts:\n${facts}` },
          ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("The advisor is busy right now — please try again shortly.");
      if (res.status === 402) throw new Error("The advisor is temporarily unavailable. Please tell your administrator.");
      throw new Error(`The advisor could not answer right now. (${res.status}) ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as any;
    const reply: string =
      json?.choices?.[0]?.message?.content?.trim() ||
      "I could not work that out just now. Please try asking again.";

    const { error: aErr } = await c.supabase
      .from("advisor_messages")
      .insert({ user_id: c.userId, role: "assistant", content: reply });
    if (aErr) throw new Error(aErr.message);

    return { reply };
  });
