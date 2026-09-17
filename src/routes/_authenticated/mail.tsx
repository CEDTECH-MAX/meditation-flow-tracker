import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Archive,
  Inbox,
  Mail as MailIcon,
  PenSquare,
  Reply,
  ReplyAll,
  Search,
  Send,
  Star,
  Trash2,
  Forward,
  FileEdit,
} from "lucide-react";
import { AppShell, useMe } from "@/components/AppShell";
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner } from "@/components/ui-kit";
import { listDirectory, type DirectoryEntry } from "@/lib/directory.functions";
import {
  deleteMessage,
  getThread,
  listMailbox,
  markRead,
  moveMessage,
  sendMessage,
  toggleStar,
} from "@/lib/mail.functions";

export const Route = createFileRoute("/_authenticated/mail")({
  head: () => ({
    meta: [
      { title: "Internal Mail · Attendance Management" },
      {
        name: "description",
        content:
          "Internal mailbox for students, markers, staff and administrators: inbox, sent, drafts, archive and replies.",
      },
      { property: "og:title", content: "Internal mail" },
      {
        property: "og:description",
        content: "Write to anyone at your institution from your own mailbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MailPage,
});

type Folder = "inbox" | "sent" | "drafts" | "archive" | "trash";

const FOLDERS: { key: Folder; label: string; icon: any }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent items", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileEdit },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "trash", label: "Deleted items", icon: Trash2 },
];

function MailPage() {
  const { data: me } = useMe();
  const roles: string[] = ((me as any)?.roles as string[]) ?? [];
  const isMarker = roles.includes("marker");
  const isStaff = roles.includes("staff") && !me?.isAdmin && !isMarker;

  return (
    <AppShell admin={!!me?.isAdmin} marker={isMarker && !me?.isAdmin} staff={isStaff}>
      <Mailbox />
    </AppShell>
  );
}

function initials(name?: string | null) {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function when(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function Mailbox() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const myId = (me as any)?.userId as string | undefined;

  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [compose, setCompose] = useState<null | {
    draft_id?: string;
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    thread_id?: string;
    parent_id?: string;
  }>(null);

  const mailboxFn = useServerFn(listMailbox);
  const dirFn = useServerFn(listDirectory);

  const mailbox = useQuery({
    queryKey: ["mailbox", folder, search],
    queryFn: () => mailboxFn({ data: { folder, search: search || undefined } }),
  });
  const directory = useQuery({ queryKey: ["directory"], queryFn: () => dirFn() });

  const list = mailbox.data ?? [];
  const current = useMemo(() => list.find((m: any) => m.id === selected) ?? null, [list, selected]);

  const threadFn = useServerFn(getThread);
  const thread = useQuery({
    queryKey: ["thread", current?.thread_id],
    queryFn: () => threadFn({ data: { thread_id: current!.thread_id } }),
    enabled: !!current?.thread_id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mailbox"] });
    qc.invalidateQueries({ queryKey: ["thread"] });
  };

  const send = useMutation({
    mutationFn: useServerFn(sendMessage),
    onSuccess: (_r, vars: any) => {
      toast.success(vars?.data?.as_draft ? "Draft saved" : "Message sent");
      setCompose(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send the message"),
  });
  const read = useMutation({ mutationFn: useServerFn(markRead), onSuccess: refresh });
  const star = useMutation({ mutationFn: useServerFn(toggleStar), onSuccess: refresh });
  const move = useMutation({
    mutationFn: useServerFn(moveMessage),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteMessage),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
  });

  const people: DirectoryEntry[] = (directory.data ?? []).filter((p: any) => p.id !== myId);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name ?? "Unknown";

  function myRow(m: any) {
    return (m.recipients ?? []).find((r: any) => r.recipient_id === myId);
  }
  function isUnread(m: any) {
    const row = myRow(m);
    return !!row && !row.read_at;
  }
  function starred(m: any) {
    const row = myRow(m);
    return row ? row.is_starred : m.sender_starred;
  }

  function open(m: any) {
    setSelected(m.id);
    if (m.is_draft && m.sender_id === myId) {
      setCompose({
        draft_id: m.id,
        to: (m.recipients ?? []).filter((r: any) => r.kind === "to").map((r: any) => r.recipient_id),
        cc: (m.recipients ?? []).filter((r: any) => r.kind === "cc").map((r: any) => r.recipient_id),
        subject: m.subject === "(no subject)" ? "" : m.subject,
        body: m.body,
      });
      return;
    }
    if (isUnread(m)) read.mutate({ data: { message_ids: [m.id], read: true } });
  }

  function replyTo(m: any, all: boolean) {
    const others = all
      ? [
          m.sender_id,
          ...(m.recipients ?? []).map((r: any) => r.recipient_id).filter((id: string) => id !== myId),
        ]
      : [m.sender_id];
    setCompose({
      to: [...new Set(others.filter((id: string) => id !== myId))] as string[],
      cc: [],
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `\n\n———\n${m.sender?.full_name ?? "Sender"} wrote:\n${m.body}`,
      thread_id: m.thread_id,
      parent_id: m.id,
    });
  }

  function forward(m: any) {
    setCompose({
      to: [],
      cc: [],
      subject: m.subject.startsWith("Fw:") ? m.subject : `Fw: ${m.subject}`,
      body: `\n\n——— Forwarded message ———\nFrom: ${m.sender?.full_name ?? "Sender"}\nSubject: ${m.subject}\n\n${m.body}`,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Mail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Write to anyone at your institution — students, markers and staff.
          </p>
        </div>
        <Button
          onClick={() => setCompose({ to: [], cc: [], subject: "", body: "" })}
          className="gap-2"
        >
          <PenSquare className="h-4 w-4" /> New message
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[190px_320px_1fr]">
        {/* folders */}
        <Card className="h-fit space-y-1 p-2">
          {FOLDERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFolder(key);
                setSelected(null);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                folder === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </Card>

        {/* message list */}
        <Card className="space-y-2 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail"
              className="pl-9"
            />
          </div>

          {mailbox.isLoading ? (
            <Spinner label="Loading mail" />
          ) : list.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Nothing in {FOLDERS.find((f) => f.key === folder)?.label.toLowerCase()}.
            </p>
          ) : (
            <div className="max-h-[62vh] space-y-1 overflow-y-auto pr-1">
              {list.map((m: any) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => open(m)}
                  className={`w-full rounded-xl border border-transparent px-3 py-2 text-left transition hover:bg-accent ${
                    selected === m.id ? "border-border/60 bg-accent" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${isUnread(m) ? "font-semibold" : "font-medium"}`}
                    >
                      {folder === "sent" || folder === "drafts"
                        ? `To: ${(m.recipients ?? []).map((r: any) => r.person?.full_name ?? nameOf(r.recipient_id)).join(", ") || "no recipients"}`
                        : (m.sender?.full_name ?? "Unknown")}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {when(m.sent_at ?? m.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm ${isUnread(m) ? "text-foreground" : "text-muted-foreground"}`}>
                      {m.subject}
                    </span>
                    {starred(m) ? <Star className="h-3 w-3 shrink-0 text-gold" /> : null}
                    {m.is_draft ? <Badge tone="amber">Draft</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{m.body}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* reading pane */}
        <Card className="min-h-[40vh] space-y-4">
          {!current ? (
            <div className="grid h-full place-items-center py-16 text-center text-sm text-muted-foreground">
              <div>
                <MailIcon className="mx-auto mb-3 h-8 w-8 opacity-50" />
                Select a message to read it.
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">{current.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    {(current.recipients ?? []).length} recipient
                    {(current.recipients ?? []).length === 1 ? "" : "s"} ·{" "}
                    {new Date(current.sent_at ?? current.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => replyTo(current, false)} className="gap-1">
                    <Reply className="h-4 w-4" /> Reply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => replyTo(current, true)} className="gap-1">
                    <ReplyAll className="h-4 w-4" /> Reply all
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => forward(current)} className="gap-1">
                    <Forward className="h-4 w-4" /> Forward
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => star.mutate({ data: { message_id: current.id, starred: !starred(current) } })}
                    className="gap-1"
                  >
                    <Star className="h-4 w-4" /> {starred(current) ? "Unstar" : "Star"}
                  </Button>
                  {folder !== "archive" && !current.is_draft ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => move.mutate({ data: { message_ids: [current.id], folder: "archive" } })}
                      className="gap-1"
                    >
                      <Archive className="h-4 w-4" /> Archive
                    </Button>
                  ) : null}
                  {folder === "trash" || current.is_draft ? (
                    <Button size="sm" variant="danger" onClick={() => remove.mutate({ data: { message_id: current.id } })} className="gap-1">
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => move.mutate({ data: { message_ids: [current.id], folder: "trash" } })}
                      className="gap-1"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
                {(thread.data ?? [current]).map((m: any) => (
                  <div key={m.id} className="glass-muted rounded-2xl border border-border/60 p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {initials(m.sender?.full_name)}
                      </span>
                      <div className="leading-tight">
                        <p className="text-sm font-semibold">{m.sender?.full_name ?? "Unknown"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          To:{" "}
                          {(m.recipients ?? [])
                            .map((r: any) => r.person?.full_name ?? nameOf(r.recipient_id))
                            .join(", ") || "—"}
                        </p>
                      </div>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {new Date(m.sent_at ?? m.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        open={!!compose}
        onClose={() => setCompose(null)}
        title={compose?.draft_id ? "Edit draft" : "New message"}
      >
        {compose ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate({ data: { ...compose } });
            }}
          >
            <Field label="TO">
              <RecipientPicker
                people={people}
                value={compose.to}
                onChange={(to) => setCompose({ ...compose, to })}
              />
            </Field>
            <Field label="CC (OPTIONAL)">
              <RecipientPicker
                people={people}
                value={compose.cc}
                onChange={(cc) => setCompose({ ...compose, cc })}
              />
            </Field>
            <Field label="SUBJECT">
              <Input
                value={compose.subject}
                onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                placeholder="What is this about?"
              />
            </Field>
            <Field label="MESSAGE">
              <textarea
                rows={8}
                value={compose.body}
                onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                className="w-full rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm outline-none transition focus:border-primary"
                placeholder="Write your message…"
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCompose(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => send.mutate({ data: { ...compose, as_draft: true } })}
              >
                Save draft
              </Button>
              <Button type="submit" disabled={send.isPending} className="gap-2">
                <Send className="h-4 w-4" /> {send.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

function RecipientPicker({
  people,
  value,
  onChange,
}: {
  people: DirectoryEntry[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [pick, setPick] = useState("");
  const chosen = people.filter((p) => value.includes(p.id));

  return (
    <div className="space-y-2">
      {chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {chosen.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(value.filter((id) => id !== p.id))}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs text-secondary-foreground"
            >
              {p.full_name} ✕
            </button>
          ))}
        </div>
      ) : null}
      <Select
        value={pick}
        onChange={(e) => {
          const id = e.target.value;
          setPick("");
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
      >
        <option value="">Add someone…</option>
        {people
          .filter((p) => !value.includes(p.id))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} — {p.department ?? p.cohort ?? p.role}
            </option>
          ))}
      </Select>
    </div>
  );
}
