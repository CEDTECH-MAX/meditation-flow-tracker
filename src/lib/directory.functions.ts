import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, audit, myInstitution, type Ctx } from "./data.helpers";

/**
 * Staff directory. Administrators name the departments themselves and add the
 * people working at their institution (MII or MIU). Every staff member gets a
 * sign-in account with a temporary password so they can use the internal mail
 * and change their own password afterwards.
 *
 * Institution separation is enforced on the server: the institution is always
 * re-derived from the signed-in administrator's own profile.
 */

const uuid = z.string().uuid();

/* ------------------------------ departments ------------------------------ */

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const inst = await myInstitution(c);
    const { data, error } = await c.supabase
      .from("departments")
      .select("*")
      .eq("institution", inst)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "Give the department a name").max(120),
        description: z.string().trim().max(400).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const payload = {
      name: data.name,
      description: data.description || null,
      institution: await myInstitution(c),
    };
    const { data: created, error } = await c.supabase
      .from("departments")
      .insert(payload)
      .select("id")
      .single();
    if (error)
      throw new Error(
        error.code === "23505" ? "That department already exists." : error.message,
      );
    await audit(c, "create", "department", created.id, payload);
    return { id: created.id as string };
  });

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(400).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { error } = await c.supabase
      .from("departments")
      .update({ name: data.name, description: data.description || null })
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    await audit(c, "update", "department", data.id, { name: data.name });
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { error } = await c.supabase
      .from("departments")
      .delete()
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    await audit(c, "delete", "department", data.id, {});
    return { ok: true };
  });

/* --------------------------------- staff --------------------------------- */

async function staffIds(c: Ctx): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "staff");
  return (data ?? []).map((r: any) => r.user_id as string);
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const ids = await staffIds(c);
    if (ids.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, job_title, staff_id, is_active, photo_url, department_id, department:departments(id,name)")
      .eq("institution", inst)
      .in("id", ids)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const nameField = z.string().trim().min(1, "Required").max(60);
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .email("Please enter a complete email address, for example thabo@example.com");

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        first_name: nameField,
        surname: nameField,
        email: emailField,
        password: z.string().min(8, "Use at least 8 characters").max(72),
        department_id: uuid,
        job_title: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dept } = await supabaseAdmin
      .from("departments")
      .select("id")
      .eq("id", data.department_id)
      .eq("institution", inst)
      .maybeSingle();
    if (!dept) throw new Error("Choose a department of your own institution.");

    const fullName = `${data.first_name} ${data.surname}`.trim();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user)
      throw new Error(
        error?.message?.includes("already been registered")
          ? "That email address already has an account."
          : (error?.message ?? "Could not create the account"),
      );

    const id = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id,
      full_name: fullName,
      email: data.email,
      job_title: data.job_title || null,
      department_id: data.department_id,
      institution: inst,
      is_active: true,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error(pErr.message);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "staff" });
    await audit(c, "create", "staff", id, { email: data.email, department_id: data.department_id });
    return { id };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        first_name: nameField,
        surname: nameField,
        department_id: uuid,
        job_title: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: `${data.first_name} ${data.surname}`.trim(),
        department_id: data.department_id,
        job_title: data.job_title || null,
      })
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    await audit(c, "update", "staff", data.id, { department_id: data.department_id });
    return { ok: true };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    await audit(c, data.is_active ? "activate" : "deactivate", "staff", data.id, {});
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.id)
      .eq("institution", inst)
      .maybeSingle();
    if (!profile) throw new Error("That account is outside your institution.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await audit(c, "reset_password", "staff", data.id, {});
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.id)
      .eq("institution", inst)
      .maybeSingle();
    if (!profile) throw new Error("That account is outside your institution.");
    await supabaseAdmin.auth.admin.deleteUser(data.id);
    await audit(c, "delete", "staff", data.id, {});
    return { ok: true };
  });

/**
 * Saves (or clears) the photo of anyone in the administrator's own institution.
 * The file itself is uploaded to the private photo area by the browser; only the
 * stored path is recorded here.
 */
export const setPersonPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        photo_url: z.string().trim().max(500).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.id)
      .eq("institution", inst)
      .maybeSingle();
    if (!profile) throw new Error("That person is outside your institution.");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ photo_url: data.photo_url || null })
      .eq("id", data.id)
      .eq("institution", inst);
    if (error) throw new Error(error.message);
    await audit(c, data.photo_url ? "set_photo" : "clear_photo", "profile", data.id, {});
    return { ok: true };
  });

/* ------------------------- address book (everyone) ------------------------ */

export type DirectoryEntry = {
  id: string;
  full_name: string;
  email: string | null;
  role: "admin" | "staff" | "marker" | "student";
  department: string | null;
  job_title: string | null;
  cohort: string | null;
};

/**
 * The people a signed-in user may write to: everyone inside their own
 * institution. Only names, roles and departments are exposed.
 */
export const listDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx;
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, full_name, email, job_title, is_active, department:departments(name), cohort:cohorts(name)",
        )
        .eq("institution", inst)
        .order("full_name", { ascending: true }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    const roleOf = new Map<string, DirectoryEntry["role"]>();
    for (const r of roles ?? []) {
      const current = roleOf.get(r.user_id as string);
      const next = r.role as DirectoryEntry["role"];
      const rank = { admin: 4, staff: 3, marker: 2, student: 1 } as Record<string, number>;
      if (!current || (rank[next] ?? 0) > (rank[current] ?? 0)) roleOf.set(r.user_id as string, next);
    }

    return (profiles ?? [])
      .filter((p: any) => p.is_active !== false)
      .map((p: any) => ({
        id: p.id as string,
        full_name: p.full_name as string,
        email: (p.email as string) ?? null,
        role: roleOf.get(p.id as string) ?? "student",
        department: p.department?.name ?? null,
        job_title: (p.job_title as string) ?? null,
        cohort: p.cohort?.name ?? null,
      })) as DirectoryEntry[];
  });
