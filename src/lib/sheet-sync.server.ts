import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows, statusFromPoints } from "@/lib/data.helpers";
import type { SessionSlot } from "@/lib/attendance";
import {
  colIndexToLetter,
  createStudentMatcher,
  parseSheetColumns,
  parseSheetPoints,
  type ParsedSheetLayout,
  type SheetStudentRef,
} from "@/lib/sheet-layout";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !sheetsKey) {
    throw new Error("Google Sheets connection is not configured on the server.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": sheetsKey,
    "Content-Type": "application/json",
  };
}

function quoteSheet(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

async function sheetsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { ...gatewayHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Sheets gateway failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type SheetTabMeta = {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
};

export async function fetchSpreadsheetMeta(spreadsheetId: string): Promise<{
  title: string;
  sheets: SheetTabMeta[];
}> {
  const data = await sheetsRequest<{
    properties?: { title?: string };
    sheets?: {
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }[];
  }>(
    `/spreadsheets/${spreadsheetId}?fields=properties.title,sheets(properties(sheetId,title,gridProperties))`,
  );
  return {
    title: data.properties?.title ?? "Google Spreadsheet",
    sheets: (data.sheets ?? [])
      .map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title ?? "Sheet1",
        rowCount: s.properties?.gridProperties?.rowCount ?? 200,
        columnCount: s.properties?.gridProperties?.columnCount ?? 60,
      }))
      .filter((s) => Boolean(s.title)),
  };
}

export async function fetchSheetValues(
  spreadsheetId: string,
  sheetName: string,
  range = "A1:CZ450",
): Promise<string[][]> {
  // Do not encode colons in the range segment — Google Sheets rejects %3A
  const fullRange = `${encodeURIComponent(quoteSheet(sheetName))}!${range}`;
  const data = await sheetsRequest<{ values?: string[][] }>(
    `/spreadsheets/${spreadsheetId}/values/${fullRange}?valueRenderOption=FORMATTED_VALUE`,
  );
  return data.values ?? [];
}

async function batchUpdateCells(
  spreadsheetId: string,
  updates: { range: string; values: (string | number)[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  await sheetsRequest(`/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates,
    }),
  });
}

export async function loadInstitutionStudents(institution: "MII" | "MIU"): Promise<SheetStudentRef[]> {
  const [{ data: profiles, error }, { data: roles }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, student_number, email")
      .eq("institution", institution),
    supabaseAdmin.from("user_roles").select("user_id, role"),
  ]);
  if (error) throw new Error(error.message);
  const nonStudents = new Set(
    (roles ?? [])
      .filter((r: any) => r.role !== "student")
      .map((r: any) => r.user_id as string),
  );
  return ((profiles ?? []) as SheetStudentRef[]).filter((p) => !nonStudents.has(p.id));
}

type CachedSheetMap = {
  expiresAt: number;
  layout: ParsedSheetLayout;
  colByKey: Map<string, string>; // "YYYY-MM-DD:slot" -> colLetter
  rowByStudentId: Map<string, number>; // student_id -> 1-based sheet row
};

const sheetMapCache = new Map<string, CachedSheetMap>();
const CACHE_TTL_MS = 60_000;

export function clearSheetMapCache(linkId?: string) {
  if (linkId) sheetMapCache.delete(linkId);
  else sheetMapCache.clear();
}

async function loadSheetMap(link: {
  id: string;
  spreadsheet_id: string;
  sheet_name: string;
  institution: "MII" | "MIU";
  block_start_date: string;
}): Promise<CachedSheetMap> {
  const cached = sheetMapCache.get(link.id);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const [headerRows, leftRows, students] = await Promise.all([
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:CZ8"),
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:H450"),
    loadInstitutionStudents(link.institution),
  ]);

  const layout = parseSheetColumns(headerRows, link.block_start_date);
  const colByKey = new Map<string, string>();
  for (const col of layout.columns) {
    colByKey.set(`${col.date}:${col.slot}`, col.colLetter);
  }

  const matcher = createStudentMatcher(students);
  const rowByStudentId = new Map<string, number>();
  for (let r = layout.dataStartRow - 1; r < leftRows.length; r += 1) {
    const row = leftRows[r] ?? [];
    const no = layout.studentNoCol >= 0 ? (row[layout.studentNoCol] ?? "") : "";
    const last = layout.lastNameCol >= 0 ? (row[layout.lastNameCol] ?? "") : "";
    const first = layout.firstNameCol >= 0 ? (row[layout.firstNameCol] ?? "") : "";
    const email = layout.emailCol >= 0 ? (row[layout.emailCol] ?? "") : "";
    if (!no.trim() && !last.trim() && !first.trim()) continue;
    const student = matcher.matchSheetRow(no, last, first, email);
    if (student && !rowByStudentId.has(student.id)) {
      rowByStudentId.set(student.id, r + 1);
    }
  }

  const entry: CachedSheetMap = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    layout,
    colByKey,
    rowByStudentId,
  };
  sheetMapCache.set(link.id, entry);
  return entry;
}

export function localTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Website -> Google Sheets live push.
 * Runs cleanly after saving attendance; never throws so web marking never fails
 * if Google Sheets is temporarily unreachable.
 */
export async function pushMarksToLinkedSheets(
  blockId: string,
  marks: { student_id: string; session_date: string; slot: SessionSlot; points: number | null }[],
): Promise<void> {
  if (marks.length === 0) return;
  const { data: links } = await supabaseAdmin
    .from("sheet_links")
    .select("id, institution, spreadsheet_id, sheet_name, block:blocks(start_date)")
    .eq("block_id", blockId)
    .eq("enabled", true);

  if (!links || links.length === 0) return;

  await Promise.all(
    links.map(async (raw: any) => {
      const startDate = raw.block?.start_date as string | undefined;
      if (!startDate) return;
      try {
        const map = await loadSheetMap({
          id: raw.id,
          spreadsheet_id: raw.spreadsheet_id,
          sheet_name: raw.sheet_name,
          institution: raw.institution,
          block_start_date: startDate,
        });
        const updates: { range: string; values: (string | number)[][] }[] = [];
        for (const m of marks) {
          const rowNum = map.rowByStudentId.get(m.student_id);
          const colLetter = map.colByKey.get(`${m.session_date}:${m.slot}`);
          if (!rowNum || !colLetter) continue;
          updates.push({
            range: `${quoteSheet(raw.sheet_name)}!${colLetter}${rowNum}`,
            values: [[m.points === null ? 0 : m.points]],
          });
        }
        if (updates.length > 0) {
          await batchUpdateCells(raw.spreadsheet_id, updates);
          await supabaseAdmin
            .from("sheet_links")
            .update({
              last_synced_at: new Date().toISOString(),
              last_sync_status: `ok (${updates.length} cell${updates.length === 1 ? "" : "s"})`,
              last_sync_direction: "web_to_sheet",
              updated_at: new Date().toISOString(),
            })
            .eq("id", raw.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Sheet sync push failed for link ${raw.id}:`, msg);
        await supabaseAdmin
          .from("sheet_links")
          .update({
            last_sync_status: `error: ${msg.slice(0, 180)}`,
            last_sync_direction: "web_to_sheet",
            updated_at: new Date().toISOString(),
          })
          .eq("id", raw.id);
      }
    }),
  );
}

export async function inspectSheetAgainstBlock(params: {
  spreadsheetId: string;
  sheetName?: string;
  preferredGid?: number | null;
  blockStartDate: string;
  institution: "MII" | "MIU";
}) {
  const meta = await fetchSpreadsheetMeta(params.spreadsheetId);
  const chosen =
    (params.sheetName && meta.sheets.find((s) => s.title === params.sheetName)) ||
    (params.preferredGid !== null &&
      params.preferredGid !== undefined &&
      meta.sheets.find((s) => s.sheetId === params.preferredGid)) ||
    meta.sheets[0];
  if (!chosen) throw new Error("This Google Spreadsheet has no visible tabs.");

  const [headerRows, leftRows, students] = await Promise.all([
    fetchSheetValues(params.spreadsheetId, chosen.title, "A1:CZ8"),
    fetchSheetValues(params.spreadsheetId, chosen.title, "A1:H450"),
    loadInstitutionStudents(params.institution),
  ]);

  const layout = parseSheetColumns(headerRows, params.blockStartDate);
  const matcher = createStudentMatcher(students);
  let sheetStudents = 0;
  let matchedStudents = 0;
  const unmatchedSample: string[] = [];

  for (let r = layout.dataStartRow - 1; r < leftRows.length; r += 1) {
    const row = leftRows[r] ?? [];
    const no = layout.studentNoCol >= 0 ? (row[layout.studentNoCol] ?? "").trim() : "";
    const last = layout.lastNameCol >= 0 ? (row[layout.lastNameCol] ?? "").trim() : "";
    const first = layout.firstNameCol >= 0 ? (row[layout.firstNameCol] ?? "").trim() : "";
    const email = layout.emailCol >= 0 ? (row[layout.emailCol] ?? "").trim() : "";
    if (!no && !last && !first) continue;
    sheetStudents += 1;
    const found = matcher.matchSheetRow(no, last, first, email);
    if (found) matchedStudents += 1;
    else if (unmatchedSample.length < 5) unmatchedSample.push(`${last} ${first} (${no || "no ID"})`.trim());
  }

  return {
    title: meta.title,
    sheets: meta.sheets,
    selectedSheet: chosen.title,
    layout,
    sheetStudents,
    matchedStudents,
    unmatchedSample,
  };
}

export async function runFullSheetSync(params: {
  linkId: string;
  institution: "MII" | "MIU";
  direction: "push" | "pull";
  actorId: string;
  actorEmail: string | null;
}) {
  const { data: link, error } = await supabaseAdmin
    .from("sheet_links")
    .select("*, block:blocks(id, start_date, end_date, status, institution)")
    .eq("id", params.linkId)
    .eq("institution", params.institution)
    .maybeSingle();
  if (error || !link) throw new Error("Linked spreadsheet not found.");
  const block = (link as any).block as {
    id: string;
    start_date: string;
    end_date: string;
    status: string;
    institution: "MII" | "MIU";
  } | null;
  if (!block) throw new Error("Block not found for this sheet link.");

  clearSheetMapCache(link.id);

  if (params.direction === "push") {
    const [map, records] = await Promise.all([
      loadSheetMap({
        id: link.id,
        spreadsheet_id: link.spreadsheet_id,
        sheet_name: link.sheet_name,
        institution: params.institution,
        block_start_date: block.start_date,
      }),
      fetchAllRows<{
        student_id: string;
        session_date: string;
        slot: SessionSlot;
        points: number;
      }>(() =>
        supabaseAdmin
          .from("attendance")
          .select("student_id, session_date, slot, points")
          .eq("block_id", block.id)
          .order("id"),
      ),
    ]);

    const updates: { range: string; values: (string | number)[][] }[] = [];
    for (const r of records) {
      const rowNum = map.rowByStudentId.get(r.student_id);
      const colLetter = map.colByKey.get(`${r.session_date}:${r.slot}`);
      if (!rowNum || !colLetter) continue;
      updates.push({
        range: `${quoteSheet(link.sheet_name)}!${colLetter}${rowNum}`,
        values: [[Number(r.points ?? 0)]],
      });
    }

    // Chunk in batches of 500 to stay well within Google Sheets payload limits
    for (let i = 0; i < updates.length; i += 500) {
      await batchUpdateCells(link.spreadsheet_id, updates.slice(i, i + 500));
    }

    await supabaseAdmin
      .from("sheet_links")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: `ok (pushed ${updates.length} marks)`,
        last_sync_direction: "web_to_sheet",
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      action: "sheet_sync_push",
      entity: "sheet_links",
      entity_id: link.id,
      details: { block_id: block.id, sheet_name: link.sheet_name, cells_updated: updates.length },
    });

    return { updated: updates.length, direction: "push" as const };
  }

  // PULL: Google Sheets -> Website
  if (block.status === "closed") throw new Error("Cannot pull marks into a closed block.");
  const [rows, students] = await Promise.all([
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:CZ450"),
    loadInstitutionStudents(params.institution),
  ]);
  const layout = parseSheetColumns(rows, block.start_date);
  const matcher = createStudentMatcher(students);
  const today = localTodayIso();

  // Detect which session columns actually have at least one non-zero mark so we
  // never import pre-filled template 0.0 cells from unstarted/future sessions.
  const activeCols = new Set<number>();
  for (const col of layout.columns) {
    if (col.date > today || col.date < block.start_date || col.date > block.end_date) continue;
    for (let r = layout.dataStartRow - 1; r < rows.length; r += 1) {
      const pts = parseSheetPoints(rows[r]?.[col.colIndex]);
      if (typeof pts === "number" && pts > 0) {
        activeCols.add(col.colIndex);
        break;
      }
    }
  }

  const upserts: {
    block_id: string;
    student_id: string;
    session_date: string;
    slot: SessionSlot;
    points: number;
    status: "present" | "absent" | "excused";
    recorded_by: string;
    marked_at: string;
  }[] = [];
  const nowIso = new Date().toISOString();

  for (let r = layout.dataStartRow - 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const no = layout.studentNoCol >= 0 ? (row[layout.studentNoCol] ?? "") : "";
    const last = layout.lastNameCol >= 0 ? (row[layout.lastNameCol] ?? "") : "";
    const first = layout.firstNameCol >= 0 ? (row[layout.firstNameCol] ?? "") : "";
    const email = layout.emailCol >= 0 ? (row[layout.emailCol] ?? "") : "";
    if (!no.trim() && !last.trim() && !first.trim()) continue;
    const student = matcher.matchSheetRow(no, last, first, email);
    if (!student) continue;

    for (const col of layout.columns) {
      if (!activeCols.has(col.colIndex)) continue;
      const pts = parseSheetPoints(row[col.colIndex]);
      if (typeof pts !== "number") continue;
      upserts.push({
        block_id: block.id,
        student_id: student.id,
        session_date: col.date,
        slot: col.slot,
        points: pts,
        status: statusFromPoints(pts, null),
        recorded_by: params.actorId,
        marked_at: nowIso,
      });
    }
  }

  for (let i = 0; i < upserts.length; i += 500) {
    const { error: upErr } = await supabaseAdmin
      .from("attendance")
      .upsert(upserts.slice(i, i + 500), { onConflict: "block_id,student_id,session_date,slot" });
    if (upErr) throw new Error(upErr.message);
  }

  await supabaseAdmin
    .from("sheet_links")
    .update({
      last_synced_at: nowIso,
      last_sync_status: `ok (pulled ${upserts.length} marks from ${activeCols.size} active sessions)`,
      last_sync_direction: "sheet_to_web",
      updated_at: nowIso,
    })
    .eq("id", link.id);

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_email: params.actorEmail,
    action: "sheet_sync_pull",
    entity: "sheet_links",
    entity_id: link.id,
    details: {
      block_id: block.id,
      sheet_name: link.sheet_name,
      marks_imported: upserts.length,
      active_sessions: activeCols.size,
    },
  });

  return { updated: upserts.length, activeSessions: activeCols.size, direction: "pull" as const };
}

/**
 * Processes a real-time webhook payload sent by Google Apps Script when a cell
 * dropdown is edited in Google Sheets.
 */
export async function applySheetWebhookEdits(params: {
  link: {
    id: string;
    institution: "MII" | "MIU";
    block_id: string;
    spreadsheet_id: string;
    sheet_name: string;
    block: { id: string; start_date: string; end_date: string; status: string };
  };
  edits: {
    row: number;
    col: number;
    student_number: string;
    last_name: string;
    first_name: string;
    value: string;
  }[];
}) {
  const { link, edits } = params;
  if (link.block.status === "closed") {
    return { applied: 0, skipped: edits.length, reason: "block_closed" };
  }

  const [headerRows, students] = await Promise.all([
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:CZ8"),
    loadInstitutionStudents(link.institution),
  ]);
  const layout = parseSheetColumns(headerRows, link.block.start_date);
  const colByIndex = new Map(layout.columns.map((c) => [c.colIndex, c]));
  const matcher = createStudentMatcher(students);

  let applied = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const edit of edits) {
    const col = colByIndex.get(edit.col - 1); // Apps Script col is 1-based
    if (!col) {
      skipped += 1;
      continue;
    }
    if (col.date < link.block.start_date || col.date > link.block.end_date) {
      skipped += 1;
      continue;
    }
    const student = matcher.matchSheetRow(edit.student_number, edit.last_name, edit.first_name);
    if (!student) {
      skipped += 1;
      continue;
    }
    const parsed = parseSheetPoints(edit.value);
    if (parsed === "invalid") {
      skipped += 1;
      continue;
    }

    if (parsed === null) {
      const { error } = await supabaseAdmin
        .from("attendance")
        .delete()
        .eq("block_id", link.block_id)
        .eq("student_id", student.id)
        .eq("session_date", col.date)
        .eq("slot", col.slot);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: null,
        actor_email: "google-sheets-sync",
        action: "sheet_sync_clear",
        entity: "attendance",
        entity_id: student.id,
        details: {
          source: "google_sheets",
          link_id: link.id,
          block_id: link.block_id,
          session_date: col.date,
          slot: col.slot,
          cell: `${colIndexToLetter(edit.col - 1)}${edit.row}`,
        },
      });
      applied += 1;
      continue;
    }

    const { error } = await supabaseAdmin.from("attendance").upsert(
      {
        block_id: link.block_id,
        student_id: student.id,
        session_date: col.date,
        slot: col.slot,
        points: parsed,
        status: statusFromPoints(parsed, null),
        marked_at: nowIso,
      },
      { onConflict: "block_id,student_id,session_date,slot" },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: null,
      actor_email: "google-sheets-sync",
      action: "sheet_sync_mark",
      entity: "attendance",
      entity_id: student.id,
      details: {
        source: "google_sheets",
        link_id: link.id,
        block_id: link.block_id,
        session_date: col.date,
        slot: col.slot,
        points: parsed,
        cell: `${colIndexToLetter(edit.col - 1)}${edit.row}`,
      },
    });
    applied += 1;
  }

  await supabaseAdmin
    .from("sheet_links")
    .update({
      last_synced_at: nowIso,
      last_sync_status: `ok (received ${applied} edit${applied === 1 ? "" : "s"})`,
      last_sync_direction: "sheet_to_web",
      updated_at: nowIso,
    })
    .eq("id", link.id);

  return { applied, skipped };
}