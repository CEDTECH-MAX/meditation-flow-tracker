import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, SectionTitle, Spinner } from "@/components/ui-kit";
import { AttachmentLinks } from "@/components/AttachmentLinks";
import { supabase } from "@/integrations/supabase/client";
import {
  ADVISOR_BUCKET,
  askAdvisor,
  listAdvisorMessages,
  type AdvisorAttachment,
  type AdvisorMessage,
} from "@/lib/advisor.functions";

export const Route = createFileRoute("/_authenticated/advisor")({
  head: () => ({
    meta: [
      { title: "AI Advisor · Meditation Attendance" },
      {
        name: "description",
        content:
          "Ask the meditation advisor anything about meditation and your attendance, or report sickness with a sick note.",
      },
      { property: "og:title", content: "Meditation AI Advisor" },
      {
        property: "og:description",
        content: "Meditation guidance, attendance help and sick reports sent straight to your administrator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdvisorPage,
});

const SUGGESTIONS = [
  "Can I skip meditation tomorrow?",
  "How can I meditate more deeply?",
  "I'm sick today and can't attend",
];

const MAX_BYTES = 10 * 1024 * 1024;

function AdvisorPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdvisorMessages);
  const askFn = useServerFn(askAdvisor);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["advisor-messages"],
    queryFn: () => listFn() as Promise<AdvisorMessage[]>,
  });

  const ask = useMutation({
    mutationFn: async ({ message, files }: { message: string; files: File[] }) => {
      const attachments: AdvisorAttachment[] = [];
      if (files.length) {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error("Please sign in again.");
        for (const f of files) {
          const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
          const path = `${uid}/${Date.now()}-${safe}`;
          const { error } = await supabase.storage
            .from(ADVISOR_BUCKET)
            .upload(path, f, { contentType: f.type || "application/octet-stream" });
          if (error) throw new Error(`Could not upload ${f.name}: ${error.message}`);
          attachments.push({ path, name: f.name, type: f.type || "file" });
        }
      }
      return askFn({ data: { message, attachments } });
    },
    onSuccess: (r) => {
      if (r.reported) toast.success("Your administrator has been notified.");
      qc.invalidateQueries({ queryKey: ["advisor-messages"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["advisor-messages"] });
    },
    onSettled: () => inputRef.current?.focus(),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  function send(text: string) {
    const value = text.trim();
    if ((!value && files.length === 0) || ask.isPending) return;
    const f = files;
    setInput("");
    setFiles([]);
    ask.mutate({ message: value, files: f });
  }

  function pick(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is larger than 10 MB.`);
        continue;
      }
      if (next.length >= 5) break;
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <AppShell>
      <SectionTitle
        title="AI Advisor"
        subtitle="Ask anything about meditation or your attendance. If you're sick, tell me and attach your note — I'll notify your administrator."
      />

      <Card className="flex h-[62vh] min-h-[420px] flex-col p-0">
        <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {isLoading ? (
            <Spinner label="Loading your conversation" />
          ) : (messages ?? []).length === 0 ? (
            <div className="glass-muted rounded-2xl px-4 py-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Namaste 🙏</p>
              <p className="mt-1">
                Ask me about your practice, stress, sleep, routines or your attendance. If you're
                sick or something has come up, tell me — I'll let your administrator know, and you
                can attach a sick note with the paperclip. I never change your official record.
              </p>
            </div>
          ) : (
            (messages ?? []).map((m) => (
              <div
                key={m.id}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-soft"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-2.5 text-sm text-accent-foreground"
                  }
                >
                  {m.content}
                  <AttachmentLinks attachments={m.attachments} />
                </div>
              </div>
            ))
          )}
          {ask.isPending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-accent px-4 py-2.5 text-sm text-muted-foreground">
                Thinking…
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border/60 px-4 py-3 sm:px-5">
          <div className="mb-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={ask.isPending}
                onClick={() => send(s)}
                className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition hover:bg-accent disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground"
                >
                  <Paperclip className="h-3 w-3" />
                  {f.name}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => pick(e.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="Attach a file"
              disabled={ask.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <textarea
              ref={inputRef}
              rows={2}
              maxLength={2000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask anything about meditation, or tell me if you're sick…"
              className="min-h-[44px] w-full resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <Button type="submit" disabled={ask.isPending || (!input.trim() && files.length === 0)}>
              Send
            </Button>
          </form>
        </div>
      </Card>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        The advisor offers guidance only. Attendance records and excusals are managed by the
        administrator.
      </p>
    </AppShell>
  );
}
