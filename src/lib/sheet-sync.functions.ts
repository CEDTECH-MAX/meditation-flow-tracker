import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, audit, myInstitution, type Ctx } from "@/lib/data.helpers";
import {
  buildAppsScript,
  buildCanonicalSpreadsheetUrl,
  parseSpreadsheetGid,
  parseSpreadsheetId,
} from "@/lib/sheet-layout";

const PUBLISHED_ORIGIN = "https://meditationflo.lovable.app";

export const listSheetLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("sheet_links")
      .select("*, block:blocks(id, name, start_date, end_date, status)")
      .eq("institution", inst)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      ...row,
      spreadsheet_url: buildCanonicalSpreadsheetUrl(row.spreadsheet_id, row.spreadsheet_url),
      webhook_url: `${PUBLISHED_ORIGIN}/api/public/sheet-sync`,
      apps_script: buildAppsScript({
        webhookUrl: `${PUBLISHED_ORIGIN}/api/public/sheet-sync`,
        linkId: row.id,
        secret: row.webhook_secret,
        sheetName: row.sheet_name,
        dataStartRow: 6,
        studentNoCol: 3,
        lastNameCol: 1,
        firstNameCol: 2,
      }),
    }));
  });

export const inspectGoogleSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spreadsheet_url: z.string().trim().min(5).max(500),
        block_id: z.string().uuid(),
        sheet_name: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const spreadsheetId = parseSpreadsheetId(data.spreadsheet_url);
    if (!spreadsheetId) {
      throw new Error("Could not read a Google Sheet ID from that link. Paste the full Google Sheets URL.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: block } = await supabaseAdmin
      .from("blocks")
      .select("id, name, start_date, end_date, institution")
      .eq("id", data.block_id)
      .eq("institution", inst)
      .maybeSingle();
    if (!block) throw new Error("Block not found in your institution.");

    const { inspectSheetAgainstBlock } = await import("@/lib/sheet-sync.server");
    const result = await inspectSheetAgainstBlock({
      spreadsheetId,
      ...(data.sheet_name ? { sheetName: data.sheet_name } : {}),
      preferredGid: parseSpreadsheetGid(data.spreadsheet_url),
      blockStartDate: block.start_date,
      institution: inst,
    });

    return {
      spreadsheet_id: spreadsheetId,
      title: result.title,
      sheets: result.sheets,
      selected_sheet: result.selectedSheet,
      data_start_row: result.layout.dataStartRow,
      student_no_col: result.layout.studentNoCol,
      last_name_col: result.layout.lastNameCol,
      first_name_col: result.layout.firstNameCol,
      mapped_sessions: result.layout.columns.length,
      sample_columns: result.layout.columns.slice(0, 8),
      sheet_students: result.sheetStudents,
      matched_students: result.matchedStudents,
      unmatched_sample: result.unmatchedSample,
    };
  });

export const createSheetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: z.string().uuid(),
        label: z.string().trim().min(2).max(160),
        spreadsheet_url: z.string().trim().min(5).max(500),
        sheet_name: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const spreadsheetId = parseSpreadsheetId(data.spreadsheet_url);
    if (!spreadsheetId) throw new Error("Invalid Google Sheets URL.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: block } = await supabaseAdmin
      .from("blocks")
      .select("id, institution")
      .eq("id", data.block_id)
      .eq("institution", inst)
      .maybeSingle();
    if (!block) throw new Error("Block not found in your institution.");

    const { randomBytes } = await import("node:crypto");
    const secret = randomBytes(24).toString("hex");

    const { data: created, error } = await supabaseAdmin
      .from("sheet_links")
      .insert({
        institution: inst,
        block_id: data.block_id,
        label: data.label,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: buildCanonicalSpreadsheetUrl(spreadsheetId, data.spreadsheet_url),
        sheet_name: data.sheet_name,
        webhook_secret: secret,
        enabled: true,
        created_by: c.userId,
      })
      .select("*")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error("That tab is already linked to this block.");
      }
      throw new Error(error.message);
    }

    await audit(c, "create", "sheet_links", created.id, {
      block_id: data.block_id,
      label: data.label,
      sheet_name: data.sheet_name,
    });
    return created;
  });

export const toggleSheetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sheet_links")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    const { clearSheetMapCache } = await import("@/lib/sheet-sync.server");
    clearSheetMapCache(data.id);
    await audit(c, data.enabled ? "enable" : "pause", "sheet_links", data.id, {
      enabled: data.enabled,
    });
    return { ok: true };
  });

export const deleteSheetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sheet_links")
      .delete()
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    const { clearSheetMapCache } = await import("@/lib/sheet-sync.server");
    clearSheetMapCache(data.id);
    await audit(c, "delete", "sheet_links", data.id, {});
    return { ok: true };
  });

export const runManualSheetSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        direction: z.enum(["push", "pull"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { runFullSheetSync } = await import("@/lib/sheet-sync.server");
    return runFullSheetSync({
      linkId: data.id,
      institution: inst,
      direction: data.direction,
      actorId: c.userId,
      actorEmail: (c.claims?.["email"] as string) ?? null,
    });
  });

export const createBlockSheetTab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        block_id: z.string().uuid(),
        template_link_id: z.string().uuid(),
        tab_name: z.string().trim().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: block } = await supabaseAdmin
      .from("blocks")
      .select("id, name, start_date, institution")
      .eq("id", data.block_id)
      .eq("institution", inst)
      .maybeSingle();
    if (!block) throw new Error("Block not found in your institution.");

    const { duplicateTemplateTabForBlock } = await import("@/lib/sheet-sync.server");
    return duplicateTemplateTabForBlock({
      templateLinkId: data.template_link_id,
      institution: inst,
      newBlockId: block.id,
      newBlockName: block.name,
      newBlockStartDate: block.start_date,
      newTabName: data.tab_name,
      actorId: c.userId,
      actorEmail: (c.claims?.["email"] as string) ?? null,
    });
  });