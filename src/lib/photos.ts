import { supabase } from "@/integrations/supabase/client";

/**
 * Directory photos live in a private storage area, so they are shown through
 * short-lived signed links. `photo_url` on a profile holds the file path.
 */
export const PHOTO_BUCKET = "directory-photos";

const cache = new Map<string, { url: string; until: number }>();

export async function photoLink(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, until: Date.now() + 45 * 60 * 1000 });
  return data.signedUrl;
}

/** Uploads a photo for a person and returns its storage path. */
export async function uploadPhoto(personId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${personId}/${Date.now()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""))
    .toUpperCase();
}
