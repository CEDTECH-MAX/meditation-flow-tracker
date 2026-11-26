import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const EditSchema = z.object({
  row: z.number().int().min(1).max(2000),
  col: z.number().int().min(1).max(2000),
  student_number: z.string().max(80).default(""),
  last_name: z.string().max(120).default(""),
  first_name: z.string().max(120).default(""),
  value: z.string().max(40).default(""),
});

const PayloadSchema = z.object({
  link_id: z.string().uuid(),
  sheet_name: z.string().min(1).max(200),
  edits: z.array(EditSchema).min(1).max(200),
});

function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const Route = createFileRoute("/api/public/sheet-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = request.headers.get("x-sheet-sync-secret") ?? "";
          if (!secret) {
            return Response.json({ ok: false, error: "Missing sync secret" }, { status: 401 });
          }

          const rawBody = await request.json().catch(() => null);
          const parsed = PayloadSchema.safeParse(rawBody);
          if (!parsed.success) {
            return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [{ data: pause }, { data: link }] = await Promise.all([
            supabaseAdmin
              .from("system_controls")
              .select("enabled")
              .eq("key", "disable_marking")
              .maybeSingle(),
            supabaseAdmin
              .from("sheet_links")
              .select("*, block:blocks(id, start_date, end_date, status)")
              .eq("id", parsed.data.link_id)
              .maybeSingle(),
          ]);

          if (!link || !safeSecretEqual(secret, link.webhook_secret)) {
            return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
          }
          if (pause?.enabled) {
            return Response.json({ ok: false, error: "Marking is paused" }, { status: 423 });
          }

          // Match the edited tab strictly within the same spreadsheet and institution
          // so one installed Apps Script automatically covers newly created block tabs.
          let activeLink = link;
          if (link.sheet_name !== parsed.data.sheet_name) {
            const { data: sibling } = await supabaseAdmin
              .from("sheet_links")
              .select("*, block:blocks(id, start_date, end_date, status)")
              .eq("institution", link.institution)
              .eq("spreadsheet_id", link.spreadsheet_id)
              .eq("sheet_name", parsed.data.sheet_name)
              .maybeSingle();
            if (!sibling) {
              return Response.json({ ok: true, applied: 0, skipped: parsed.data.edits.length });
            }
            activeLink = sibling;
          }

          if (!activeLink.enabled) {
            return Response.json({ ok: true, applied: 0, skipped: parsed.data.edits.length, paused: true });
          }
          const block = (activeLink as any).block as {
            id: string;
            start_date: string;
            end_date: string;
            status: string;
          } | null;
          if (!block || !activeLink.block_id) {
            return Response.json({ ok: false, error: "Block missing" }, { status: 404 });
          }

          const { applySheetWebhookEdits } = await import("@/lib/sheet-sync.server");
          const result = await applySheetWebhookEdits({
            link: {
              id: activeLink.id,
              institution: activeLink.institution,
              block_id: activeLink.block_id,
              spreadsheet_id: activeLink.spreadsheet_id,
              sheet_name: activeLink.sheet_name,
              block,
            },
            edits: parsed.data.edits,
          });

          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("Sheet sync webhook failed:", err);
          return Response.json({ ok: false, error: "Sync error" }, { status: 500 });
        }
      },
    },
  },
});