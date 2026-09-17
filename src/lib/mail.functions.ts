import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { myInstitution, type Ctx } from "./data.helpers";

/**
 * Internal mail. Everyone with an account (students, markers, staff, admins)
 * can write to anybody inside their own institution. Recipients are always
 * validated on the server against the sender's institution, so nothing sent by
 * the browser can reach another institution.
 */

const uuid = z.string().uuid();
export type MailFolder = "inbox" | "sent" | "drafts" | "archive" | "trash";

async function allowedRecipients(c: Ctx, ids: string[]): Promise<string[]> {
  const inst = await myInstitution(c);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("institution", inst)
    .in("id", ids);
  const ok = (data ?? []).map((p: any) => p.id as string).filter((id) => id !== c.userId);
  if (ok.length === 0) throw new Error("Choose at least one recipient at your own institution.");
  return ok;
}

async function decorate(c: Ctx, rows: any[]) {
  if (rows.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const people = new Set<string>();
  for (const m of rows) {
    people.add(m.sender_id);
    for (const r of m.recipients ?? []) people.add(r.recipient_id);
  }
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...people]);
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((m) => ({
    ...m,
    sender: byId.get(m.sender_id) ?? null,
    recipients: (m.recipients ?? []).map((r: any) => ({ ...r, person: byId.get(r.recipient_id) ?? null })),
  }));
}

const MESSAGE_SELECT =
  "id, thread_id, parent_id, sender_id, subject, body, is_draft, sender_folder, sender_starred, sent_at, created_at, recipients:message_recipients(id, recipient_id, kind, folder, read_at, is_starred)";

/** One mailbox folder for the signed-in user. */
export const listMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]),
        search: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    let query = c.supabase.from("messages").select(MESSAGE_SELECT).order("created_at", { ascending: false }).limit(200);

    if (data.folder === "drafts") {
      query = query.eq("sender_id", c.userId).eq("is_draft", true);
    } else if (data.folder === "sent") {
      query = query.eq("sender_id", c.userId).eq("is_draft", false).eq("sender_folder", "sent");
    } else {
      query = query.eq("is_draft", false);
    }

    if (data.search) query = query.or(`subject.ilike.%${data.search}%,body.ilike.%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let list = rows ?? [];
    if (data.folder === "inbox" || data.folder === "archive") {
      list = list.filter((m: any) =>
        (m.recipients ?? []).some(
          (r: any) => r.recipient_id === c.userId && r.folder === data.folder,
        ),
      );
    } else if (data.folder === "trash") {
      list = list.filter(
        (m: any) =>
          (m.sender_id === c.userId && m.sender_folder === "trash") ||
          (m.recipients ?? []).some((r: any) => r.recipient_id === c.userId && r.folder === "trash"),
      );
    }

    return decorate(c, list);
  });

export const unreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const { count, error } = await c.supabase
      .from("message_recipients")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", c.userId)
      .eq("folder", "inbox")
      .is("read_at", null);
    if (error) return { count: 0 };
    return { count: count ?? 0 };
  });

/** Every message of one conversation the user is part of. */
export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ thread_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { data: rows, error } = await c.supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return decorate(c, rows ?? []);
  });

const composeInput = z.object({
  draft_id: uuid.optional(),
  to: z.array(uuid).max(200),
  cc: z.array(uuid).max(200).optional(),
  subject: z.string().trim().max(200),
  body: z.string().max(20000),
  thread_id: uuid.optional(),
  parent_id: uuid.optional(),
  as_draft: z.boolean().optional(),
});

/** Send a message, or save it as a draft when as_draft is true. */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => composeInput.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const asDraft = data.as_draft === true;
    const to = data.to.length > 0 ? await allowedRecipients(c, data.to) : [];
    const cc = data.cc && data.cc.length > 0 ? await allowedRecipients(c, data.cc) : [];
    if (!asDraft && to.length === 0)
      throw new Error("Choose at least one recipient at your own institution.");

    const payload: Record<string, unknown> = {
      sender_id: c.userId,
      subject: data.subject || "(no subject)",
      body: data.body,
      is_draft: asDraft,
      sent_at: asDraft ? null : new Date().toISOString(),
    };
    if (data.thread_id) payload["thread_id"] = data.thread_id;
    if (data.parent_id) payload["parent_id"] = data.parent_id;

    let messageId = data.draft_id ?? null;
    if (messageId) {
      const { error } = await c.supabase
        .from("messages")
        .update(payload)
        .eq("id", messageId)
        .eq("sender_id", c.userId);
      if (error) throw new Error(error.message);
      await c.supabase.from("message_recipients").delete().eq("message_id", messageId);
    } else {
      const { data: created, error } = await c.supabase
        .from("messages")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      messageId = created.id as string;
    }

    const rows = [
      ...to.map((id) => ({ message_id: messageId, recipient_id: id, kind: "to" })),
      ...cc.filter((id) => !to.includes(id)).map((id) => ({ message_id: messageId, recipient_id: id, kind: "cc" })),
    ];
    if (rows.length > 0) {
      const { error } = await c.supabase.from("message_recipients").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { id: messageId as string };
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ message_ids: z.array(uuid).min(1).max(200), read: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { error } = await c.supabase
      .from("message_recipients")
      .update({ read_at: data.read ? new Date().toISOString() : null })
      .eq("recipient_id", c.userId)
      .in("message_id", data.message_ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ message_id: uuid, starred: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { data: mine } = await c.supabase
      .from("message_recipients")
      .select("id")
      .eq("recipient_id", c.userId)
      .eq("message_id", data.message_id)
      .maybeSingle();
    if (mine) {
      await c.supabase
        .from("message_recipients")
        .update({ is_starred: data.starred })
        .eq("id", mine.id);
    } else {
      await c.supabase
        .from("messages")
        .update({ sender_starred: data.starred })
        .eq("id", data.message_id)
        .eq("sender_id", c.userId);
    }
    return { ok: true };
  });

/** Move the user's own copy of a message between folders. */
export const moveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        message_ids: z.array(uuid).min(1).max(200),
        folder: z.enum(["inbox", "archive", "trash"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await c.supabase
      .from("message_recipients")
      .update({ folder: data.folder })
      .eq("recipient_id", c.userId)
      .in("message_id", data.message_ids);
    await c.supabase
      .from("messages")
      .update({ sender_folder: data.folder === "trash" ? "trash" : "sent" })
      .eq("sender_id", c.userId)
      .in("id", data.message_ids);
    return { ok: true };
  });

/** Permanently remove a draft, or a message the user sent. */
export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ message_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    const { error } = await c.supabase
      .from("messages")
      .delete()
      .eq("id", data.message_id)
      .eq("sender_id", c.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
