import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, audit, myInstitution, type Ctx } from "./data.helpers";

const weekInput = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** The week must be a Monday whose Saturday has already passed. */
function assertCompletedMonday(monday: string) {
  const d = new Date(monday + "T00:00:00");
  if (Number.isNaN(d.getTime()) || d.getDay() !== 1) throw new Error("Choose a week starting on a Monday.");
  const sat = new Date(d);
  sat.setDate(sat.getDate() + 5);
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }),
  );
  today.setHours(0, 0, 0, 0);
  if (sat >= today) throw new Error("That week has not finished yet.");
}

export const previewWeeklyTargetNotices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => weekInput.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    assertCompletedMonday(data.week_start);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findFlaggedStudents, weekPeriodLabel } = await import("./weekly-notices.server");
    const result = await findFlaggedStudents(supabaseAdmin, inst, data.week_start);
    return { ...result, institution: inst, period: weekPeriodLabel(data.week_start) };
  });

export const sendWeeklyTargetNotices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    weekInput.extend({ student_ids: z.array(z.string().uuid()).max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx;
    await assertAdmin(c);
    assertCompletedMonday(data.week_start);
    const inst = await myInstitution(c);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWeeklyNotices } = await import("./weekly-notices.server");
    const result = await sendWeeklyNotices(supabaseAdmin, inst, data.week_start, data.student_ids);
    await audit(c, "send_weekly_target_notices", "email", null, {
      institution: inst,
      week_start: data.week_start,
      ...result,
    });
    return result;
  });
