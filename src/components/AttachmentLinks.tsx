import { useServerFn } from "@tanstack/react-start";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { getAttachmentUrl, type AdvisorAttachment } from "@/lib/advisor.functions";

export function AttachmentLinks({
  attachments,
  messageId,
}: {
  attachments: AdvisorAttachment[] | null | undefined;
  messageId?: string;
}) {
  const fn = useServerFn(getAttachmentUrl);
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <button
          key={a.path}
          type="button"
          onClick={async () => {
            const w = window.open("", "_blank");
            try {
              const { url } = await fn({ data: { path: a.path, message_id: messageId } });
              if (w) w.location.href = url;
              else window.location.href = url;
            } catch (e) {
              w?.close();
              toast.error((e as Error).message);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-foreground transition hover:bg-accent"
        >
          <Paperclip className="h-3 w-3" />
          {a.name}
        </button>
      ))}
    </div>
  );
}
