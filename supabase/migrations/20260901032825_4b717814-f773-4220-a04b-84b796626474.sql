-- 1. new roles (enum values must be added before use in later statements)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marker';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'head_of_meditation';

-- 2. helper: role check by text so this migration never casts a brand-new enum literal
CREATE OR REPLACE FUNCTION public.has_role_text(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
$$;

-- 3. block-level calculation configuration (no hard-coded session counts)
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS session_point_value numeric(6,3) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS weekly_required_points numeric(6,3) NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS weekly_reference_points numeric(6,3) NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS friday_pm_compulsory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saturday_mode text NOT NULL DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS precision_digits integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS schedule jsonb,
  ADD COLUMN IF NOT EXISTS schedule_source text;

-- 4. raw attendance provenance (never overwrite the original event)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS week_index integer,
  ADD COLUMN IF NOT EXISTS is_compulsory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS session_point_value numeric(6,3) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS marked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS marking_session_id uuid;

ALTER TABLE public.attendance
  ALTER COLUMN points TYPE numeric(6,3);

-- 5. staff fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_id text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 6. marker assignments
CREATE TABLE IF NOT EXISTS public.marker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE CASCADE,
  classification public.student_classification,
  gender public.student_gender,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marker_assignments TO authenticated;
GRANT ALL ON public.marker_assignments TO service_role;
ALTER TABLE public.marker_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marker assignments admin write" ON public.marker_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "marker assignments readable" ON public.marker_assignments FOR SELECT TO authenticated
  USING (
    marker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role_text(auth.uid(), 'head_of_meditation')
  );
CREATE TRIGGER marker_assignments_touch BEFORE UPDATE ON public.marker_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. can this marker mark this student? (single server-side authority)
CREATE OR REPLACE FUNCTION public.marker_can_mark_student(_marker_id uuid, _student_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.marker_assignments a
    JOIN public.profiles p ON p.id = _student_id
    WHERE a.marker_id = _marker_id
      AND a.is_active
      AND (a.cohort_id IS NULL OR a.cohort_id = p.cohort_id)
      AND (a.classification IS NULL OR a.classification = p.classification)
      AND (a.gender IS NULL OR a.gender = p.gender)
      AND (a.block_id IS NULL OR a.block_id = _block_id)
  )
$$;

-- 8. marking sessions (30-minute window)
CREATE TABLE IF NOT EXISTS public.marking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  slot public.session_slot NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  completed_at timestamptz,
  locked_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marking_sessions TO authenticated;
GRANT ALL ON public.marking_sessions TO service_role;
ALTER TABLE public.marking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marking sessions admin write" ON public.marking_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "marking sessions own insert" ON public.marking_sessions FOR INSERT TO authenticated
  WITH CHECK (marker_id = auth.uid() AND public.has_role_text(auth.uid(), 'marker'));
CREATE POLICY "marking sessions own update" ON public.marking_sessions FOR UPDATE TO authenticated
  USING (marker_id = auth.uid()) WITH CHECK (marker_id = auth.uid());
CREATE POLICY "marking sessions readable" ON public.marking_sessions FOR SELECT TO authenticated
  USING (
    marker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role_text(auth.uid(), 'head_of_meditation')
  );
CREATE TRIGGER marking_sessions_touch BEFORE UPDATE ON public.marking_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_marking_session_fkey
  FOREIGN KEY (marking_session_id) REFERENCES public.marking_sessions(id) ON DELETE SET NULL;

-- 9. marker presence / heartbeat
CREATE TABLE IF NOT EXISTS public.marker_presence (
  marker_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  activity text NOT NULL DEFAULT 'idle',
  current_block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  current_cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.marker_presence TO authenticated;
GRANT ALL ON public.marker_presence TO service_role;
ALTER TABLE public.marker_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence own upsert" ON public.marker_presence FOR INSERT TO authenticated
  WITH CHECK (marker_id = auth.uid());
CREATE POLICY "presence own update" ON public.marker_presence FOR UPDATE TO authenticated
  USING (marker_id = auth.uid()) WITH CHECK (marker_id = auth.uid());
CREATE POLICY "presence readable" ON public.marker_presence FOR SELECT TO authenticated
  USING (
    marker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role_text(auth.uid(), 'head_of_meditation')
  );
CREATE TRIGGER marker_presence_touch BEFORE UPDATE ON public.marker_presence
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 10. role administration (previously no INSERT/DELETE path existed)
CREATE POLICY "roles admin insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "roles admin delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 11. markers and Head of Meditation can read the students they oversee
CREATE POLICY "profiles marker select" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.has_role_text(auth.uid(), 'head_of_meditation')
    OR public.marker_can_mark_student(auth.uid(), id, NULL)
  );

-- 12. markers may record attendance only for assigned students, inside an open session
CREATE POLICY "attendance marker select" ON public.attendance FOR SELECT TO authenticated
  USING (
    public.has_role_text(auth.uid(), 'head_of_meditation')
    OR public.marker_can_mark_student(auth.uid(), student_id, block_id)
  );
CREATE POLICY "attendance marker insert" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND public.marker_can_mark_student(auth.uid(), student_id, block_id)
    AND EXISTS (
      SELECT 1 FROM public.marking_sessions s
      WHERE s.id = marking_session_id AND s.marker_id = auth.uid()
        AND s.status = 'open' AND s.locked_at IS NULL AND s.expires_at > now()
    )
  );
CREATE POLICY "attendance marker update" ON public.attendance FOR UPDATE TO authenticated
  USING (
    public.marker_can_mark_student(auth.uid(), student_id, block_id)
    AND EXISTS (
      SELECT 1 FROM public.marking_sessions s
      WHERE s.id = attendance.marking_session_id AND s.marker_id = auth.uid()
        AND s.status = 'open' AND s.locked_at IS NULL AND s.expires_at > now()
    )
  )
  WITH CHECK (public.marker_can_mark_student(auth.uid(), student_id, block_id));

-- 13. blocks / cohorts remain readable to every signed-in account (markers included)

-- 14. audit trail readable by Head of Meditation as well
CREATE POLICY "audit head read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role_text(auth.uid(), 'head_of_meditation'));
CREATE POLICY "audit marker insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- 15. backfill provenance on existing rows without touching recorded points
UPDATE public.attendance a
SET session_point_value = 2,
    is_compulsory = CASE
      WHEN extract(dow from a.session_date) = 6 THEN false            -- Saturday: extra
      WHEN extract(dow from a.session_date) = 5 AND a.slot = 'afternoon' THEN false -- Friday PM: optional
      WHEN extract(dow from a.session_date) = 0 THEN false            -- Sunday: none
      ELSE true
    END,
    week_index = COALESCE(a.week_index, 1 + floor(
      (a.session_date - (b.start_date - ((CASE WHEN extract(dow from b.start_date) = 0 THEN 7 ELSE extract(dow from b.start_date) END - 1)::int))) / 7
    )::int)
FROM public.blocks b
WHERE b.id = a.block_id;

-- 16. index support for the new lookups
CREATE INDEX IF NOT EXISTS marker_assignments_marker_idx ON public.marker_assignments(marker_id);
CREATE INDEX IF NOT EXISTS marking_sessions_marker_idx ON public.marking_sessions(marker_id, session_date);
CREATE INDEX IF NOT EXISTS attendance_block_student_idx ON public.attendance(block_id, student_id);