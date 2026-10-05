import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { summarise, todayKey, type Block } from "./attendance";
import { myInstitution, type Ctx } from "./data.helpers";

export const ADVISOR_BUCKET = "advisor-attachments";

export type AdvisorAttachment = { path: string; name: string; type: string };

export type AdvisorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  attachments: AdvisorAttachment[];
};

/** Full, permanent chat history for the signed-in student. */
export const listAdvisorMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { data, error } = await c.supabase
      .from("advisor_messages")
      .select("id, role, content, created_at, attachments")
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

  return {
    profile,
    text: `Student: ${profile?.full_name ?? "Unknown"} (${profile?.student_number ?? "no number"})
Cohort: ${(profile as any)?.cohort?.name ?? "unassigned"} · Classification: ${profile?.classification ?? "unknown"} · Gender: ${profile?.gender ?? "unknown"}
Today: ${today}
Block: ${block?.name ?? "none"} (${block?.start_date ?? "?"} to ${block?.end_date ?? "?"}, ${block?.meditation_days ?? 0} meditation days, status ${block?.status ?? "n/a"})
Points earned: ${s.pointsEarned} of a possible ${s.pointsPossible} (each session is worth up to 2.0)
Current attendance: ${s.percentage}% (pass mark 80%) · best achievable now: ${s.maxPossible}%
Sessions recorded: ${s.recorded} of ${s.totalSessions} · remaining sessions: ${s.remainingSessions}
Excused sessions (excluded from the calculation): ${s.excused}
Points still needed to reach 80%: ${s.pointsNeeded} (about ${s.sessionsNeeded} full sessions)
Status: ${s.statusLabel}`,
  };
}

const REPORT_TAG = "<<REPORT_ADMIN>>";

const SYSTEM = `You are the Maharishi Institute meditation advisor — a warm, knowledgeable companion for one student.

You can talk freely about anything related to meditation and wellbeing: Transcendental Meditation practice, technique questions in general terms, benefits, stress, sleep, focus, motivation, building a routine, group meditation, asanas, pranayama, how the attendance system works, and the student's own attendance. Give thoughtful, flexible, natural answers — not just numbers. For personal TM technique corrections, gently suggest checking with their TM teacher.

Attendance rules:
- Use ONLY the attendance figures provided; never invent numbers. When asked whether they can skip a session, do the arithmetic and give a clear recommendation.
- You never change, approve or record attendance. Official records and excusals are decided only by the administrator.

Reporting sickness or problems to the administrator:
- If the student tells you they are sick, injured, bereaved, have a family emergency or another issue that affects attendance, show care, and tell them you are notifying the administrator.
- In that case, end your reply with ONE final line exactly in this form (it is hidden from the student):
${REPORT_TAG}{"category":"sick|family|personal|other","summary":"one or two sentences in third person describing who is affected and what happened","dates":"dates or sessions affected, or unknown","letter":"attached|will bring|none|unknown"}
- Only add that line when there is a real issue to report and you have not already reported this same issue earlier in the conversation. If they attached a document this turn, set letter to "attached". If they say they will bring a doctor's note, set "will bring".
- Remind them that the administrator decides any excusal.

Style: keep answers concise (usually 2-6 sentences), calm and encouraging. Plain text, no markdown headings.`;

const attachmentSchema = z.object({
  path: z.string().min(1).max(400),
  name: z.string().min(1).max(200),
  type: z.string().max(120),
});

async function callModel(input: { role: string; content: string }[]) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The advisor is not configured yet.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("The advisor is busy right now — please try again shortly.");
    if (res.status === 402 || res.status === 403)
      throw new Error("The advisor is temporarily unavailable. Please tell your administrator.");
    throw new Error(`The advisor could not answer right now. (${res.status}) ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error")
          throw new Error(ev?.response?.error?.message ?? ev?.message ?? "The advisor could not answer.");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return text.trim();
}

/** Sends an internal mail from the student to every admin of their institution. */
async function reportToAdmins(
  c: Ctx,
  studentName: string,
  studentNumber: string,
  report: { category?: string; summary?: string; dates?: string; letter?: string },
  attachments: AdvisorAttachment[],
) {
  const inst = await myInstitution(c);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (roles ?? []).map((r: any) => r.user_id as string);
  if (ids.length === 0) return false;
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("institution", inst)
    .in("id", ids);
  const to = (admins ?? []).map((a: any) => a.id as string).filter((id) => id !== c.userId);
  if (to.length === 0) return false;

  const cat = (report.category ?? "other").toLowerCase();
  const label = cat === "sick" ? "Sick report" : cat === "family" ? "Family matter" : "Student issue";
  const letter =
    report.letter === "attached"
      ? "Supporting document attached."
      : report.letter === "will bring"
        ? "The student says they will bring a letter / sick note."
        : "No supporting letter mentioned yet.";
  const body = `${label} submitted through the AI Advisor.

Student: ${studentName} (${studentNumber})
What happened: ${report.summary ?? "Not specified"}
Dates / sessions affected: ${report.dates ?? "unknown"}
Supporting letter: ${letter}${attachments.length ? `\nAttachments: ${attachments.map((a) => a.name).join(", ")}` : ""}

This is a notification only — no attendance has been changed. Please review and record any excusal through the normal attendance process.`;

  const { data: msg, error } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: c.userId,
      subject: `${label}: ${studentName}`,
      body,
      is_draft: false,
      sent_at: new Date().toISOString(),
      attachments,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("message_recipients")
    .insert(to.map((id) => ({ message_id: msg.id, recipient_id: id, kind: "to" })));
  return true;
}

export const askAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        message: z.string().trim().max(2000),
        attachments: z.array(attachmentSchema).max(5).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const attachments = (data.attachments ?? []).filter((a) => a.path.startsWith(`${c.userId}/`));
    const message = data.message || (attachments.length ? "I've attached a document." : "");
    if (!message) throw new Error("Type a message or attach a file.");

    const { error: insErr } = await c.supabase
      .from("advisor_messages")
      .insert({ user_id: c.userId, role: "user", content: message, attachments });
    if (insErr) throw new Error(insErr.message);

    const [{ data: history }, facts] = await Promise.all([
      c.supabase
        .from("advisor_messages")
        .select("role, content, attachments")
        .eq("user_id", c.userId)
        .order("created_at", { ascending: true })
        .limit(60),
      studentContext(c),
    ]);

    const input = [
      { role: "system", content: SYSTEM },
      { role: "system", content: `Current attendance facts:\n${facts.text}` },
      ...(history ?? []).map((m: any) => ({
        role: m.role,
        content:
          m.content +
          (Array.isArray(m.attachments) && m.attachments.length
            ? `\n[Attached: ${m.attachments.map((a: any) => a.name).join(", ")}]`
            : ""),
      })),
    ];

    const raw = await callModel(input);
    let reply = raw;
    let reported = false;
    const at = raw.indexOf(REPORT_TAG);
    if (at >= 0) {
      reply = raw.slice(0, at).trim();
      try {
        const json = raw.slice(at + REPORT_TAG.length).trim();
        const report = JSON.parse(json.slice(0, json.lastIndexOf("}") + 1));
        if (attachments.length) report.letter = "attached";
        reported = await reportToAdmins(
          c,
          facts.profile?.full_name ?? "A student",
          facts.profile?.student_number ?? "no number",
          report,
          attachments,
        );
      } catch (e) {
        console.error("advisor report failed", e);
      }
    } else if (attachments.length) {
      // A document was attached without a new report: forward it so the admin still receives it.
      reported = await reportToAdmins(
        c,
        facts.profile?.full_name ?? "A student",
        facts.profile?.student_number ?? "no number",
        { category: "other", summary: `Supporting document sent by the student: "${message.slice(0, 300)}"`, letter: "attached" },
        attachments,
      ).catch(() => false);
    }
    if (!reply) reply = "Thank you for letting me know. Please take care.";
    if (reported) reply += "\n\n✉️ Your administrator has been notified" + (attachments.length ? " and your attachment was sent." : ".");

    const { error: aErr } = await c.supabase
      .from("advisor_messages")
      .insert({ user_id: c.userId, role: "assistant", content: reply });
    if (aErr) throw new Error(aErr.message);

    return { reply, reported };
  });

/** Signed link to an attachment the caller is allowed to see (own advisor file or mail they're part of). */
export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ path: z.string().min(1).max(400), message_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    let allowed = data.path.startsWith(`${c.userId}/`);
    if (!allowed && data.message_id) {
      // RLS only returns messages the caller sent or received.
      const { data: msg } = await c.supabase
        .from("messages")
        .select("attachments")
        .eq("id", data.message_id)
        .maybeSingle();
      allowed = Array.isArray(msg?.attachments) && msg.attachments.some((a: any) => a?.path === data.path);
    }
    if (!allowed) throw new Error("You don't have access to this file.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(ADVISOR_BUCKET)
      .createSignedUrl(data.path, 600);
    if (error || !signed) throw new Error("Could not open the file.");
    return { url: signed.signedUrl };
  });
