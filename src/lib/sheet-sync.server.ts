import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows, statusFromPoints } from "@/lib/data.helpers";
import { blockSessions, type AttendanceRecord, type Block, type SessionSlot } from "@/lib/attendance";
import { buildWebsiteRegister, buildRegisterSummaryValues, registerSignature, type RegisterBlock } from "@/lib/sheet-register";
import {
  buildCanonicalSpreadsheetUrl,
  buildDropdownValidationRequests,
  colIndexToLetter,
  createStudentMatcher,
  parseSheetColumns,
  parseSheetPoints,
  parseSpreadsheetGid,
  quoteSheetName,
  sanitizeSheetTabName,
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
  return quoteSheetName(sheetName);
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
  conditionalFormats: { ranges: { startColumnIndex?: number; endColumnIndex?: number }[] }[];
};

export async function fetchSpreadsheetMeta(spreadsheetId: string): Promise<{
  title: string;
  sheets: SheetTabMeta[];
}> {
  const data = await sheetsRequest<{
    properties?: { title?: string };
    sheets?: {
      conditionalFormats?: { ranges?: { startColumnIndex?: number; endColumnIndex?: number }[] }[];
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }[];
  }>(
    `/spreadsheets/${spreadsheetId}?fields=properties.title,sheets(properties(sheetId,title,gridProperties),conditionalFormats.ranges)`,
  );
  return {
    title: data.properties?.title ?? "Google Spreadsheet",
    sheets: (data.sheets ?? [])
      .map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title ?? "Sheet1",
        rowCount: s.properties?.gridProperties?.rowCount ?? 200,
        columnCount: s.properties?.gridProperties?.columnCount ?? 60,
        conditionalFormats: (s.conditionalFormats ?? []).map((rule) => ({ ranges: rule.ranges ?? [] })),
      }))
      .filter((s) => Boolean(s.title)),
  };
}

export async function fetchSheetValues(
  spreadsheetId: string,
  sheetName: string,
  range = "A1:AZZ450",
  valueRenderOption: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE",
): Promise<string[][]> {
  // Do not encode colons in the range segment — Google Sheets rejects %3A
  const fullRange = `${encodeURIComponent(quoteSheet(sheetName))}!${range}`;
  const data = await sheetsRequest<{ values?: unknown[][] }>(
    `/spreadsheets/${spreadsheetId}/values/${fullRange}?valueRenderOption=${valueRenderOption}`,
  );
  // FORMULA mode returns raw numbers/booleans for non-formula cells; normalize every cell to string.
  return (data.values ?? []).map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))) : [],
  );
}

async function batchUpdateCells(
  spreadsheetId: string,
  updates: { range: string; values: (string | number)[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  await sheetsRequest(`/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      // Preserve the website's exact percentage display rather than letting old template number formats reinterpret it.
      valueInputOption: "RAW",
      data: updates,
    }),
  });
}

function pickUniqueTabName(desired: string, existingTitles: string[]): string {
  const base = sanitizeSheetTabName(desired);
  const taken = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i <= 50; i += 1) {
    const suffix = ` (${i})`;
    const candidate = `${base.slice(0, 100 - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, 86)} ${Date.now().toString().slice(-6)}`;
}

/**
 * Duplicates an existing institution-scoped template tab inside the same Google
 * Spreadsheet for a newly created block, clears old attendance marks (preserving
 * all formulas, student rows, and dropdowns), updates block/date headers, and
 * creates an enabled `sheet_links` record for live two-way sync.
 */
export async function duplicateTemplateTabForBlock(params: {
  templateLinkId: string;
  institution: "MII" | "MIU";
  newBlockId: string;
  newBlockName: string;
  newBlockStartDate: string;
  newTabName: string;
  actorId: string;
  actorEmail: string | null;
}) {
  const { data: template, error: tmplErr } = await supabaseAdmin
    .from("sheet_links")
    .select("*, block:blocks(name, start_date)")
    .eq("id", params.templateLinkId)
    .eq("institution", params.institution)
    .maybeSingle();
  if (tmplErr || !template) {
    throw new Error("Template Google Sheet link not found in your institution.");
  }

  const meta = await fetchSpreadsheetMeta(template.spreadsheet_id);
  const preferredGid = parseSpreadsheetGid(template.spreadsheet_url);
  const sourceTab =
    meta.sheets.find((s) => s.title === template.sheet_name) ??
    (preferredGid !== null ? meta.sheets.find((s) => s.sheetId === preferredGid) : undefined) ??
    meta.sheets[0];
  if (!sourceTab) {
    throw new Error(`Could not find template tab "${template.sheet_name}" in Google Sheets.`);
  }

  const finalTabName = pickUniqueTabName(
    params.newTabName || params.newBlockName,
    meta.sheets.map((s) => s.title),
  );

  // Load the saved block before duplicating; layout failures below remove the unfinished copy.
  const { data: newBlock, error: blockError } = await supabaseAdmin.from("blocks")
    .select("*").eq("id", params.newBlockId).eq("institution", params.institution).single();
  if (blockError || !newBlock) throw new Error("Block settings could not be loaded.");

  const dupRes = await sheetsRequest<{
    replies?: { duplicateSheet?: { properties?: { sheetId?: number; title?: string } } }[];
  }>(`/spreadsheets/${template.spreadsheet_id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: sourceTab.sheetId,
            insertSheetIndex: 0,
            newSheetName: finalTabName,
          },
        },
      ],
    }),
  });

  const createdProps = dupRes.replies?.[0]?.duplicateSheet?.properties;
  const newSheetId = createdProps?.sheetId ?? null;
  const actualTabName = createdProps?.title ?? finalTabName;

  if (newSheetId === null) throw new Error("Google Sheets did not return the new tab ID.");
  // Build from the actual saved settings, not the template's number of weeks or rounding slots.
  try {
    await prepareWebsiteRegister({ id: `new:${newSheetId}`, spreadsheet_id: template.spreadsheet_id,
      sheet_name: actualTabName, institution: params.institution }, newBlock as Block, true);
  } catch (err) {
    await sheetsRequest(`/spreadsheets/${template.spreadsheet_id}:batchUpdate`, {
      method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: newSheetId } }] }),
    });
    throw err;
  }

  const { randomBytes } = await import("node:crypto");
  const secret = randomBytes(24).toString("hex");
  const tabUrl =
    newSheetId !== null
      ? `https://docs.google.com/spreadsheets/d/${template.spreadsheet_id}/edit#gid=${newSheetId}`
      : buildCanonicalSpreadsheetUrl(template.spreadsheet_id, template.spreadsheet_url);

  const { data: createdLink, error: linkErr } = await supabaseAdmin
    .from("sheet_links")
    .insert({
      institution: params.institution,
      block_id: params.newBlockId,
      label: actualTabName,
      spreadsheet_id: template.spreadsheet_id,
      spreadsheet_url: tabUrl,
      sheet_name: actualTabName,
      webhook_secret: secret,
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_sync_status: "created from template",
      last_sync_direction: "web_to_sheet",
      created_by: params.actorId,
    })
    .select("id, sheet_name, spreadsheet_url")
    .single();
  if (linkErr) throw new Error(linkErr.message);

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_email: params.actorEmail,
    action: "sheet_create_tab",
    entity: "sheet_links",
    entity_id: createdLink.id,
    details: {
      block_id: params.newBlockId,
      template_link_id: template.id,
      template_tab: sourceTab.title,
      new_tab: actualTabName,
      layout_source: "website_block_settings",
    },
  });

  return {
    link_id: createdLink.id as string,
    sheet_name: createdLink.sheet_name as string,
    spreadsheet_url: createdLink.spreadsheet_url as string,
    cleared_ranges: 1,
    headers_updated: 5,
  };
}

/**
 * Deletes linked Google Sheet tabs belonging to a block being deleted.
 * Never deletes the sole remaining tab in a spreadsheet (Google Sheets disallows it),
 * and preserves one template link row if no other link exists for that spreadsheet.
 */
export async function deleteLinkedSheetTabsForBlock(params: {
  blockId: string;
  institution: "MII" | "MIU";
  actorId: string;
  actorEmail: string | null;
}): Promise<{ deletedTabs: string[]; warnings: string[] }> {
  const { data: links, error } = await supabaseAdmin
    .from("sheet_links")
    .select("id, spreadsheet_id, spreadsheet_url, sheet_name")
    .eq("block_id", params.blockId)
    .eq("institution", params.institution);
  if (error) throw new Error(error.message);
  if (!links || links.length === 0) return { deletedTabs: [], warnings: [] };

  const deletedTabs: string[] = [];
  const warnings: string[] = [];

  const bySpreadsheet = new Map<string, typeof links>();
  for (const l of links) {
    const list = bySpreadsheet.get(l.spreadsheet_id) ?? [];
    list.push(l);
    bySpreadsheet.set(l.spreadsheet_id, list);
  }

  for (const [spreadsheetId, groupLinks] of bySpreadsheet.entries()) {
    try {
      const meta = await fetchSpreadsheetMeta(spreadsheetId);
      let remainingSheets = [...meta.sheets];

      // Count other link rows for this spreadsheet in the same institution so we know
      // whether we need to keep one detached template link row after deleting these tabs.
      const deletingIds = new Set(groupLinks.map((l) => l.id));
      const { data: allSpreadsheetLinks } = await supabaseAdmin
        .from("sheet_links")
        .select("id")
        .eq("institution", params.institution)
        .eq("spreadsheet_id", spreadsheetId);
      let otherLinksCount = (allSpreadsheetLinks ?? []).filter((r: any) => !deletingIds.has(r.id)).length;

      for (const link of groupLinks) {
        const preferredGid = parseSpreadsheetGid(link.spreadsheet_url);
        const targetTab =
          remainingSheets.find((s) => s.title === link.sheet_name) ??
          (preferredGid !== null
            ? remainingSheets.find((s) => s.sheetId === preferredGid)
            : undefined);

        if (!targetTab) {
          // Tab was already removed in Google Sheets; clean up the link row unless we need a template row
          clearSheetMapCache(link.id);
          if (otherLinksCount === 0 && remainingSheets.length > 0) {
            const fallback = remainingSheets[remainingSheets.length - 1]!;
            await supabaseAdmin
              .from("sheet_links")
              .update({
                block_id: null,
                label: fallback.title,
                sheet_name: fallback.title,
                spreadsheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${fallback.sheetId}`,
                last_sync_status: "saved as template",
                updated_at: new Date().toISOString(),
              })
              .eq("id", link.id);
            otherLinksCount += 1;
          } else {
            await supabaseAdmin.from("sheet_links").delete().eq("id", link.id);
          }
          continue;
        }

        if (remainingSheets.length <= 1) {
          warnings.push(
            `Kept "${targetTab.title}" in Google Sheets because it is the only tab left in the spreadsheet.`,
          );
          await supabaseAdmin
            .from("sheet_links")
            .update({
              block_id: null,
              last_sync_status: "kept as template (only tab in spreadsheet)",
              updated_at: new Date().toISOString(),
            })
            .eq("id", link.id);
          clearSheetMapCache(link.id);
          otherLinksCount += 1;
          continue;
        }

        await sheetsRequest(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({
            requests: [{ deleteSheet: { sheetId: targetTab.sheetId } }],
          }),
        });
        remainingSheets = remainingSheets.filter((s) => s.sheetId !== targetTab.sheetId);
        clearSheetMapCache(link.id);
        deletedTabs.push(targetTab.title);

        if (otherLinksCount === 0 && remainingSheets.length > 0) {
          const fallback = remainingSheets[remainingSheets.length - 1]!;
          await supabaseAdmin
            .from("sheet_links")
            .update({
              block_id: null,
              label: fallback.title,
              sheet_name: fallback.title,
              spreadsheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${fallback.sheetId}`,
              last_sync_status: "saved as template",
              updated_at: new Date().toISOString(),
            })
            .eq("id", link.id);
          otherLinksCount += 1;
        } else {
          await supabaseAdmin.from("sheet_links").delete().eq("id", link.id);
        }

        await supabaseAdmin.from("audit_logs").insert({
          actor_id: params.actorId,
          actor_email: params.actorEmail,
          action: "sheet_delete_tab",
          entity: "sheet_links",
          entity_id: link.id,
          details: {
            block_id: params.blockId,
            spreadsheet_id: spreadsheetId,
            deleted_tab: targetTab.title,
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed deleting sheet tabs for block ${params.blockId}:`, msg);
      warnings.push(`Could not delete linked Google Sheet tab: ${msg}`);
    }
  }

  return { deletedTabs, warnings };
}

/**
 * Removes (when locking/closing a block) or restores (when reopening a block)
 * attendance dropdown data-validation rules on every Google Sheet tab linked to `blockIds`.
 * Existing marks and formulas remain untouched.
 */
export async function syncSheetDropdownsForBlockStatus(params: {
  blockIds: string[];
  institution: "MII" | "MIU";
  mode: "remove" | "restore";
  actorId: string;
  actorEmail: string | null;
}): Promise<{ updatedTabs: string[]; warnings: string[] }> {
  if (params.blockIds.length === 0) return { updatedTabs: [], warnings: [] };

  const { data: links, error } = await supabaseAdmin
    .from("sheet_links")
    .select("id, block_id, spreadsheet_id, spreadsheet_url, sheet_name, block:blocks(start_date)")
    .in("block_id", params.blockIds)
    .eq("institution", params.institution);
  if (error) throw new Error(error.message);
  if (!links || links.length === 0) return { updatedTabs: [], warnings: [] };

  const updatedTabs: string[] = [];
  const warnings: string[] = [];

  const metaCache = new Map<string, Awaited<ReturnType<typeof fetchSpreadsheetMeta>>>();

  for (const link of links) {
    try {
      let meta = metaCache.get(link.spreadsheet_id);
      if (!meta) {
        meta = await fetchSpreadsheetMeta(link.spreadsheet_id);
        metaCache.set(link.spreadsheet_id, meta);
      }
      const preferredGid = parseSpreadsheetGid(link.spreadsheet_url);
      const targetTab =
        meta.sheets.find((s) => s.title === link.sheet_name) ??
        (preferredGid !== null ? meta.sheets.find((s) => s.sheetId === preferredGid) : undefined);
      if (!targetTab) {
        warnings.push(`Tab "${link.sheet_name}" was not found in Google Sheets.`);
        continue;
      }

      const blockStartDate = ((link as any).block as { start_date?: string } | null)?.start_date ?? localTodayIso();
      const [headerRows, leftRows] = await Promise.all([
        fetchSheetValues(link.spreadsheet_id, targetTab.title, "A1:AZZ8", "FORMULA"),
        fetchSheetValues(link.spreadsheet_id, targetTab.title, "A1:H450", "FORMULA"),
      ]);

      const layout = parseSheetColumns(headerRows, blockStartDate);
      const requests = buildDropdownValidationRequests({
        sheetId: targetTab.sheetId,
        layout,
        leftRows,
        rowCount: targetTab.rowCount,
        mode: params.mode,
      });
      if (requests.length === 0) {
        warnings.push(`No attendance columns found on "${targetTab.title}" to update dropdowns.`);
        continue;
      }

      await sheetsRequest(`/spreadsheets/${link.spreadsheet_id}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests }),
      });

      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("sheet_links")
        .update({
          last_synced_at: nowIso,
          last_sync_status:
            params.mode === "remove"
              ? "locked (dropdowns removed)"
              : "open (dropdowns restored)",
          last_sync_direction: "web_to_sheet",
          updated_at: nowIso,
        })
        .eq("id", link.id);

      await supabaseAdmin.from("audit_logs").insert({
        actor_id: params.actorId,
        actor_email: params.actorEmail,
        action: params.mode === "remove" ? "sheet_lock_dropdowns" : "sheet_restore_dropdowns",
        entity: "sheet_links",
        entity_id: link.id,
        details: {
          block_id: link.block_id,
          sheet_name: targetTab.title,
          ranges_updated: requests.length,
        },
      });

      updatedTabs.push(targetTab.title);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed updating dropdowns for link ${link.id}:`, msg);
      warnings.push(`Could not update dropdowns on "${link.sheet_name}": ${msg}`);
    }
  }

  return { updatedTabs, warnings };
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
  signature: string;
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
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:AZZ8"),
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
    const no = layout.studentNoCol >= 0 ? String(row[layout.studentNoCol] ?? "") : "";
    const last = layout.lastNameCol >= 0 ? String(row[layout.lastNameCol] ?? "") : "";
    const first = layout.firstNameCol >= 0 ? String(row[layout.firstNameCol] ?? "") : "";
    const email = layout.emailCol >= 0 ? String(row[layout.emailCol] ?? "") : "";
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
    signature: headerRows[1]?.[layout.columns[0]?.colIndex ?? 6] ?? "",
  };
  sheetMapCache.set(link.id, entry);
  return entry;
}

type RegisterLink = { id: string; spreadsheet_id: string; sheet_name: string; institution: "MII" | "MIU" };
type RegisterRecord = Pick<AttendanceRecord, "student_id" | "session_date" | "slot" | "points" | "status">;

async function registerRecords(blockId: string, studentIds?: string[]): Promise<RegisterRecord[]> {
  return fetchAllRows<RegisterRecord>(() => {
    let query = supabaseAdmin.from("attendance")
      .select("student_id, session_date, slot, points, status").eq("block_id", blockId).order("id");
    if (studentIds?.length && studentIds.length <= 100) query = query.in("student_id", studentIds);
    return query;
  });
}

function summaryUpdates(link: RegisterLink, block: RegisterBlock, map: CachedSheetMap, records: RegisterRecord[], ids?: Set<string>) {
  const register = buildWebsiteRegister(block, map.layout);
  const byStudent = new Map<string, RegisterRecord[]>();
  for (const record of records) {
    const list = byStudent.get(record.student_id) ?? [];
    list.push(record);
    byStudent.set(record.student_id, list);
  }
  return [...map.rowByStudentId.entries()].filter(([id]) => !ids || ids.has(id)).flatMap(([id, row]) =>
    buildRegisterSummaryValues(block, register, byStudent.get(id) ?? []).map(({ column, value }) => ({
      range: `${quoteSheet(link.sheet_name)}!${colIndexToLetter(column)}${row}`, values: [[value]],
    })));
}

/** Rebuild only unsettled registers. Closed historical tabs retain their original layout and values. */
async function prepareWebsiteRegister(link: RegisterLink, block: Block, force = false): Promise<CachedSheetMap> {
  let map = await loadSheetMap({ ...link, block_start_date: block.start_date });
  if (!force && (block.status === "closed" || map.signature === registerSignature(block))) return map;
  const meta = await fetchSpreadsheetMeta(link.spreadsheet_id);
  const tab = meta.sheets.find((s) => s.title === link.sheet_name);
  if (!tab) throw new Error(`Tab "${link.sheet_name}" was not found.`);
  const register = buildWebsiteRegister(block, map.layout);
  const leftRows = await fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:H450", "FORMULA");
  const endColumn = Math.max(tab.columnCount, register.columnCount);
  await sheetsRequest(`/spreadsheets/${link.spreadsheet_id}:batchUpdate`, {
    method: "POST", body: JSON.stringify({ requests: [
      { updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: {
        columnCount: endColumn, frozenRowCount: 5, frozenColumnCount: register.startColumn,
      } }, fields: "gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
      { unmergeCells: { range: { sheetId: tab.sheetId } } },
      { repeatCell: { range: { sheetId: tab.sheetId, startColumnIndex: register.startColumn, endColumnIndex: endColumn },
        cell: {}, fields: "userEnteredValue,dataValidation" } },
      // Old template thresholds/rounding colors must not keep styling the new schedule or website percentages.
      ...tab.conditionalFormats.flatMap((rule, index) => rule.ranges.some((range) =>
        (range.endColumnIndex ?? tab.columnCount) > register.startColumn)
        ? [{ deleteConditionalFormatRule: { sheetId: tab.sheetId, index } }] : []).reverse(),
      { copyPaste: { source: { sheetId: tab.sheetId, startRowIndex: 5, endRowIndex: tab.rowCount,
        startColumnIndex: register.startColumn, endColumnIndex: register.startColumn + 1 },
        destination: { sheetId: tab.sheetId, startRowIndex: 5, endRowIndex: tab.rowCount,
          startColumnIndex: register.startColumn, endColumnIndex: endColumn }, pasteType: "PASTE_FORMAT" } },
      ...(endColumn > register.columnCount ? [{ deleteDimension: { range: { sheetId: tab.sheetId,
        dimension: "COLUMNS", startIndex: register.columnCount, endIndex: endColumn } } }] : []),
      { updateDimensionProperties: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 },
        properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
      { updateDimensionProperties: { range: { sheetId: tab.sheetId, dimension: "COLUMNS",
        startIndex: register.startColumn, endIndex: register.columnCount }, properties: { pixelSize: 105 }, fields: "pixelSize" } },
      ...[...register.weekly.flatMap((w) => [w.pointsColumn, w.cumulativeColumn]), register.pointsColumn, register.percentageColumn]
        .map((column) => ({ updateDimensionProperties: { range: { sheetId: tab.sheetId, dimension: "COLUMNS",
          startIndex: column, endIndex: column + 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } })),
      { repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 5,
        startColumnIndex: register.startColumn, endColumnIndex: register.columnCount },
        cell: { userEnteredFormat: { wrapStrategy: "WRAP", horizontalAlignment: "CENTER" } },
        fields: "userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment" } },
      { mergeCells: { range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1,
        startColumnIndex: register.startColumn, endColumnIndex: register.columnCount }, mergeType: "MERGE_ALL" } },
      { updateDimensionProperties: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 44 }, fields: "pixelSize" } },
      ...buildDropdownValidationRequests({ sheetId: tab.sheetId, layout: register.layout, leftRows,
        rowCount: tab.rowCount, mode: block.status === "closed" ? "remove" : "restore" }),
    ] }),
  });
  await batchUpdateCells(link.spreadsheet_id, [{
    range: `${quoteSheet(link.sheet_name)}!${colIndexToLetter(register.startColumn)}1:${colIndexToLetter(register.columnCount - 1)}5`,
    values: register.headers,
  }]);
  clearSheetMapCache(link.id);
  map = await loadSheetMap({ ...link, block_start_date: block.start_date });
  const records = await registerRecords(block.id);
  const updates = records.flatMap((r) => {
    const row = map.rowByStudentId.get(r.student_id);
    const column = map.colByKey.get(`${r.session_date}:${r.slot}`);
    return row && column ? [{ range: `${quoteSheet(link.sheet_name)}!${column}${row}`, values: [[r.points]] }] : [];
  });
  const allUpdates = [...updates, ...summaryUpdates(link, block, map, records)];
  for (let i = 0; i < allUpdates.length; i += 500) await batchUpdateCells(link.spreadsheet_id, allUpdates.slice(i, i + 500));
  return map;
}

export async function syncWebsiteRegisterSettings(blockId: string, institution: "MII" | "MIU"): Promise<string[]> {
  const [{ data: block }, { data: links }] = await Promise.all([
    supabaseAdmin.from("blocks").select("*").eq("id", blockId).eq("institution", institution).maybeSingle(),
    supabaseAdmin.from("sheet_links").select("id, spreadsheet_id, sheet_name, institution")
      .eq("block_id", blockId).eq("institution", institution).eq("enabled", true),
  ]);
  if (!block || block.status === "closed") return [];
  const warnings: string[] = [];
  for (const link of links ?? []) {
    try {
      clearSheetMapCache(link.id);
      const map = await prepareWebsiteRegister(link, block as Block);
      await batchUpdateCells(link.spreadsheet_id, summaryUpdates(link, block as Block, map, await registerRecords(blockId)));
    }
    catch (err) { warnings.push(err instanceof Error ? err.message : String(err)); }
  }
  return warnings;
}

async function refreshRegisterSummaries(link: RegisterLink, blockId: string): Promise<void> {
  const { data: block } = await supabaseAdmin.from("blocks").select("*")
    .eq("id", blockId).eq("institution", link.institution).maybeSingle();
  if (!block || block.status === "closed") return;
  const map = await prepareWebsiteRegister(link, block as Block);
  await batchUpdateCells(link.spreadsheet_id, summaryUpdates(link, block as Block, map, await registerRecords(blockId)));
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
    .select("id, institution, spreadsheet_id, sheet_name, block:blocks(*)")
    .eq("block_id", blockId)
    .eq("enabled", true);

  if (!links || links.length === 0) return;

  await Promise.all(
    links.map(async (raw: any) => {
      const startDate = raw.block?.start_date as string | undefined;
      if (!startDate) return;
      try {
        if (raw.block.status === "closed") return;
        const map = await prepareWebsiteRegister(raw, raw.block as Block);
        const updates: { range: string; values: (string | number)[][] }[] = [];
        for (const m of marks) {
          const rowNum = map.rowByStudentId.get(m.student_id);
          const colLetter = map.colByKey.get(`${m.session_date}:${m.slot}`);
          if (!rowNum || !colLetter) continue;
          updates.push({
            range: `${quoteSheet(raw.sheet_name)}!${colLetter}${rowNum}`,
            values: [[m.points === null ? "" : m.points]],
          });
        }
        if (updates.length > 0) {
          const ids = new Set(marks.map((m) => m.student_id));
          updates.push(...summaryUpdates(raw, raw.block as Block, map, await registerRecords(blockId, [...ids]), ids));
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
    fetchSheetValues(params.spreadsheetId, chosen.title, "A1:AZZ8"),
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
    const no = layout.studentNoCol >= 0 ? String(row[layout.studentNoCol] ?? "").trim() : "";
    const last = layout.lastNameCol >= 0 ? String(row[layout.lastNameCol] ?? "").trim() : "";
    const first = layout.firstNameCol >= 0 ? String(row[layout.firstNameCol] ?? "").trim() : "";
    const email = layout.emailCol >= 0 ? String(row[layout.emailCol] ?? "").trim() : "";
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
    .select("*, block:blocks(*)")
    .eq("id", params.linkId)
    .eq("institution", params.institution)
    .maybeSingle();
  if (error || !link) throw new Error("Linked spreadsheet not found.");
  const block = (link as any).block as Block | null;
  if (!block) throw new Error("Block not found for this sheet link.");

  clearSheetMapCache(link.id);

  if (params.direction === "push") {
    if (block.status === "closed") throw new Error("Closed historical registers are preserved. Reopen the block before updating its sheet.");
    const [map, records] = await Promise.all([
      prepareWebsiteRegister(link, block),
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

    const markCount = updates.length;
    updates.push(...summaryUpdates(link, block, map, await registerRecords(block.id)));

    // Chunk in batches of 500 to stay well within Google Sheets payload limits
    for (let i = 0; i < updates.length; i += 500) {
      await batchUpdateCells(link.spreadsheet_id, updates.slice(i, i + 500));
    }

    await supabaseAdmin
      .from("sheet_links")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: `ok (pushed ${markCount} marks and updated website totals)`,
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
      details: { block_id: block.id, sheet_name: link.sheet_name, cells_updated: updates.length, marks_updated: markCount },
    });

    return { updated: markCount, direction: "push" as const };
  }

  // PULL: Google Sheets -> Website
  if (block.status === "closed") throw new Error("Cannot pull marks into a closed block.");
  const [rows, students] = await Promise.all([
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:AZZ450"),
    loadInstitutionStudents(params.institution),
  ]);
  const layout = parseSheetColumns(rows, block.start_date);
  const schedule = blockSessions(block);
  const allowedSessions = new Set([...schedule.compulsory, ...schedule.optional].map((s) => `${s.date}:${s.slot}`));
  const matcher = createStudentMatcher(students);
  const today = localTodayIso();

  // Detect which session columns actually have at least one non-zero mark so we
  // never import pre-filled template 0.0 cells from unstarted/future sessions.
  const activeCols = new Set<number>();
  for (const col of layout.columns) {
    if (!allowedSessions.has(`${col.date}:${col.slot}`)) continue;
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
    const no = layout.studentNoCol >= 0 ? String(row[layout.studentNoCol] ?? "") : "";
    const last = layout.lastNameCol >= 0 ? String(row[layout.lastNameCol] ?? "") : "";
    const first = layout.firstNameCol >= 0 ? String(row[layout.firstNameCol] ?? "") : "";
    const email = layout.emailCol >= 0 ? String(row[layout.emailCol] ?? "") : "";
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

  await refreshRegisterSummaries(link, block.id);

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
    fetchSheetValues(link.spreadsheet_id, link.sheet_name, "A1:AZZ8"),
    loadInstitutionStudents(link.institution),
  ]);
  const { data: block } = await supabaseAdmin.from("blocks").select("*")
    .eq("id", link.block_id).eq("institution", link.institution).maybeSingle();
  if (!block || block.status === "closed") return { applied: 0, skipped: edits.length, reason: "block_closed" };
  const schedule = blockSessions(block as Block);
  const allowedSessions = new Set([...schedule.compulsory, ...schedule.optional].map((s) => `${s.date}:${s.slot}`));
  const layout = parseSheetColumns(headerRows, link.block.start_date);
  const colByIndex = new Map(layout.columns.map((c) => [c.colIndex, c]));
  const matcher = createStudentMatcher(students);

  let applied = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const edit of edits) {
    const col = colByIndex.get(edit.col - 1); // Apps Script col is 1-based
    if (!col || !allowedSessions.has(`${col.date}:${col.slot}`)) {
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

  if (applied > 0) await refreshRegisterSummaries(link, link.block_id);

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