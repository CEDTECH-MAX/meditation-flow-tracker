import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button, Card, ErrorState, SectionTitle, Spinner } from "@/components/ui-kit";
import { askAdvisor, listAdvisorMessages, type AdvisorMessage } from "@/lib/advisor.functions";

export const Route = createFileRoute("/_authenticated/advisor")({
  head: () => ({
    meta: [
      { title: "AI Advisor · Meditation Attendance" },
      {
        name: "description",
        content:
          "Ask the meditation attendance advisor whether you can afford to miss a session and stay above the 80% requirement.",
      },
      { property: "og:title", content: "Meditation Attendance AI Advisor" },
      {
        property: "og:description",
        content: "Personal guidance on your meditation attendance, based on your own recorded points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdvisorPage,
});

const SUGGESTIONS = [
  "Can I skip meditation tomorrow?",
  "How many sessions can I still miss?",
  "How am I doing this block?",
];

function AdvisorPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdvisorMessages);
  const askFn = useServerFn(askAdvisor);
  const [input, setInput] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["advisor-messages"],
    queryFn: () => listFn() as Promise<AdvisorMessage[]>,
  });

  const ask = useMutation({
    mutationFn: (message: string) => askFn({ data: { message } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["advisor-messages"] }),
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
    if (!value || ask.isPending) return;
    setInput("");
    ask.mutate(value);
  }

  return (
    <AppShell>
      <SectionTitle
        title="AI Advisor"
        subtitle="Ask about your own attendance. Your conversation is saved permanently."
      />

      <Card className="flex h-[62vh] min-h-[420px] flex-col p-0">
        <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {error ? (
            <ErrorState
              title="Your conversation could not be loaded"
              error={error}
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <Spinner label="Loading your conversation" />
          ) : (messages ?? []).length === 0 ? (
            <div className="glass-muted rounded-2xl px-4 py-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Namaste 🙏</p>
              <p className="mt-1">
                I can see your recorded meditation points for this block. Ask me whether you can
                afford to miss a session — I never change your official record.
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
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              maxLength={1000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Can I skip meditation tomorrow?"
              className="min-h-[44px] w-full resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <Button type="submit" disabled={ask.isPending || !input.trim()}>
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
