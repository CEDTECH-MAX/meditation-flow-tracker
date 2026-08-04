export type Ctx = { supabase: any; userId: string; claims: Record<string, any> };

export async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: administrators only");
}

export async function audit(
  context: Ctx,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await context.supabase.from("audit_logs").insert({
    actor_id: context.userId,
    actor_email: (context.claims?.["email"] as string) ?? null,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}
