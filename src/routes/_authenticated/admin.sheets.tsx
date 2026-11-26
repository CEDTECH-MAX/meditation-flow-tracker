import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Spinner } from "@/components/ui-kit";
import { formatDate } from "@/lib/attendance";
import { pickActive, useBlocks } from "@/lib/admin-hooks";
import {
  createSheetLink,
  deleteSheetLink,
  inspectGoogleSheet,
  listSheetLinks,
  runManualSheetSync,
  toggleSheetLink,
} from "@/lib/sheet-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/sheets")({
  head: () => ({
    meta: [
      { title: "Google Sheet Sync · Administration" },
      {
        name: "description",
        content: "Connect Google Sheets to attendance blocks for automatic two-way marking sync.",
      },
      { property: "og:title", content: "Google Sheet Sync" },
      {
        property: "og:description",
        content: "Keep attendance marks synced between the website and Google Sheets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSheets,
});

function AdminSheets() {
  const qc = useQueryClient();
  const { data: blocks, isLoading: blocksLoading } = useBlocks();
  const listFn = useServerFn(listSheetLinks);
  const inspectFn = useServerFn(inspectGoogleSheet);
  const createFn = useServerFn(createSheetLink);
  const toggleFn = useServerFn(toggleSheetLink);
  const deleteFn = useServerFn(deleteSheetLink);
  const syncFn = useServerFn(runManualSheetSync);

  const { data: links, isLoading: linksLoading } = useQuery({
    queryKey: ["sheet-links"],
    queryFn: () => listFn(),
  });

  const [blockId, setBlockId] = useState("");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [openScriptId, setOpenScriptId] = useState<string | null>(null);

  useEffect(() => {
    if (!blockId && blocks && blocks.length > 0) {
      const active = pickActive(blocks);
      if (active) setBlockId(active.id);
    }
  }, [blockId, blocks]);

  const inspect = useMutation({
    mutationFn: (vars: { sheet_name?: string }) =>
      inspectFn({
        data: {
          spreadsheet_url: url.trim(),
          block_id: blockId,
          ...(vars.sheet_name ? { sheet_name: vars.sheet_name } : {}),
        },
      }),
    onSuccess: (res) => {
      setSelectedSheet(res.selected_sheet);
      if (!label.trim()) setLabel(res.selected_sheet);
      toast.success(`Found ${res.mapped_sessions} session columns and matched ${res.matched_students} of ${res.sheet_students} students.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          block_id: blockId,
          label: label.trim() || selectedSheet,
          spreadsheet_url: url.trim(),
          sheet_name: selectedSheet,
        },
      }),
    onSuccess: (created: any) => {
      toast.success("Google Sheet linked. Website marks now sync to it automatically.");
      setUrl("");
      setLabel("");
      setSelectedSheet("");
      inspect.reset();
      setOpenScriptId(created.id);
      qc.invalidateQueries({ queryKey: ["sheet-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) => toggleFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sheet-links"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Google Sheet unlinked.");
      qc.invalidateQueries({ queryKey: ["sheet-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const manualSync = useMutation({
    mutationFn: (vars: { id: string; direction: "push" | "pull" }) => syncFn({ data: vars }),
    onSuccess: (res) => {
      if (res.direction === "push") {
        toast.success(`Pushed ${res.updated} attendance mark${res.updated === 1 ? "" : "s"} to Google Sheets.`);
      } else {
        toast.success(`Pulled ${res.updated} mark${res.updated === 1 ? "" : "s"} from Google Sheets.`);
      }
      qc.invalidateQueries({ queryKey: ["sheet-links"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyScript(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Apps Script copied. Paste it in Google Sheets under Extensions -> Apps Script.");
    } catch {
      toast.error("Could not copy automatically — select the code box and copy manually.");
    }
  }

  const preview = inspect.data;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Google Sheet sync"
        subtitle="Link your Google Sheets register to a block so dropdown marks stay synced both ways between the website and your spreadsheet."
      />

      <Card className="space-y-4">
        <h3 className="text-base font-semibold">Connect a Google Sheet</h3>
        {blocksLoading ? (
          <Spinner label="Loading blocks" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Block">
              <Select value={blockId} onChange={(e) => { setBlockId(e.target.value); inspect.reset(); }}>
                {(blocks ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({formatDate(b.start_date)} – {formatDate(b.end_date)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Google Sheet URL">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => inspect.mutate({})}
            disabled={!blockId || !url.trim() || inspect.isPending}
          >
            {inspect.isPending ? "Checking sheet…" : "Inspect sheet"}
          </Button>
          <span className="text-xs text-muted-foreground">
            We read the tab headers and match students by Student No or Name before linking.
          </span>
        </div>

        {preview ? (
          <div className="glass-muted space-y-4 rounded-2xl border border-border/60 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Spreadsheet tab">
                <Select
                  value={selectedSheet}
                  onChange={(e) => {
                    setSelectedSheet(e.target.value);
                    inspect.mutate({ sheet_name: e.target.value });
                  }}
                >
                  {preview.sheets.map((s) => (
                    <option key={s.sheetId} value={s.title}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Display label">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. MI 21 B Gents Meditators" />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={preview.matched_students > 0 ? "green" : "amber"}>
                {preview.matched_students} / {preview.sheet_students} students matched
              </Badge>
              <Badge tone={preview.mapped_sessions > 0 ? "green" : "amber"}>
                {preview.mapped_sessions} session columns mapped
              </Badge>
            </div>

            {preview.unmatched_sample.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Unmatched sample: {preview.unmatched_sample.join(", ")}
              </p>
            ) : null}

            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || preview.mapped_sessions === 0}
            >
              {create.isPending ? "Linking…" : "Link this Google Sheet"}
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="space-y-4">
        <h3 className="text-base font-semibold">Connected sheets</h3>
        {linksLoading ? (
          <Spinner label="Loading connected sheets" />
        ) : !links || links.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              No Google Sheets connected yet. Paste a spreadsheet link above to start syncing.
            </p>
          </Card>
        ) : (
          links.map((link: any) => (
            <Card key={link.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">{link.label}</h4>
                    <Badge tone={!link.block ? "amber" : link.enabled ? "green" : "neutral"}>
                      {!link.block ? "Saved template" : link.enabled ? "Live sync on" : "Paused"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {link.block ? `Block: ${link.block.name}` : "Template saved (previous block deleted)"} · Tab:{" "}
                    {link.sheet_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {link.last_synced_at
                      ? `Last sync: ${new Date(link.last_synced_at).toLocaleString()} · ${link.last_sync_status ?? "ok"}`
                      : "Not synced yet"}
                  </p>
                </div>
                <a
                  href={link.spreadsheet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Open sheet <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="flex flex-wrap gap-2">
                {link.block ? (
                  <>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={manualSync.isPending}
                      onClick={() => manualSync.mutate({ id: link.id, direction: "push" })}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Push website → sheet
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={manualSync.isPending}
                      onClick={() => manualSync.mutate({ id: link.id, direction: "pull" })}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Pull sheet → website
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenScriptId(openScriptId === link.id ? null : link.id)}
                >
                  {openScriptId === link.id ? "Hide Sheet → Web script" : "Sheet → Web live script"}
                </Button>
                {link.block ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: link.id, enabled: !link.enabled })}
                  >
                    {link.enabled ? "Pause" : "Resume"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Unlink "${link.label}"? Your spreadsheet will not be deleted.`)) {
                      remove.mutate(link.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Unlink
                </Button>
              </div>

              {openScriptId === link.id ? (
                <div className="glass-muted space-y-3 rounded-2xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Enable live Sheet → Website sync (one-time setup)</p>
                    <Button size="sm" onClick={() => copyScript(link.apps_script)}>
                      <Copy className="h-3.5 w-3.5" /> Copy script
                    </Button>
                  </div>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Open your Google Sheet and click <strong>Extensions → Apps Script</strong>.</li>
                    <li>Replace any code in the editor with the script below and click <strong>Save</strong>.</li>
                    <li>Select <strong>setupAutoSync</strong> in the top bar and click <strong>Run</strong> once to allow permission.</li>
                    <li>Done — every dropdown change on linked block tabs in this spreadsheet (including new tabs created from <strong>Meditation blocks</strong>) now updates the website automatically.</li>
                  </ol>
                  <pre className="max-h-60 overflow-auto rounded-xl border border-border/60 bg-background/70 p-3 text-[11px] leading-relaxed">
                    {link.apps_script}
                  </pre>
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}